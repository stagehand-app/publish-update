import * as core from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'

import {
  parseEasUpdateJson,
  postPublishedUpdate,
  PublishUpdateError,
  vendExpoToken,
  VendError
} from './api-client.js'
import { detectPackageManager } from './package-manager.js'

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

export const run = async (): Promise<void> => {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const apiBase = readInput('stagehand-api-base') || DEFAULT_API_BASE
  const projectId = readInput('project-id', { required: true })
  const stagehandToken = readInput('stagehand-token', { required: true })
  const dryRun = process.env.STAGEHAND_DRY_RUN === 'true'

  const pm = detectPackageManager(workspace)
  core.info(`Detected package manager: ${pm.name}`)

  await exec(pm.name, [...pm.installArgs], { cwd: workspace })

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
    core.info('STAGEHAND_DRY_RUN=true; skipping `eas update --auto`.')
    return
  }

  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  const sha = process.env.GITHUB_SHA ?? ''
  const isDefaultBranch = eventName === 'push'

  const updateOutput = await getExecOutput(
    'npx',
    [
      '--yes',
      'eas-cli@latest',
      'update',
      '--auto',
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
