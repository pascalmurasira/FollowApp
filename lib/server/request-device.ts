import 'server-only'

/**
 * Prefer the device id in a request header so client reads do not leak the
 * anonymous relationship key into URLs, logs, analytics, or browser history.
 * Query params remain as a compatibility fallback for older clients.
 */
export function requestedDeviceId(req: Request): string | null {
  return (
    req.headers.get('x-followapp-device-id')?.trim() ||
    new URL(req.url).searchParams.get('deviceId')?.trim() ||
    null
  )
}
