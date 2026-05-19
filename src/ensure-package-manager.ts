import * as core from '@actions/core'
import { exec as defaultExec } from '@actions/exec'
import { homedir } from 'node:os'

import type { PackageManager } from './package-manager.js'

export type ExecFn = (
  cmd: string,
  args?: string[],
  opts?: { silent?: boolean; ignoreReturnCode?: boolean }
) => Promise<number>

export interface EnsurePackageManagerDeps {
  exec: ExecFn
  addPath: (path: string) => void
  homeDir: () => string
}

const defaultDeps: EnsurePackageManagerDeps = {
  exec: defaultExec,
  addPath: core.addPath,
  homeDir: homedir
}

export const ensurePackageManager = async (
  pm: PackageManager,
  deps: EnsurePackageManagerDeps = defaultDeps
): Promise<void> => {
  if (pm === 'npm') return

  const probe = await deps.exec(pm, ['--version'], {
    silent: true,
    ignoreReturnCode: true
  })
  if (probe === 0) return

  if (pm === 'bun') {
    await deps.exec('bash', ['-c', 'curl -fsSL https://bun.sh/install | bash'])
    deps.addPath(`${deps.homeDir()}/.bun/bin`)
    return
  }

  await deps.exec('npm', ['install', '-g', pm])
}
