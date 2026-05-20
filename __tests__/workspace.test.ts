import { describe, expect, it } from '@jest/globals'

import { resolveWorkspace } from '../src/workspace.js'

describe('resolveWorkspace', () => {
  it('returns the checkout root when no working directory is given', () => {
    expect(resolveWorkspace('/work', undefined)).toBe('/work')
    expect(resolveWorkspace('/work', '')).toBe('/work')
    expect(resolveWorkspace('/work', '   ')).toBe('/work')
  })

  it('resolves a relative working directory against the checkout root', () => {
    expect(resolveWorkspace('/work', 'apps/mobile')).toBe('/work/apps/mobile')
    expect(resolveWorkspace('/work', './apps/mobile')).toBe('/work/apps/mobile')
  })

  it('honors an absolute working directory verbatim', () => {
    expect(resolveWorkspace('/work', '/somewhere/else')).toBe('/somewhere/else')
  })

  it('trims surrounding whitespace before resolving', () => {
    expect(resolveWorkspace('/work', '  apps/mobile  ')).toBe(
      '/work/apps/mobile'
    )
  })
})
