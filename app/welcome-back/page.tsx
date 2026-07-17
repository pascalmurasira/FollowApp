'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDeviceId, resetDeviceForAccountSwitch, setDeviceId } from '@/lib/device-id'
import { NudgeLogo } from '@/components/nudge-logo'
import { trackProductEvent } from '@/lib/product-analytics'
import { cancelAllFollowUpReminders } from '@/lib/native'
import {
  migratePendingProfileSync,
  retryPendingProfileSync,
} from '@/lib/profile'

type SyncStatus = 'syncing' | 'done' | 'error' | 'conflict'

class AccountSyncError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`Account sync failed: ${status}`)
    this.name = 'AccountSyncError'
  }
}

/**
 * The magic-link destination. Only the installation holding the authenticated
 * session is reconciled here. Older links may still contain a sourceDeviceId,
 * but that bearer capability is intentionally ignored so opening an email on a
 * different device can never lock the source installation out of its data.
 */
export default function WelcomeBackPage() {
  const router = useRouter()
  const mountedRef = useRef(true)
  const [status, setStatus] = useState<SyncStatus>('syncing')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // Strict Mode runs setup -> cleanup -> setup in development. Reset the
    // ref on each setup so the second pass can commit the real sync result.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const syncDevice = useCallback(async (deviceId: string) => {
    setStatus('syncing')
    setMessage(null)

    try {
      const response = await fetch('/api/account/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        deviceId?: string
        error?: string
        code?: string
      }

      if (response.status === 409) {
        if (!mountedRef.current) return
        setStatus('conflict')
        setMessage(
          'This installation still belongs to a different FollowApp account. Its backed-up data will remain with that account.',
        )
        trackProductEvent('backup_sync_failed', {
          stage: 'device_reconcile',
          reason: 'account_conflict',
        })
        return
      }

      if (!response.ok) {
        throw new AccountSyncError(response.status, body.code)
      }

      if (!mountedRef.current) return
      if (body.deviceId) {
        const migrated = migratePendingProfileSync(deviceId, body.deviceId)
        setDeviceId(body.deviceId)
        if (migrated) {
          // Failure leaves the pending cache on the canonical id; the main app
          // retries it again without hiding the rest of the successful sync.
          await retryPendingProfileSync(body.deviceId).catch(() => undefined)
        }
      }
      setStatus('done')
      trackProductEvent('backup_sync_completed', { surface: 'welcome_back' })
      // Full reload so every hook re-reads the canonical device id and session.
      window.location.replace('/')
    } catch (error) {
      if (!mountedRef.current) return
      const failure = error instanceof AccountSyncError ? error : undefined
      const signedOut = failure?.status === 401
      setStatus('error')
      setMessage(
        signedOut
          ? 'This sign-in link is no longer active. Return to FollowApp and request a new one.'
          : failure?.code === 'DEVICE_LIMIT_REACHED'
            ? 'This account has reached its device safety limit. Your existing data is unchanged; contact FollowApp support before linking another installation.'
          : 'Your account is signed in, but this device could not finish syncing. Your existing data has not been cleared.',
      )
      trackProductEvent('backup_sync_failed', {
        stage: 'device_reconcile',
        reason: signedOut ? 'signed_out' : `http_${failure?.status ?? 0}`,
      })
    }
  }, [])

  useEffect(() => {
    void syncDevice(getDeviceId())
  }, [syncDevice])

  const startFresh = async () => {
    // This is the only destructive local step, and it runs only after the user
    // explicitly chooses it. The other account's server copy is not deleted.
    await cancelAllFollowUpReminders().catch((error) => {
      console.warn('[followapp] Could not clear native reminders:', error)
    })
    const freshDeviceId = resetDeviceForAccountSwitch()
    void syncDevice(freshDeviceId)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <NudgeLogo className="h-12 w-12" />

      {status === 'syncing' || status === 'done' ? (
        <p className="text-pretty text-lg font-medium text-foreground">
          Syncing your people to this device…
        </p>
      ) : status === 'conflict' ? (
        <div className="max-w-sm">
          <p className="text-pretty text-lg font-medium text-foreground">
            Choose which account this device should use
          </p>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
          <button
            type="button"
            onClick={startFresh}
            className="mt-5 min-h-11 w-full rounded-xl bg-primary px-6 font-semibold text-primary-foreground"
          >
            Start fresh for this account
          </button>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="mt-2 min-h-11 w-full rounded-xl px-6 font-semibold text-muted-foreground"
          >
            Keep this device unchanged
          </button>
        </div>
      ) : (
        <div className="max-w-sm">
          <p className="text-pretty text-lg font-medium text-foreground">
            We couldn&apos;t finish syncing
          </p>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
          <button
            type="button"
            onClick={() => void syncDevice(getDeviceId())}
            className="mt-5 min-h-11 w-full rounded-xl bg-primary px-6 font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="mt-2 min-h-11 w-full rounded-xl px-6 font-semibold text-muted-foreground"
          >
            Go to FollowApp
          </button>
        </div>
      )}
    </main>
  )
}
