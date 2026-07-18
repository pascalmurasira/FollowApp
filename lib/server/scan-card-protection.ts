import {
  protectExpensiveRequest,
  type RateLimitRuntime,
} from './api-protection.ts'
import { normalizeDeviceId } from './device-id.ts'

const SCAN_WINDOW_MS = 10 * 60_000

/**
 * A conference venue can put hundreds of phones behind one public IP. Give
 * each valid FollowApp installation its own practical scan allowance while a
 * much wider network guard still caps abuse from callers that rotate ids.
 */
export async function protectScanCardRequest(
  req: Request,
  runtime?: RateLimitRuntime,
): Promise<Response | null> {
  const deviceId = normalizeDeviceId(req.headers.get('x-followapp-device-id'))

  const callerBlocked = await protectExpensiveRequest(
    req,
    deviceId ? 'scan-card-device' : 'scan-card-legacy',
    {
      limit: 60,
      windowMs: SCAN_WINDOW_MS,
      ...(deviceId ? { identity: `device:${deviceId}` } : {}),
    },
    runtime,
  )
  if (callerBlocked || !deviceId) return callerBlocked

  return protectExpensiveRequest(
    req,
    'scan-card-network',
    {
      limit: 600,
      windowMs: SCAN_WINDOW_MS,
    },
    runtime,
  )
}
