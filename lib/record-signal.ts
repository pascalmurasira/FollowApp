import { getDeviceId } from '@/lib/device-id'
import type { SignalKind } from '@/lib/memory'

/**
 * Fire-and-forget a learning signal. Never awaited by the UI so it can't slow
 * down the core action; failures are swallowed.
 */
export function recordSignal(input: {
  kind: SignalKind
  contactId?: string
  tone?: string
  detail?: string
}): void {
  const deviceId = getDeviceId()
  if (!deviceId) return
  try {
    void fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, ...input }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ignore
  }
}
