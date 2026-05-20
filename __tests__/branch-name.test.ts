import { describe, expect, it } from '@jest/globals'

import { resolveBranchName } from '../src/main.js'

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
