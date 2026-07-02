const KEY = 'nudge.deviceId.v1'

/**
 * A stable, anonymous identifier for this browser/device. Used to scope the
 * user's AI memory server-side without requiring a login. Generated lazily and
 * persisted in localStorage.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    localStorage.setItem(KEY, id)
  }
  return id
}

/**
 * Overwrite this browser's device id. Used after magic-link sign-in so a new
 * device "adopts" the account's canonical device id and instantly sees the
 * same profile, contacts, circles, and memory. No-op if id is empty/unchanged.
 */
export function setDeviceId(id: string) {
  if (typeof window === 'undefined' || !id) return
  localStorage.setItem(KEY, id)
}
