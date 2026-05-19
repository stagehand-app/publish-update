import { describe, expect, it, jest } from '@jest/globals'

import {
  ensurePackageManager,
  type EnsurePackageManagerDeps,
  type ExecFn
} from '../src/ensure-package-manager.js'

const makeDeps = (
  execImpl: ExecFn
): {
  deps: EnsurePackageManagerDeps
  addPath: jest.Mock<(p: string) => void>
} => {
  const addPath = jest.fn<(p: string) => void>()
  return {
    deps: {
      exec: execImpl,
      addPath,
      homeDir: () => '/home/runner'
    },
    addPath
  }
}

describe('ensurePackageManager', () => {
  it('is a no-op for npm', async () => {
    const exec = jest.fn<ExecFn>()
    const { deps, addPath } = makeDeps(exec)
    await ensurePackageManager('npm', deps)
    expect(exec).not.toHaveBeenCalled()
    expect(addPath).not.toHaveBeenCalled()
  })

  it('skips install when bun is already on PATH', async () => {
    const exec = jest.fn<ExecFn>().mockResolvedValueOnce(0)
    const { deps, addPath } = makeDeps(exec)
    await ensurePackageManager('bun', deps)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith('bun', ['--version'], {
      silent: true,
      ignoreReturnCode: true
    })
    expect(addPath).not.toHaveBeenCalled()
  })

  it('installs bun via the upstream installer and adds ~/.bun/bin to PATH when missing', async () => {
    const exec = jest
      .fn<ExecFn>()
      .mockResolvedValueOnce(127)
      .mockResolvedValueOnce(0)
    const { deps, addPath } = makeDeps(exec)
    await ensurePackageManager('bun', deps)
    expect(exec).toHaveBeenCalledTimes(2)
    expect(exec.mock.calls[1]).toEqual([
      'bash',
      ['-c', 'curl -fsSL https://bun.sh/install | bash']
    ])
    expect(addPath).toHaveBeenCalledWith('/home/runner/.bun/bin')
  })

  it('installs pnpm globally via npm when missing', async () => {
    const exec = jest
      .fn<ExecFn>()
      .mockResolvedValueOnce(127)
      .mockResolvedValueOnce(0)
    const { deps, addPath } = makeDeps(exec)
    await ensurePackageManager('pnpm', deps)
    expect(exec).toHaveBeenCalledTimes(2)
    expect(exec.mock.calls[1]).toEqual(['npm', ['install', '-g', 'pnpm']])
    expect(addPath).not.toHaveBeenCalled()
  })

  it('installs yarn globally via npm when missing', async () => {
    const exec = jest
      .fn<ExecFn>()
      .mockResolvedValueOnce(127)
      .mockResolvedValueOnce(0)
    const { deps, addPath } = makeDeps(exec)
    await ensurePackageManager('yarn', deps)
    expect(exec).toHaveBeenCalledTimes(2)
    expect(exec.mock.calls[1]).toEqual(['npm', ['install', '-g', 'yarn']])
    expect(addPath).not.toHaveBeenCalled()
  })
})
