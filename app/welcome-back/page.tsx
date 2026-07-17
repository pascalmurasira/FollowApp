'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { accountSyncDeviceIds } from '@/lib/account-sync-flow'
import {
  getDeviceId,
  resetDeviceForAccountSwitch,
  setDeviceId,
} from '@/lib/device-id'
import { NudgeLogo } from '@/components/nudge-logo'

/**
 * Where the magic link lands. By the time the browser reaches this page the
 * Better Auth session cookie is already set, so we reconcile both sides of a
 * cross-device sign-in: first the anonymous source that requested the link,
 * then the browser/device that opened it. The server returns the account's
 * canonical id, which this browser adopts before returning home.
 */
export default function WelcomeBackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'syncing' | 'done' | 'error'>('syncing')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const sync = (deviceId: string) =>
          fetch('/api/account/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
          })

        const destinationDeviceId = getDeviceId()
        const sourceDeviceId = new URL(window.location.href).searchParams
          .get('sourceDeviceId')
          ?.trim()

        // The source id is a bearer capability embedded in the one-time link.
        // Claim/merge it before touching the destination so opening an
        // A-requested email on B cannot make an empty B the canonical dataset.
        const deviceIds = accountSyncDeviceIds(
          sourceDeviceId,
          destinationDeviceId,
        )
        for (const deviceId of deviceIds.slice(0, -1)) {
          const sourceResponse = await sync(deviceId)
          // The link may have been requested from a browser that still carries
          // another account's secured capability. Never merge that data, but
          // continue reconciling the device that actually opened the link.
          if (sourceResponse.status === 409) continue
          if (!sourceResponse.ok) throw new Error('source sync failed')
        }

        let res = await sync(deviceIds.at(-1) ?? destinationDeviceId)
        // A shared browser may still carry another account's now-secured
        // capability. Remove its local cache, mint a fresh id, and retry so
        // the newly signed-in account can never inherit that private data.
        if (res.status === 409) {
          res = await sync(resetDeviceForAccountSwitch())
        }
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
            Go to FollowApp
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
