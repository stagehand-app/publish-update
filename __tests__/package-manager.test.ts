import { describe, expect, it } from '@jest/globals'

import { detectPackageManager } from '../src/package-manager.js'

const seenWith =
  (files: string[]): ((path: string) => boolean) =>
  (path: string) =>
    files.some((f) => path.endsWith(f))

describe('detectPackageManager', () => {
  it('detects bun when only the Bun 1.2+ text-format bun.lock is present', () => {
    const spec = detectPackageManager('/work', seenWith(['bun.lock']))
    expect(spec.name).toBe('bun')
    expect(spec.installArgs).toEqual(['install', '--frozen-lockfile'])
  })

  it('prefers bun when bun.lockb is present', () => {
    const spec = detectPackageManager(
      '/work',
      seenWith(['bun.lockb', 'package-lock.json'])
    )
    expect(spec.name).toBe('bun')
    expect(spec.installArgs).toEqual(['install', '--frozen-lockfile'])
  })

  it('prefers bun over pnpm/yarn/npm when all four lockfiles exist', () => {
    const spec = detectPackageManager(
      '/work',
      seenWith([
        'bun.lock',
        'bun.lockb',
        'pnpm-lock.yaml',
        'yarn.lock',
        'package-lock.json'
      ])
    )
    expect(spec.name).toBe('bun')
  })

  it('falls back to pnpm when only pnpm-lock.yaml is present', () => {
    const spec = detectPackageManager('/work', seenWith(['pnpm-lock.yaml']))
    expect(spec.name).toBe('pnpm')
    expect(spec.installArgs).toEqual(['install', '--frozen-lockfile'])
  })

  it('falls back to yarn when only yarn.lock is present', () => {
    const spec = detectPackageManager('/work', seenWith(['yarn.lock']))
    expect(spec.name).toBe('yarn')
    expect(spec.installArgs).toEqual(['install', '--frozen-lockfile'])
  })

  it('uses `npm ci` when only package-lock.json is present', () => {
    const spec = detectPackageManager('/work', seenWith(['package-lock.json']))
    expect(spec.name).toBe('npm')
    expect(spec.installArgs).toEqual(['ci'])
  })

  it('defaults to `npm install` when no lockfile is present', () => {
    const spec = detectPackageManager('/work', () => false)
    expect(spec.name).toBe('npm')
    expect(spec.installArgs).toEqual(['install'])
  })
})
