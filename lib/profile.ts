import type { Profile } from '@/lib/types'

export const DEFAULT_PROFILE: Profile = { name: 'You' }

const PROFILE_CACHE_VERSION = 1
const PROFILE_CACHE_PREFIX = 'followapp.profile.v1.'
const profileSyncs = new Map<string, Promise<void>>()
const profileWrites = new Map<string, Promise<void>>()

interface CachedProfile {
  version: typeof PROFILE_CACHE_VERSION
  profile: Profile
  /** A local save that has not yet been acknowledged by the API. */
  pendingSync?: boolean
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

/**
 * Keep untrusted API/localStorage data from leaking arbitrary values into the
 * card UI. Exported because profile entry points need the same definition of a
 * valid, shareable card.
 */
export function normalizeProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') return DEFAULT_PROFILE
  const input = value as Record<string, unknown>
  return {
    name: optionalText(input.name) ?? DEFAULT_PROFILE.name,
    photoUrl: optionalText(input.photoUrl),
    title: optionalText(input.title),
    company: optionalText(input.company),
    phone: optionalText(input.phone),
    email: optionalText(input.email),
  }
}

/** A placeholder profile must never become a public card or QR code. */
export function isShareableProfile(
  profile: Pick<Profile, 'name'> | null | undefined,
): profile is Profile {
  const name = profile?.name?.trim()
  return Boolean(name && name.toLocaleLowerCase() !== DEFAULT_PROFILE.name.toLocaleLowerCase())
}

function profileCacheKey(deviceId: string): string {
  return `${PROFILE_CACHE_PREFIX}${encodeURIComponent(deviceId)}`
}

function profilesMatch(left: Profile | null, right: Profile | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function readLocalProfile(deviceId: string): CachedProfile | null {
  if (typeof localStorage === 'undefined' || !deviceId) return null
  try {
    const raw = localStorage.getItem(profileCacheKey(deviceId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedProfile>
    if (parsed.version !== PROFILE_CACHE_VERSION) return null
    const profile = normalizeProfile(parsed.profile)
    return isShareableProfile(profile)
      ? {
          version: PROFILE_CACHE_VERSION,
          profile,
          pendingSync: parsed.pendingSync === true,
        }
      : null
  } catch (error) {
    console.warn('[v0] Ignoring an unreadable local profile:', error)
    return null
  }
}

/** Return the last meaningful profile immediately, without a network round trip. */
export function loadLocalProfile(deviceId: string): Profile | null {
  return readLocalProfile(deviceId)?.profile ?? null
}

function writeLocalProfile(
  deviceId: string,
  profile: Profile,
  pendingSync: boolean,
): void {
  if (typeof localStorage === 'undefined' || !deviceId) return
  const normalized = normalizeProfile(profile)
  if (!isShareableProfile(normalized)) return
  try {
    const cached: CachedProfile = {
      version: PROFILE_CACHE_VERSION,
      profile: normalized,
      pendingSync,
    }
    localStorage.setItem(profileCacheKey(deviceId), JSON.stringify(cached))
  } catch (error) {
    // Private browsing/storage pressure must not prevent a server save.
    console.warn('[v0] Failed to cache profile locally:', error)
  }
}

/** Persist only real user identities; the default "You" is a UI placeholder. */
export function saveLocalProfile(deviceId: string, profile: Profile): void {
  writeLocalProfile(deviceId, profile, false)
}

function retryPendingProfileSync(deviceId: string, profile: Profile): void {
  if (!deviceId || profileSyncs.has(deviceId)) return
  const sync = saveProfile(deviceId, profile)
    .catch((error) => {
      console.warn('[v0] Pending profile sync will retry later:', error)
    })
    .finally(() => {
      profileSyncs.delete(deviceId)
    })
  profileSyncs.set(deviceId, sync)
}

/** Load this device's profile from Neon, with an instant local fallback. */
export async function loadProfile(deviceId: string): Promise<Profile> {
  const cached = readLocalProfile(deviceId)
  const local = cached?.profile ?? null
  if (cached?.pendingSync) {
    // Return the local-first value immediately and repair cloud state in the
    // background. Opening either profile surface becomes a safe retry point.
    retryPendingProfileSync(deviceId, cached.profile)
    return cached.profile
  }
  try {
    const res = await fetch('/api/profile', {
      headers: { 'X-FollowApp-Device-Id': deviceId },
    })
    if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`)
    const profile = normalizeProfile(await res.json())
    const latest = readLocalProfile(deviceId)
    // Preserve a local save made while this request was in flight, and never
    // replace an unsynced save with older cloud data.
    if (
      latest?.pendingSync ||
      !profilesMatch(latest?.profile ?? null, cached?.profile ?? null)
    ) {
      return latest?.profile ?? profile
    }
    if (isShareableProfile(profile)) {
      saveLocalProfile(deviceId, profile)
      return profile
    }
    // A transient/default server response must not erase a usable local card.
    return local ?? profile
  } catch (error) {
    console.error('[v0] Failed to load profile:', error)
    return local ?? DEFAULT_PROFILE
  }
}

/**
 * Persist this device's profile locally first, then to Neon. It still throws on
 * a failed server save so existing callers can surface sync status.
 */
export async function saveProfile(deviceId: string, profile: Profile): Promise<void> {
  const normalized = normalizeProfile(profile)
  writeLocalProfile(deviceId, normalized, true)

  // Serialize every write for a device, including automatic retries. Without
  // this queue an older retry can finish after a newer edit and overwrite it
  // in the cloud even though the local race guard preserved the right value.
  const previous = profileWrites.get(deviceId) ?? Promise.resolve()
  const write = previous.catch(() => undefined).then(async () => {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, profile: normalized }),
    })
    if (!res.ok) {
      throw new Error(`Profile save failed: ${res.status}`)
    }
    const latest = readLocalProfile(deviceId)
    if (profilesMatch(latest?.profile ?? null, normalized)) {
      writeLocalProfile(deviceId, normalized, false)
    }
  })
  profileWrites.set(deviceId, write)

  try {
    await write
  } finally {
    if (profileWrites.get(deviceId) === write) {
      profileWrites.delete(deviceId)
    }
  }
}

/**
 * Downscale and compress an image File to a small square JPEG data URL so it
 * stays tiny enough to store in a Neon text column (no blob storage / upload
 * cost). Returns a ~256px center-cropped data URL.
 */
export async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  // Center-crop to a square, then draw scaled to `size`.
  const min = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - min) / 2
  const sy = (bitmap.height - min) / 2
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size)
  bitmap.close()

  return canvas.toDataURL('image/jpeg', 0.82)
}
