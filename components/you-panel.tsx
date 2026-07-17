'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Lock,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react'
import type { Contact } from '@/lib/types'
import {
  retryPendingContactWrites,
  type ContactUpdateInput,
} from '@/lib/contacts-store'
import {
  clearContactAccessFailure,
  CONTACT_SYNC_EVENT,
  getContactSyncState,
  type ContactSyncState,
} from '@/lib/contact-sync-recovery'
import {
  getDeviceId,
  resetDeviceForAccountSwitch,
  setDeviceId,
} from '@/lib/device-id'
import { signOut, useSession } from '@/lib/auth-client'
import { trackProductEvent } from '@/lib/product-analytics'
import { ProfileHeader } from '@/components/profile-header'
import { PeopleCircles } from '@/components/people-circles'
import { SecureNudgeSheet } from '@/components/secure-nudge-sheet'
import { DEMO_CONTACT_IDS } from '@/lib/mock-data'
import { cancelAllFollowUpReminders } from '@/lib/native'
import {
  hasPendingProfileSync,
  retryPendingProfileSync,
} from '@/lib/profile'

interface Learnings {
  count: number
  insights: string[]
}

type DestructiveAction = 'memory' | 'signout' | 'account' | 'local' | null

const EMPTY_SYNC_STATE: ContactSyncState = {
  pending: 0,
  authorizationBlocked: false,
}

const fetcher = async ([url, deviceId]: [string, string]): Promise<Learnings> => {
  const response = await fetch(url, {
    headers: { 'X-FollowApp-Device-Id': deviceId },
  })
  if (!response.ok) throw new Error(`Memory fetch failed: ${response.status}`)
  return response.json() as Promise<Learnings>
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return new Error(body.error || fallback)
}

export function YouPanel({
  voiceLabel,
  contacts,
  streak,
  groups,
  onAddPerson,
  onSetGroup,
  onUpdateContact,
  onDeleteContact,
  onShowCard,
}: {
  voiceLabel: string
  contacts: Contact[]
  streak: number
  groups: string[]
  onAddPerson: () => void
  onSetGroup: (contactId: string, group: string | null) => void
  onUpdateContact: (contactId: string, updates: ContactUpdateInput) => void
  onDeleteContact?: (contactId: string) => Promise<void> | void
  onShowCard: () => void
}) {
  const { data: session, isPending: sessionPending } = useSession()
  const signedIn = Boolean(session?.user)
  const peopleCount = contacts.length
  const sentCount = contacts.reduce(
    (total, contact) =>
      total +
      contact.messages.filter(
        (message) =>
          message.sender === 'me' &&
          (message.id.startsWith('local-') || !DEMO_CONTACT_IDS.has(contact.id)),
      ).length,
    0,
  )
  const deviceId = getDeviceId()
  const { data, error: memoryLoadError, isLoading, mutate } = useSWR<Learnings>(
    deviceId ? ['/api/memory', deviceId] : null,
    fetcher,
  )
  const [secureOpen, setSecureOpen] = useState(false)
  const [syncState, setSyncState] = useState<ContactSyncState>(EMPTY_SYNC_STATE)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<DestructiveAction>(null)
  const [clearing, setClearing] = useState(false)
  const [accountActionBusy, setAccountActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [signOutCanDiscard, setSignOutCanDiscard] = useState(false)

  const refreshSyncState = useCallback(() => {
    setSyncState(getContactSyncState())
  }, [])

  useEffect(() => {
    refreshSyncState()
    window.addEventListener(CONTACT_SYNC_EVENT, refreshSyncState)
    window.addEventListener('storage', refreshSyncState)
    return () => {
      window.removeEventListener(CONTACT_SYNC_EVENT, refreshSyncState)
      window.removeEventListener('storage', refreshSyncState)
    }
  }, [refreshSyncState])

  const insights = data?.insights ?? []
  const count = data?.count ?? 0
  const syncNeedsAttention =
    syncState.pending > 0 || syncState.authorizationBlocked

  const openSecure = () => {
    setSecureOpen(true)
    trackProductEvent('backup_sync_opened', { surface: 'you' })
  }

  const handleRetrySync = async () => {
    const currentDeviceId = getDeviceId()
    if (!currentDeviceId) return
    setSyncing(true)
    setSyncMessage(null)

    try {
      let canonicalDeviceId = currentDeviceId
      if (signedIn) {
        const response = await fetch('/api/account/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: currentDeviceId }),
        })
        const body = (await response.json().catch(() => ({}))) as {
          deviceId?: string
          error?: string
        }
        if (!response.ok) {
          throw new Error(
            response.status === 409
              ? 'This installation belongs to another account. Sign out before switching accounts.'
              : body.error || 'Account sync failed',
          )
        }
        if (body.deviceId) {
          canonicalDeviceId = body.deviceId
          setDeviceId(canonicalDeviceId)
        }
      }

      await retryPendingContactWrites(canonicalDeviceId)
      clearContactAccessFailure()
      refreshSyncState()
      setSyncMessage('Contact changes are synced.')
      trackProductEvent('backup_sync_completed', { surface: 'you_retry' })
    } catch (error) {
      refreshSyncState()
      setSyncMessage(
        error instanceof Error
          ? error.message
          : 'Sync could not finish. Your changes are still kept on this device.',
      )
      trackProductEvent('backup_sync_failed', { stage: 'manual_retry' })
    } finally {
      setSyncing(false)
    }
  }

  const handleClearMemory = async () => {
    if (!deviceId) return
    const previous = data
    setClearing(true)
    setActionError(null)
    await mutate({ count: 0, insights: [] }, false)

    try {
      const response = await fetch('/api/memory', {
        method: 'DELETE',
        headers: { 'X-FollowApp-Device-Id': deviceId },
      })
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!response.ok || body.ok !== true) {
        throw new Error(body.error || 'Memory could not be cleared')
      }
      setConfirming(null)
      trackProductEvent('deletion_confirmed', { scope: 'memory' })
    } catch (error) {
      if (previous) await mutate(previous, false)
      else await mutate()
      setActionError(
        'Nothing was erased because the server could not confirm the request. Please try again.',
      )
      trackProductEvent('deletion_failed', { scope: 'memory' })
      console.error('[v0] Failed to clear memory:', error)
    } finally {
      setClearing(false)
    }
  }

  const handleSignOut = async (discardPending = false) => {
    setAccountActionBusy(true)
    setActionError(null)
    setSignOutCanDiscard(false)
    try {
      const pending = getContactSyncState()
      const currentDeviceId = getDeviceId()
      if (
        !discardPending &&
        (pending.pending > 0 || hasPendingProfileSync(currentDeviceId))
      ) {
        try {
          if (pending.pending > 0) {
            await retryPendingContactWrites(currentDeviceId)
          }
          if (hasPendingProfileSync(currentDeviceId)) {
            await retryPendingProfileSync(currentDeviceId)
          }
          clearContactAccessFailure()
          refreshSyncState()
        } catch {
          setActionError(
            'Sign out was stopped because local contact or card changes could not be backed up. You can retry, keep this account, or explicitly discard those local changes.',
          )
          setSignOutCanDiscard(true)
          trackProductEvent('backup_sync_failed', { stage: 'signout_guard' })
          return
        }
      }
      const result = await signOut()
      if (result.error) throw new Error(result.error.message)
      await cancelAllFollowUpReminders().catch((error) => {
        console.warn('[followapp] Could not clear native reminders:', error)
      })
      resetDeviceForAccountSwitch()
      window.location.replace('/')
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Sign out could not be completed.',
      )
    } finally {
      setAccountActionBusy(false)
    }
  }

  const handleDeleteData = async (scope: 'account' | 'local') => {
    const currentDeviceId = getDeviceId()
    setAccountActionBusy(true)
    setActionError(null)
    try {
      const response = await fetch(
        scope === 'account' ? '/api/account/delete' : '/api/account/local-data',
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(scope === 'local'
              ? { 'X-FollowApp-Device-Id': currentDeviceId }
              : {}),
          },
          body: JSON.stringify({ confirmation: 'DELETE' }),
        },
      )
      if (!response.ok) {
        throw await responseError(response, 'Data deletion could not be completed')
      }

      if (scope === 'account') {
        // The account endpoint removes the server session. This best-effort
        // client call also clears Better Auth's local session state.
        await signOut().catch(() => undefined)
      }
      trackProductEvent('deletion_confirmed', { scope })
      await cancelAllFollowUpReminders().catch((error) => {
        console.warn('[followapp] Could not clear native reminders:', error)
      })
      resetDeviceForAccountSwitch()
      window.location.replace('/')
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Data was not deleted. Please try again.',
      )
      setAccountActionBusy(false)
      trackProductEvent('deletion_failed', { scope })
    }
  }

  return (
    <div className="relative z-[1] mx-auto max-w-4xl px-5 py-5 sm:px-8 lg:py-7">
      <ProfileHeader
        voiceLabel={voiceLabel}
        peopleCount={peopleCount}
        streak={streak}
        sentCount={sentCount}
      />

      <button
        type="button"
        onClick={onShowCard}
        className="glass-card pressable mt-4 flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/25 text-[var(--ink-strong)]">
          <QrCode className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-semibold leading-tight text-[var(--ink-strong)]">
            My digital card
          </span>
          <span className="block text-pretty text-[12px] text-[var(--ink-secondary)]">
            Show your QR so anyone can save you in a tap
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>

      <section className="glass-card mt-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-[var(--ink-strong)]">
            <Cloud className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-semibold leading-tight text-[var(--ink-strong)]">
              Back up &amp; sync
            </h2>
            {sessionPending ? (
              <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                Checking account…
              </p>
            ) : signedIn ? (
              <>
                <p className="mt-1 truncate text-sm font-medium text-[var(--ink-strong)]">
                  {session?.user.email}
                </p>
                <p className="text-[12px] text-[var(--ink-secondary)]">
                  Signed in. Your network can be restored on another device.
                </p>
              </>
            ) : (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                This installation has a device-scoped cloud copy. Add an email
                to restore it securely on another device.
              </p>
            )}
          </div>
        </div>

        <div
          className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-3 text-sm ${
            syncNeedsAttention
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-[var(--hairline)] bg-white/15'
          }`}
        >
          {syncNeedsAttention ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--status-on-track)]" />
          )}
          <span className="text-pretty text-[12px] leading-relaxed text-[var(--ink-secondary)]">
            {syncNeedsAttention
              ? syncState.authorizationBlocked
                ? syncState.pending > 0
                  ? `${syncState.pending} local ${syncState.pending === 1 ? 'change needs' : 'changes need'} account access before backup can finish.`
                  : 'Sign in again to access this installation’s secured cloud copy.'
                : `${syncState.pending} local ${syncState.pending === 1 ? 'change is' : 'changes are'} waiting to sync.`
              : 'No contact changes are waiting to sync.'}
          </span>
        </div>

        {syncMessage && (
          <p className="mt-2 text-pretty text-[12px] text-[var(--ink-secondary)]">
            {syncMessage}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          {!signedIn && !sessionPending && (
            <button
              type="button"
              onClick={openSecure}
              className="primary-action pressable min-h-11 flex-1 rounded-full px-4 text-sm font-semibold"
            >
              Back up with email
            </button>
          )}
          {(signedIn ||
            (syncState.pending > 0 && !syncState.authorizationBlocked)) && (
            <button
              type="button"
              onClick={handleRetrySync}
              disabled={syncing}
              className="glass-button pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Retry sync'}
            </button>
          )}
        </div>
      </section>

      <section className="glass-card mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-semibold leading-tight text-[var(--ink-strong)]">
              Your network
            </h2>
            <p className="text-[12px] text-[var(--ink-secondary)]">
              {peopleCount} {peopleCount === 1 ? 'connection' : 'connections'} in
              FollowApp
            </p>
          </div>
          <button
            type="button"
            onClick={onAddPerson}
            className="primary-action pressable flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
          >
            <UserPlus className="size-4" />
            Add someone
          </button>
        </div>

        <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          Sort into circles
        </p>
        <PeopleCircles
          contacts={contacts}
          groups={groups}
          onSetGroup={onSetGroup}
          onUpdateContact={onUpdateContact}
          onDeleteContact={onDeleteContact}
        />
      </section>

      <section className="glass-card mt-4 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/25 text-[var(--ink-strong)]">
            <Sparkles className="size-[18px]" />
          </span>
          <div>
            <h2 className="font-heading text-base font-semibold leading-tight text-[var(--ink-strong)]">
              Writing tone
            </h2>
            <p className="text-[12px] text-[var(--ink-secondary)]">
              {voiceLabel}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1].map((item) => (
                <div key={item} className="h-12 animate-pulse rounded-xl bg-white/20" />
              ))}
            </div>
          ) : memoryLoadError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-4 text-sm text-[var(--ink-secondary)]">
              Writing preferences could not be loaded. Your existing data has
              not been changed.
            </div>
          ) : insights.length === 0 ? (
            <div className="rounded-xl border border-[var(--hairline)] bg-white/15 px-4 py-5 text-center">
              <p className="text-pretty text-sm text-[var(--ink-secondary)]">
                Nothing learned yet. As you send, skip, and edit openers,
                FollowApp picks up your style and adapts — all tuned to a{' '}
                <span className="font-medium text-[var(--ink-strong)]">{voiceLabel}</span>{' '}
                voice for now.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {insights.map((insight, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2.5 rounded-xl border border-[var(--hairline)] bg-white/15 px-4 py-3 text-pretty text-sm leading-relaxed text-[var(--ink-body)]"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--ink-tertiary)]" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="glass-card mt-4 p-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
            <Lock className="size-[18px]" />
          </span>
          <div className="text-pretty text-sm leading-relaxed text-[var(--ink-secondary)]">
            <p>
              <span className="font-medium text-[var(--ink-strong)]">
                Private by default, controlled by you.
              </span>{' '}
              Contacts and writing preferences are stored in a device-scoped
              cloud copy. Signing in links that copy to your account. FollowApp
              never records a message as sent until you confirm it after
              returning from the delivery app.
            </p>
            <Link href="/privacy" className="mt-2 inline-block font-medium text-primary">
              Read the privacy policy
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3">
        {confirming === 'memory' ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-pretty text-sm font-medium">
              Clear everything FollowApp has learned?
            </p>
            <p className="mt-1 text-pretty text-[13px] text-muted-foreground">
              Your people stay in FollowApp, but learned writing preferences
              reset. This can&apos;t be undone.
            </p>
            {actionError && (
              <p className="mt-2 text-sm font-medium text-destructive">{actionError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleClearMemory}
                disabled={clearing}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                {clearing ? 'Clearing…' : 'Yes, clear it'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(null)
                  setActionError(null)
                  setSignOutCanDiscard(false)
                }}
                disabled={clearing}
                className="glass-button pressable min-h-11 flex-1 rounded-full px-4 text-sm font-medium"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirming('memory')
              setActionError(null)
            }}
            disabled={count === 0 || Boolean(memoryLoadError)}
            className="glass-button pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-[var(--ink-secondary)] disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            Clear what FollowApp has learned
          </button>
        )}

        {signedIn && confirming === 'signout' ? (
          <div className="rounded-2xl border border-[var(--hairline)] bg-white/15 p-4">
            <p className="text-sm font-medium text-foreground">Sign out of this device?</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Your account backup remains. FollowApp will clear this
              installation&apos;s local copy before returning to a fresh start.
              {syncState.pending > 0
                ? ` We’ll first try to back up ${syncState.pending} waiting ${syncState.pending === 1 ? 'change' : 'changes'}.`
                : ''}
            </p>
            {actionError && (
              <p className="mt-2 text-sm font-medium text-destructive">{actionError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void handleSignOut(false)}
                disabled={accountActionBusy}
                className="primary-action min-h-11 flex-1 rounded-full px-4 text-sm font-semibold disabled:opacity-60"
              >
                {accountActionBusy
                  ? 'Signing out…'
                  : syncState.pending > 0
                    ? 'Back up & sign out'
                    : 'Sign out'}
              </button>
              <button
                type="button"
                disabled={accountActionBusy}
                onClick={() => {
                  setConfirming(null)
                  setActionError(null)
                  setSignOutCanDiscard(false)
                }}
                className="glass-button min-h-11 flex-1 rounded-full px-4 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
            {signOutCanDiscard && (
              <button
                type="button"
                disabled={accountActionBusy}
                onClick={() => void handleSignOut(true)}
                className="mt-3 min-h-11 w-full rounded-full px-4 text-sm font-medium text-destructive disabled:opacity-60"
              >
                Discard waiting changes and sign out
              </button>
            )}
          </div>
        ) : signedIn ? (
          <button
            type="button"
            onClick={() => {
              setConfirming('signout')
              setActionError(null)
              setSignOutCanDiscard(false)
            }}
            className="glass-button pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-[var(--ink-secondary)]"
          >
            <LogOut className="size-4" />
            Sign out of this device
          </button>
        ) : null}

        {(confirming === 'account' || confirming === 'local') ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-foreground">
              {confirming === 'account'
                ? 'Permanently delete your account and all FollowApp data?'
                : 'Permanently delete this installation’s FollowApp data?'}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              This removes contacts, circles, reminders, writing preferences,
              and profile data covered by this {confirming === 'account' ? 'account' : 'installation'}.
              This can&apos;t be undone.
            </p>
            {actionError && (
              <p className="mt-2 text-sm font-medium text-destructive">{actionError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handleDeleteData(confirming)}
                disabled={accountActionBusy}
                className="min-h-11 flex-1 rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {accountActionBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                type="button"
                disabled={accountActionBusy}
                onClick={() => {
                  setConfirming(null)
                  setActionError(null)
                }}
                className="glass-button min-h-11 flex-1 rounded-full px-4 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirming(signedIn ? 'account' : 'local')
              setActionError(null)
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-destructive"
          >
            <Trash2 className="size-4" />
            {signedIn ? 'Delete account and all data' : 'Delete this installation’s data'}
          </button>
        )}

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--ink-secondary)]">
          <ShieldCheck className="size-3.5" />
          Anonymous data is scoped to this installation&apos;s generated device ID
        </p>
      </section>

      <SecureNudgeSheet
        open={secureOpen}
        initialEmail={session?.user.email}
        onClose={() => setSecureOpen(false)}
      />
    </div>
  )
}
