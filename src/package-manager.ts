import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm'

export interface PackageManagerSpec {
  name: PackageManager
  installArgs: readonly string[]
}

const PRIORITY: ReadonlyArray<{
  file: string
  spec: PackageManagerSpec
}> = [
  {
    file: 'bun.lockb',
    spec: { name: 'bun', installArgs: ['install', '--frozen-lockfile'] }
  },
  {
    file: 'pnpm-lock.yaml',
    spec: { name: 'pnpm', installArgs: ['install', '--frozen-lockfile'] }
  },
  {
    file: 'yarn.lock',
    spec: { name: 'yarn', installArgs: ['install', '--frozen-lockfile'] }
  },
  {
    file: 'package-lock.json',
    spec: { name: 'npm', installArgs: ['ci'] }
  }
]

export const detectPackageManager = (
  workspace: string,
  fileExists: (path: string) => boolean = existsSync
): PackageManagerSpec => {
  for (const entry of PRIORITY) {
    if (fileExists(join(workspace, entry.file))) return entry.spec
  }
  return { name: 'npm', installArgs: ['install'] }
}
