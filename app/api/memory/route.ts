import {
  recordSignal,
  clearMemory,
  buildUserLearnings,
  type SignalKind,
} from '@/lib/memory'
import { normalizeDeviceId } from '@/lib/server/device-id'
import { withDeviceAccess } from '@/lib/server/device-access'
import { requestedDeviceId } from '@/lib/server/request-device'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { z } from 'zod'

export const maxDuration = 10

const VALID_KINDS: SignalKind[] = [
  'send',
  'skip',
  'edit',
  'tone',
  'regenerate',
  'call',
]

const bodySchema = z.object({
  deviceId: z.unknown(),
  contactId: z.string().max(200).optional(),
  kind: z.string(),
  tone: z.string().max(300).optional(),
  detail: z.string().max(4_000).optional(),
})

export async function POST(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'memory-write', {
    limit: 300,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(input)
  const deviceId = parsed.success
    ? normalizeDeviceId(parsed.data.deviceId)
    : null
  if (!parsed.success) {
    return Response.json({ error: 'Missing deviceId or valid kind' }, { status: 400 })
  }
  const { contactId, kind, tone, detail } = parsed.data

  if (!deviceId || !kind || !VALID_KINDS.includes(kind as SignalKind)) {
    return Response.json({ error: 'Missing deviceId or valid kind' }, { status: 400 })
  }
  try {
    const access = await withDeviceAccess(
      req,
      deviceId,
      ({ deviceId: canonicalDeviceId, executor }) =>
        recordSignal(
          canonicalDeviceId,
          {
            contactId,
            kind: kind as SignalKind,
            tone,
            detail,
          },
          executor,
        ),
    )
    if (!access.ok) return access.response
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Memory route failed:', error)
    // Never let memory failures break the core flow.
    return Response.json({ ok: false }, { status: 200 })
  }
}

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
        buildUserLearnings(canonicalDeviceId, executor),
    )
    if (!access.ok) return access.response
    return Response.json(access.value)
  } catch (error) {
    console.error('[v0] Memory GET failed:', error)
    return Response.json({ count: 0, insights: [] })
  }
}

export async function DELETE(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'memory-delete', {
    limit: 10,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  const deviceId = requestedDeviceId(req)
  if (!deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  try {
    const access = await withDeviceAccess(
      req,
      deviceId,
      ({ deviceId: canonicalDeviceId, executor }) =>
        clearMemory(canonicalDeviceId, executor),
    )
    if (!access.ok) return access.response
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Memory DELETE failed:', error)
    return Response.json({ ok: false }, { status: 500 })
  }
}
