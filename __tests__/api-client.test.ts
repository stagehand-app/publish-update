import { describe, expect, it } from '@jest/globals'

import {
  parseEasUpdateJson,
  postPublishedUpdate,
  PublishUpdateError,
  vendExpoToken,
  VendError
} from '../src/api-client.js'

const stubFetch = (status: number, body: unknown): typeof fetch => {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body)
  return (async () =>
    new Response(bodyText, {
      status,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch
}

const captureError = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the promise to reject but it resolved')
}

describe('vendExpoToken', () => {
  it('returns the expoToken on a 200 response', async () => {
    const result = await vendExpoToken({
      apiBase: 'https://api.stagehand.app',
      projectId: '00000000-0000-0000-0000-000000000001',
      stagehandToken: 'st_proj_abc',
      fetchImpl: stubFetch(200, { expoToken: 'expo_pat_xyz' })
    })
    expect(result).toBe('expo_pat_xyz')
  })

  it('strips a trailing slash from apiBase before composing the URL', async () => {
    let capturedUrl = ''
    const captureFetch: typeof fetch = (async (input) => {
      capturedUrl = typeof input === 'string' ? input : input.toString()
      return new Response(JSON.stringify({ expoToken: 'ok' }), { status: 200 })
    }) as typeof fetch
    await vendExpoToken({
      apiBase: 'https://api.stagehand.app/',
      projectId: 'abc',
      stagehandToken: 'tok',
      fetchImpl: captureFetch
    })
    expect(capturedUrl).toBe(
      'https://api.stagehand.app/api/projects/abc/expo-token'
    )
  })

  it('throws VendError with errorCode on a 401', async () => {
    const err = await captureError(() =>
      vendExpoToken({
        apiBase: 'https://api.stagehand.app',
        projectId: 'id',
        stagehandToken: 'bad',
        fetchImpl: stubFetch(401, { error: 'invalid-token' })
      })
    )
    expect(err).toBeInstanceOf(VendError)
    expect((err as VendError).statusCode).toBe(401)
    expect((err as VendError).errorCode).toBe('invalid-token')
  })

  it('throws VendError with errorCode on a 403 project-mismatch', async () => {
    const err = await captureError(() =>
      vendExpoToken({
        apiBase: 'https://api.stagehand.app',
        projectId: 'id',
        stagehandToken: 'tok',
        fetchImpl: stubFetch(403, { error: 'project-mismatch' })
      })
    )
    expect(err).toBeInstanceOf(VendError)
    expect((err as VendError).statusCode).toBe(403)
    expect((err as VendError).errorCode).toBe('project-mismatch')
  })

  it('throws VendError when the body is not JSON', async () => {
    const err = await captureError(() =>
      vendExpoToken({
        apiBase: 'https://api.stagehand.app',
        projectId: 'id',
        stagehandToken: 'tok',
        fetchImpl: stubFetch(500, 'not json')
      })
    )
    expect(err).toBeInstanceOf(VendError)
    expect((err as VendError).errorCode).toBeNull()
  })

  it('throws when a 200 body is missing expoToken', async () => {
    const err = await captureError(() =>
      vendExpoToken({
        apiBase: 'https://api.stagehand.app',
        projectId: 'id',
        stagehandToken: 'tok',
        fetchImpl: stubFetch(200, { somethingElse: 'oops' })
      })
    )
    expect(err).toBeInstanceOf(VendError)
    expect((err as VendError).errorCode).toBeNull()
  })
})

describe('postPublishedUpdate', () => {
  it('POSTs the payload as JSON with a bearer header on success', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const captureFetch: typeof fetch = (async (input, init) => {
      capturedUrl = typeof input === 'string' ? input : input.toString()
      capturedInit = init
      return new Response('', { status: 200 })
    }) as typeof fetch

    await postPublishedUpdate({
      apiBase: 'https://api.stagehand.app',
      projectId: 'abc',
      stagehandToken: 'tok',
      payload: {
        branch: 'feat/x',
        sha: 'deadbeefcafe',
        updateGroupId: 'grp_1',
        runtimeVersion: '1.0.0',
        platform: 'all',
        isDefaultBranch: false
      },
      fetchImpl: captureFetch
    })

    expect(capturedUrl).toBe(
      'https://api.stagehand.app/api/projects/abc/updates'
    )
    expect(capturedInit?.method).toBe('POST')
    const headers = capturedInit?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer tok')
    expect(headers['content-type']).toBe('application/json')
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      branch: 'feat/x',
      sha: 'deadbeefcafe',
      updateGroupId: 'grp_1',
      runtimeVersion: '1.0.0',
      platform: 'all',
      isDefaultBranch: false
    })
  })

  it('throws PublishUpdateError with errorCode on a 401 invalid-token', async () => {
    const stub: typeof fetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid-token' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })) as unknown as typeof fetch
    const err = await captureError(() =>
      postPublishedUpdate({
        apiBase: 'https://api.stagehand.app',
        projectId: 'abc',
        stagehandToken: 'bad',
        payload: {
          branch: 'main',
          sha: 'abc',
          updateGroupId: 'g',
          runtimeVersion: '1',
          platform: 'ios'
        },
        fetchImpl: stub
      })
    )
    expect(err).toBeInstanceOf(PublishUpdateError)
    expect((err as PublishUpdateError).statusCode).toBe(401)
    expect((err as PublishUpdateError).errorCode).toBe('invalid-token')
  })
})

describe('parseEasUpdateJson', () => {
  it("returns one record per group with platform collapsed to 'all' for multi-platform groups", () => {
    const raw = JSON.stringify([
      {
        group: 'grp_1',
        branchName: 'feat/x',
        platform: 'ios',
        runtimeVersion: '1.0.0'
      },
      {
        group: 'grp_1',
        branchName: 'feat/x',
        platform: 'android',
        runtimeVersion: '1.0.0'
      }
    ])
    const records = parseEasUpdateJson(raw)
    expect(records).toEqual([
      {
        group: 'grp_1',
        branch: 'feat/x',
        platform: 'all',
        runtimeVersion: '1.0.0'
      }
    ])
  })

  it('preserves single-platform records', () => {
    const raw = JSON.stringify([
      {
        group: 'grp_2',
        branchName: 'main',
        platform: 'ios',
        runtimeVersion: '2.0.0'
      }
    ])
    expect(parseEasUpdateJson(raw)).toEqual([
      {
        group: 'grp_2',
        branch: 'main',
        platform: 'ios',
        runtimeVersion: '2.0.0'
      }
    ])
  })

  it('accepts the alternate `branch` key', () => {
    const raw = JSON.stringify([
      {
        group: 'grp_3',
        branch: 'feat/y',
        platform: 'android',
        runtimeVersion: '1.0.0'
      }
    ])
    expect(parseEasUpdateJson(raw)[0]?.branch).toBe('feat/y')
  })

  it('returns an empty list for non-JSON or non-array input', () => {
    expect(parseEasUpdateJson('not json')).toEqual([])
    expect(parseEasUpdateJson('{}')).toEqual([])
  })

  it('skips entries missing required fields', () => {
    const raw = JSON.stringify([
      {
        group: 'ok',
        branchName: 'main',
        platform: 'ios',
        runtimeVersion: '1'
      },
      { group: 'no-branch', platform: 'ios', runtimeVersion: '1' },
      { branchName: 'no-group', platform: 'ios', runtimeVersion: '1' },
      {
        group: 'bad-platform',
        branchName: 'main',
        platform: 'windows',
        runtimeVersion: '1'
      }
    ])
    const records = parseEasUpdateJson(raw)
    expect(records.map((r) => r.group)).toEqual(['ok'])
  })
})
