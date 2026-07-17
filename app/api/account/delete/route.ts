import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { deleteAccountAndData } from '@/lib/server/account-sync'
import { logServerError } from '@/lib/server/error-metadata'
import { ensureDeviceOwnershipSchema } from '@/lib/server/device-ownership'
import { protectExpensiveRequest } from '@/lib/server/api-protection'

export const maxDuration = 15

export async function DELETE(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'account-delete', {
    limit: 5,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return Response.json(
      { error: 'Sign in again before deleting this account.', code: 'AUTH_REQUIRED' },
      { status: 401 },
    )
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

  const client = await pool.connect().catch((error) => {
    logServerError('[followapp] Account deletion database unavailable', error)
    return null
  })
  if (!client) {
    return Response.json(
      { error: 'Account deletion is temporarily unavailable.' },
      { status: 503 },
    )
  }

  try {
    await ensureDeviceOwnershipSchema(client)
    const deleted = await deleteAccountAndData(client, session.user.id)
    if (!deleted) {
      return Response.json({ error: 'Account not found.' }, { status: 404 })
    }
    return Response.json({ ok: true })
  } catch (error) {
    logServerError('[followapp] Account deletion failed', error)
    return Response.json(
      { error: 'Account deletion could not be completed.' },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}
