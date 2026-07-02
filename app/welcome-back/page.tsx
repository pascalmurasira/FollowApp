'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDeviceId, setDeviceId } from '@/lib/device-id'
import { NudgeLogo } from '@/components/nudge-logo'

/**
 * Where the magic link lands. By the time the browser reaches this page the
 * Better Auth session cookie is already set, so we just reconcile the device:
 * tell the server our current anonymous deviceId, get back the account's
 * canonical one, adopt it locally, then return home fully synced.
 */
export default function WelcomeBackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'syncing' | 'done' | 'error'>('syncing')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/account/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: getDeviceId() }),
        })
        if (!res.ok) throw new Error('sync failed')
        const data = (await res.json()) as { deviceId?: string }
        if (cancelled) return
        if (data.deviceId) setDeviceId(data.deviceId)
        setStatus('done')
        // Full reload so every hook re-reads the (possibly new) deviceId.
        window.location.replace('/')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <NudgeLogo className="h-12 w-12" />
      {status === 'error' ? (
        <>
          <p className="text-pretty text-lg font-medium text-foreground">
            We couldn&apos;t finish syncing.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="min-h-11 rounded-xl bg-primary px-6 font-semibold text-primary-foreground"
          >
            Go to Nudge
          </button>
        </>
      ) : (
        <p className="text-pretty text-lg font-medium text-foreground">
          Syncing your people to this device…
        </p>
      )}
    </main>
  )
}
