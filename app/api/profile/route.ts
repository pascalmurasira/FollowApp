import { getProfile, saveProfile } from '@/lib/server/people'
import type { Profile } from '@/lib/types'

export const maxDuration = 10

export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get('deviceId')
  if (!deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  try {
    return Response.json(await getProfile(deviceId))
  } catch (error) {
    console.error('[v0] Profile GET failed:', error)
    return Response.json({ name: 'You' })
  }
}

export async function PUT(req: Request) {
  let body: { deviceId?: string; profile?: Profile }
  try {
    body = (await req.json()) as { deviceId?: string; profile?: Profile }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { deviceId, profile } = body
  if (!deviceId || !profile) {
    return Response.json({ error: 'Missing deviceId or profile' }, { status: 400 })
  }

  try {
    await saveProfile(deviceId, profile)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Profile PUT failed:', error)
    return Response.json({ error: 'Failed to save profile' }, { status: 500 })
  }
}
