import { getProfile, saveProfile } from '@/lib/server/people'
import { normalizeDeviceId } from '@/lib/server/device-id'
import { withDeviceAccess } from '@/lib/server/device-access'
import { profileInputSchema } from '@/lib/server/input-schemas'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { requestedDeviceId } from '@/lib/server/request-device'
import { z } from 'zod'

export const maxDuration = 10

const putSchema = z.object({
  deviceId: z.unknown(),
  profile: profileInputSchema,
})

export async function GET(req: Request) {
  const deviceId = requestedDeviceId(req)
  if (!deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  try {
    const access = await withDeviceAccess(
      req,
      deviceId,
      ({ deviceId: canonicalDeviceId, executor }) =>
        getProfile(canonicalDeviceId, executor),
    )
    if (!access.ok) return access.response
    return Response.json(access.value)
  } catch (error) {
    console.error('[v0] Profile GET failed:', error)
    return Response.json({ name: 'You' })
  }
}

export async function PUT(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'profile-write', {
    limit: 30,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = putSchema.safeParse(input)
  const deviceId = parsed.success
    ? normalizeDeviceId(parsed.data.deviceId)
    : null
  if (!parsed.success || !deviceId) {
    return Response.json(
      { error: 'Missing or invalid deviceId/profile' },
      { status: 400 },
    )
  }
  const { profile } = parsed.data

  try {
    const access = await withDeviceAccess(
      req,
      deviceId,
      ({ deviceId: canonicalDeviceId, executor }) =>
        saveProfile(canonicalDeviceId, profile, executor),
    )
    if (!access.ok) return access.response
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Profile PUT failed:', error)
    return Response.json({ error: 'Failed to save profile' }, { status: 500 })
  }
}
