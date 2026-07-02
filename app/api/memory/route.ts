import {
  recordSignal,
  clearMemory,
  buildUserLearnings,
  type SignalKind,
} from '@/lib/memory'

export const maxDuration = 10

const VALID_KINDS: SignalKind[] = [
  'send',
  'skip',
  'edit',
  'tone',
  'regenerate',
  'call',
]

interface Body {
  deviceId?: string
  contactId?: string
  kind?: string
  tone?: string
  detail?: string
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { deviceId, contactId, kind, tone, detail } = body

  if (!deviceId || !kind || !VALID_KINDS.includes(kind as SignalKind)) {
    return Response.json({ error: 'Missing deviceId or valid kind' }, { status: 400 })
  }

  try {
    await recordSignal(deviceId, {
      contactId,
      kind: kind as SignalKind,
      tone,
      detail,
    })
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Memory route failed:', error)
    // Never let memory failures break the core flow.
    return Response.json({ ok: false }, { status: 200 })
  }
}

export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get('deviceId')
  if (!deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  try {
    const learnings = await buildUserLearnings(deviceId)
    return Response.json(learnings)
  } catch (error) {
    console.error('[v0] Memory GET failed:', error)
    return Response.json({ count: 0, insights: [] })
  }
}

export async function DELETE(req: Request) {
  const deviceId = new URL(req.url).searchParams.get('deviceId')
  if (!deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  try {
    await clearMemory(deviceId)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Memory DELETE failed:', error)
    return Response.json({ ok: false }, { status: 500 })
  }
}
