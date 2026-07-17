/**
 * Device ids are bearer capabilities for anonymous FollowApp data. Keep the
 * accepted format narrow so callers cannot turn arbitrary strings into data
 * namespaces. Modern clients use crypto.randomUUID(); the `dev_` form is the
 * legacy fallback for browsers without it.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEGACY_PATTERN = /^dev_[a-z0-9]{16,96}$/i

export function normalizeDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length > 128) return null
  return UUID_PATTERN.test(trimmed) || LEGACY_PATTERN.test(trimmed)
    ? trimmed
    : null
}

export function isValidDeviceId(value: unknown): value is string {
  return normalizeDeviceId(value) !== null
}
