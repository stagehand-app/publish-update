export interface VendInputs {
  apiBase: string
  projectId: string
  stagehandToken: string
  fetchImpl?: typeof fetch
}

export class VendError extends Error {
  public readonly statusCode: number
  public readonly errorCode: string | null
  constructor(statusCode: number, errorCode: string | null, message: string) {
    super(message)
    this.statusCode = statusCode
    this.errorCode = errorCode
  }
}

export type PublishedUpdatePlatform = 'ios' | 'android' | 'all'

export interface PublishUpdatePayload {
  branch: string
  sha: string
  updateGroupId: string
  runtimeVersion: string
  platform: PublishedUpdatePlatform
  isDefaultBranch?: boolean
}

export interface PublishUpdateInputs {
  apiBase: string
  projectId: string
  stagehandToken: string
  payload: PublishUpdatePayload
  fetchImpl?: typeof fetch
}

export class PublishUpdateError extends Error {
  public readonly statusCode: number
  public readonly errorCode: string | null
  constructor(statusCode: number, errorCode: string | null, message: string) {
    super(message)
    this.statusCode = statusCode
    this.errorCode = errorCode
  }
}

const trimSlash = (base: string): string =>
  base.endsWith('/') ? base.slice(0, -1) : base

export const vendExpoToken = async (inputs: VendInputs): Promise<string> => {
  const fetchImpl = inputs.fetchImpl ?? fetch
  const url = `${trimSlash(inputs.apiBase)}/api/projects/${inputs.projectId}/expo-token`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${inputs.stagehandToken}` }
  })

  const bodyText = await res.text()
  let parsed: unknown = null
  if (bodyText.length > 0) {
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      throw new VendError(
        res.status,
        null,
        `Stagehand returned non-JSON body (status ${res.status})`
      )
    }
  }

  if (!res.ok) {
    const errorCode =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : null
    throw new VendError(
      res.status,
      errorCode,
      `Vending failed (status ${res.status}${
        errorCode === null ? '' : `, error=${errorCode}`
      })`
    )
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('expoToken' in parsed) ||
    typeof (parsed as { expoToken: unknown }).expoToken !== 'string'
  ) {
    throw new VendError(
      res.status,
      null,
      'Stagehand response is missing an `expoToken` string'
    )
  }

  return (parsed as { expoToken: string }).expoToken
}

export const postPublishedUpdate = async (
  inputs: PublishUpdateInputs
): Promise<void> => {
  const fetchImpl = inputs.fetchImpl ?? fetch
  const url = `${trimSlash(inputs.apiBase)}/api/projects/${inputs.projectId}/updates`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${inputs.stagehandToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(inputs.payload)
  })

  if (res.ok) return

  const bodyText = await res.text()
  let errorCode: string | null = null
  if (bodyText.length > 0) {
    try {
      const parsed: unknown = JSON.parse(bodyText)
      if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
        errorCode = String((parsed as { error: unknown }).error)
      }
    } catch {
      // non-JSON; leave errorCode as null
    }
  }
  throw new PublishUpdateError(
    res.status,
    errorCode,
    `Stagehand publish-update failed (status ${res.status}${
      errorCode === null ? '' : `, error=${errorCode}`
    })`
  )
}

interface RawEasUpdate {
  group?: unknown
  runtimeVersion?: unknown
  branchName?: unknown
  branch?: unknown
  platform?: unknown
}

export interface ParsedUpdateRecord {
  group: string
  runtimeVersion: string
  branch: string
  platform: PublishedUpdatePlatform
}

const platformFromEas = (raw: string): PublishedUpdatePlatform | null => {
  if (raw === 'ios' || raw === 'android') return raw
  if (raw === 'all') return 'all'
  return null
}

export const parseEasUpdateJson = (rawJson: string): ParsedUpdateRecord[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const byGroup = new Map<string, ParsedUpdateRecord>()
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as RawEasUpdate
    const group = typeof e.group === 'string' ? e.group : null
    const runtimeVersion =
      typeof e.runtimeVersion === 'string' ? e.runtimeVersion : null
    const branchRaw =
      typeof e.branchName === 'string'
        ? e.branchName
        : typeof e.branch === 'string'
          ? e.branch
          : null
    const platformRaw = typeof e.platform === 'string' ? e.platform : null
    if (!group || !runtimeVersion || !branchRaw || !platformRaw) continue
    const platform = platformFromEas(platformRaw)
    if (!platform) continue
    const existing = byGroup.get(group)
    if (existing) {
      if (existing.platform !== platform) existing.platform = 'all'
    } else {
      byGroup.set(group, {
        group,
        runtimeVersion,
        branch: branchRaw,
        platform
      })
    }
  }
  return Array.from(byGroup.values())
}
