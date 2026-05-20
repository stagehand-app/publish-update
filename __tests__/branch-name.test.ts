import { describe, expect, it } from '@jest/globals'

import { resolveBranchName, resolveUpdateMessage } from '../src/main.js'

describe('resolveBranchName', () => {
  it('prefers GITHUB_HEAD_REF when both env vars are set (pull_request events)', () => {
    expect(
      resolveBranchName({
        GITHUB_HEAD_REF: 'feat/from-pr',
        GITHUB_REF_NAME: 'main'
      })
    ).toBe('feat/from-pr')
  })

  it('returns GITHUB_REF_NAME when GITHUB_HEAD_REF is empty (push/release/workflow_dispatch)', () => {
    expect(
      resolveBranchName({
        GITHUB_HEAD_REF: '',
        GITHUB_REF_NAME: 'main'
      })
    ).toBe('main')
  })

  it('returns GITHUB_HEAD_REF when GITHUB_REF_NAME is missing', () => {
    expect(
      resolveBranchName({
        GITHUB_HEAD_REF: 'feat/x'
      })
    ).toBe('feat/x')
  })

  it('throws a descriptive error when neither env var is set', () => {
    expect(() => resolveBranchName({})).toThrow(
      /Unable to resolve git branch — set GITHUB_REF_NAME or GITHUB_HEAD_REF/
    )
  })

  it('treats empty-string env values as missing', () => {
    expect(() =>
      resolveBranchName({ GITHUB_HEAD_REF: '', GITHUB_REF_NAME: '' })
    ).toThrow(/Unable to resolve git branch/)
  })
})

describe('resolveUpdateMessage', () => {
  it('returns the input message when one is provided', async () => {
    const result = await resolveUpdateMessage({
      inputMessage: 'Manual override message',
      checkoutRoot: '/work',
      sha: 'deadbeefcafe',
      gitSubject: async () => 'should-not-be-used'
    })
    expect(result).toBe('Manual override message')
  })

  it('falls back to the latest commit subject when no input is given', async () => {
    const result = await resolveUpdateMessage({
      inputMessage: '',
      checkoutRoot: '/work',
      sha: 'deadbeefcafe',
      gitSubject: async () => 'feat: add resolveBranchName helper\n'
    })
    expect(result).toBe('feat: add resolveBranchName helper')
  })

  it('falls back to the short SHA prefix when git returns nothing', async () => {
    const result = await resolveUpdateMessage({
      inputMessage: '',
      checkoutRoot: '/work',
      sha: 'deadbeefcafe1234',
      gitSubject: async () => ''
    })
    expect(result).toBe('Update deadbee')
  })

  it('falls back to a generic label when both git and SHA are empty', async () => {
    const result = await resolveUpdateMessage({
      inputMessage: '',
      checkoutRoot: '/work',
      sha: '',
      gitSubject: async () => ''
    })
    expect(result).toBe('Stagehand update')
  })

  it('falls back to the SHA when git subject lookup throws', async () => {
    const result = await resolveUpdateMessage({
      inputMessage: '',
      checkoutRoot: '/work',
      sha: 'abc1234567',
      gitSubject: async () => {
        throw new Error('git unavailable')
      }
    })
    expect(result).toBe('Update abc1234')
  })

  it('collapses whitespace and truncates very long messages', async () => {
    const long = 'a'.repeat(2000)
    const result = await resolveUpdateMessage({
      inputMessage: `   ${long}   `,
      checkoutRoot: '/work',
      sha: 'x',
      gitSubject: async () => ''
    })
    expect(result.length).toBe(1024)
    expect(result).toBe('a'.repeat(1024))
  })
})
