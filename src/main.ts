import * as core from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'

import {
  parseEasUpdateJson,
  postPublishedUpdate,
  PublishUpdateError,
  vendExpoToken,
  VendError
} from './api-client.js'
import { ensurePackageManager } from './ensure-package-manager.js'
import { detectPackageManager } from './package-manager.js'
import { resolveWorkspace } from './workspace.js'

const DEFAULT_API_BASE = 'https://api.stagehand.app'

const readInput = (name: string, opts: { required?: boolean } = {}): string => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return core.getInput(name, opts)
  }
  const envName = `INPUT_${name.replace(/-/g, '_').toUpperCase()}`
  const raw = process.env[envName] ?? ''
  if (opts.required === true && raw.length === 0) {
    throw new Error(`Input ${name} is required`)
  }
  return raw
}

export const resolveBranchName = (
  env: NodeJS.ProcessEnv = process.env
): string => {
  const headRef = env.GITHUB_HEAD_REF ?? ''
  if (headRef.length > 0) return headRef
  const refName = env.GITHUB_REF_NAME ?? ''
  if (refName.length > 0) return refName
  throw new Error(
    'Unable to resolve git branch — set GITHUB_REF_NAME or GITHUB_HEAD_REF'
  )
}

const MESSAGE_MAX_LENGTH = 1024

const truncateMessage = (raw: string): string => {
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  return cleaned.length > MESSAGE_MAX_LENGTH
    ? cleaned.slice(0, MESSAGE_MAX_LENGTH)
    : cleaned
}

export const resolveUpdateMessage = async (opts: {
  inputMessage: string
  checkoutRoot: string
  sha: string
  gitSubject?: () => Promise<string>
}): Promise<string> => {
  const inputMessage = truncateMessage(opts.inputMessage)
  if (inputMessage.length > 0) return inputMessage

  const readGitSubject =
    opts.gitSubject ??
    (async () => {
      const result = await getExecOutput('git', ['log', '-1', '--pretty=%s'], {
        cwd: opts.checkoutRoot,
        silent: true,
        ignoreReturnCode: true
      })
      return result.exitCode === 0 ? result.stdout : ''
    })

  try {
    const subject = truncateMessage(await readGitSubject())
    if (subject.length > 0) return subject
  } catch {
    // fall through to SHA fallback
  }

  const sha = opts.sha.trim()
  if (sha.length > 0) return `Update ${sha.slice(0, 7)}`
  return 'Stagehand update'
}

export const run = async (): Promise<void> => {
  const checkoutRoot = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const workingDirInput = readInput('working-directory')
  const workspace = resolveWorkspace(checkoutRoot, workingDirInput)
  if (workspace !== checkoutRoot) {
    core.info(`Using working directory: ${workspace}`)
  }
  const apiBase = readInput('stagehand-api-base') || DEFAULT_API_BASE
  const projectId = readInput('project-id', { required: true })
  const stagehandToken = readInput('stagehand-token', { required: true })
  const dryRun = process.env.STAGEHAND_DRY_RUN === 'true'

  const pm = detectPackageManager(checkoutRoot)
  core.info(`Detected package manager: ${pm.name}`)

  await ensurePackageManager(pm.name)

  await exec(pm.name, [...pm.installArgs], { cwd: checkoutRoot })

  let expoToken: string
  try {
    expoToken = await vendExpoToken({ apiBase, projectId, stagehandToken })
  } catch (err) {
    if (err instanceof VendError) {
      core.setFailed(
        `Stagehand vending endpoint failed: ${err.message} (code=${err.errorCode ?? 'unknown'})`
      )
      return
    }
    throw err
  }

  core.setSecret(expoToken)

  if (dryRun) {
    core.info('STAGEHAND_DRY_RUN=true; skipping `eas update`.')
    return
  }

  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  const sha = process.env.GITHUB_SHA ?? ''
  const isDefaultBranch = eventName === 'push'
  const branchName = resolveBranchName()
  core.info(`Resolved branch name: ${branchName}`)
  const updateMessage = await resolveUpdateMessage({
    inputMessage: readInput('message'),
    checkoutRoot,
    sha
  })
  core.info(`Update message: ${updateMessage}`)

  const updateOutput = await getExecOutput(
    'npx',
    [
      '--yes',
      'eas-cli@latest',
      'update',
      '--branch',
      branchName,
      '--message',
      updateMessage,
      '--non-interactive',
      '--json'
    ],
    { cwd: workspace, env: { ...process.env, EXPO_TOKEN: expoToken } }
  )

  if (updateOutput.exitCode !== 0) {
    core.setFailed(
      `eas update exited with code ${updateOutput.exitCode}: ${updateOutput.stderr}`
    )
    return
  }

  const records = parseEasUpdateJson(updateOutput.stdout)
  if (records.length === 0) {
    core.warning(
      'eas update --json returned no parseable update records; skipping Stagehand publish-update POST.'
    )
    return
  }

  if (sha.length === 0) {
    core.warning(
      'GITHUB_SHA env var is empty; skipping Stagehand publish-update POST.'
    )
    return
  }

  for (const record of records) {
    try {
      await postPublishedUpdate({
        apiBase,
        projectId,
        stagehandToken,
        payload: {
          branch: record.branch,
          sha,
          updateGroupId: record.group,
          runtimeVersion: record.runtimeVersion,
          platform: record.platform,
          isDefaultBranch
        }
      })
      core.info(
        `Recorded update group ${record.group} (${record.platform}) for branch ${record.branch}.`
      )
    } catch (err) {
      if (err instanceof PublishUpdateError) {
        core.setFailed(
          `Stagehand publish-update POST failed: ${err.message} (code=${err.errorCode ?? 'unknown'})`
        )
        return
      }
      throw err
    }
  }
}
