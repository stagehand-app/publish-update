import { isAbsolute, resolve } from 'node:path'

export const resolveWorkspace = (
  checkoutRoot: string,
  workingDirInput: string | undefined
): string => {
  const trimmed = (workingDirInput ?? '').trim()
  if (!trimmed) return checkoutRoot
  if (isAbsolute(trimmed)) return trimmed
  return resolve(checkoutRoot, trimmed)
}
