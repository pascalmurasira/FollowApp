const KEY = 'followapp.deviceId.v1'
const LEGACY_KEY = 'nudge.deviceId.v1'
let memoryDeviceId = ''

function newDeviceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/**
 * A stable, anonymous identifier for this browser/device. Used to scope the
 * user's AI memory server-side without requiring a login. Generated lazily and
 * persisted in localStorage.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = memoryDeviceId
  try {
    id = localStorage.getItem(KEY) ?? id
    if (!id) {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        localStorage.setItem(KEY, legacy)
        localStorage.removeItem(LEGACY_KEY)
        id = legacy
      }
    }
  } catch {
    // Private browsing, storage corruption, or an embedded web-view policy can
    // make localStorage throw. A memory-scoped identity still lets capture and
    // optimistic contact creation complete for this app session.
  }
  if (!id) {
    id = newDeviceId()
  }
  memoryDeviceId = id
  try {
    if (localStorage.getItem(KEY) !== id) localStorage.setItem(KEY, id)
  } catch {
    // The in-memory fallback above remains usable for this session.
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
  memoryDeviceId = id
  try {
    localStorage.setItem(KEY, id)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // Account adoption can still complete in memory when storage is blocked.
  }
}

/** Clear browser-scoped data before switching away from another account. */
export function resetDeviceForAccountSwitch(): string {
  if (typeof window === 'undefined') return ''
  memoryDeviceId = ''
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter((key): key is string => Boolean(key))
    for (const key of keys) {
      if (key.startsWith('followapp.') || key.startsWith('nudge.')) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // A fresh memory identity is sufficient when persistent storage is blocked.
  }
  return getDeviceId()
}
