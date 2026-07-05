import type { Profile } from '@/lib/types'

export const DEFAULT_PROFILE: Profile = { name: 'You' }

/** Load this device's profile from Neon. Falls back to the default on error. */
export async function loadProfile(deviceId: string): Promise<Profile> {
  try {
    const res = await fetch('/api/profile', {
      headers: { 'X-FollowApp-Device-Id': deviceId },
    })
    if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`)
    const data = (await res.json()) as Partial<Profile>
    return { ...DEFAULT_PROFILE, ...data }
  } catch (error) {
    console.error('[v0] Failed to load profile:', error)
    return DEFAULT_PROFILE
  }
}

/** Persist this device's profile to Neon. Throws so the UI can warn on failure. */
export async function saveProfile(deviceId: string, profile: Profile): Promise<void> {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, profile }),
  })
  if (!res.ok) {
    throw new Error(`Profile save failed: ${res.status}`)
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
