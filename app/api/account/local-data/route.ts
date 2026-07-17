import { clearDeviceData } from '@/lib/server/account-sync'
import { logServerError } from '@/lib/server/error-metadata'
import { withDeviceAccess } from '@/lib/server/device-access'
import { requestedDeviceId } from '@/lib/server/request-device'
import { protectExpensiveRequest } from '@/lib/server/api-protection'

export const maxDuration = 10

export async function DELETE(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'local-data-delete', {
    limit: 10,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  const deviceId = requestedDeviceId(req)
  if (!deviceId) {
    return Response.json({ error: 'Missing device id.' }, { status: 400 })
  }

  let confirmation: unknown
  try {
    confirmation = ((await req.json()) as { confirmation?: unknown }).confirmation
  } catch {
    return Response.json({ error: 'Confirmation is required.' }, { status: 400 })
  }
  if (confirmation !== 'DELETE') {
    return Response.json({ error: 'Confirmation is required.' }, { status: 400 })
  }

  try {
    const access = await withDeviceAccess(
      req,
      deviceId,
      ({ deviceId: canonicalDeviceId, executor }) =>
        clearDeviceData(canonicalDeviceId, executor),
    )
    if (!access.ok) return access.response
    return Response.json({ ok: true })
  } catch (error) {
    logServerError('[followapp] Local data deletion failed', error)
    return Response.json(
      { error: 'FollowApp data could not be deleted.' },
      { status: 500 },
    )
  }
}
