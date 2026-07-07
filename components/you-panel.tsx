'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  Sparkles,
  Trash2,
  ShieldCheck,
  Lock,
  UserPlus,
  QrCode,
  ChevronRight,
} from 'lucide-react'
import type { Contact } from '@/lib/types'
import { getDeviceId } from '@/lib/device-id'
import { ProfileHeader } from '@/components/profile-header'
import { PeopleCircles } from '@/components/people-circles'
import { DEMO_CONTACT_IDS } from '@/lib/mock-data'

interface Learnings {
  count: number
  insights: string[]
}

const fetcher = ([url, deviceId]: [string, string]): Promise<Learnings> =>
  fetch(url, { headers: { 'X-FollowApp-Device-Id': deviceId } }).then((r) =>
    r.json(),
  )

export function YouPanel({
  voiceLabel,
  contacts,
  streak,
  groups,
  onAddPerson,
  onSetGroup,
  onShowCard,
}: {
  voiceLabel: string
  contacts: Contact[]
  streak: number
  groups: string[]
  onAddPerson: () => void
  onSetGroup: (contactId: string, group: string | null) => void
  onShowCard: () => void
}) {
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
  const { data, isLoading, mutate } = useSWR<Learnings>(
    deviceId ? ['/api/memory', deviceId] : null,
    fetcher,
  )
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)

  const insights = data?.insights ?? []
  const count = data?.count ?? 0

  const handleClear = async () => {
    if (!deviceId) return
    setClearing(true)
    // Optimistically empty the panel.
    mutate({ count: 0, insights: [] }, false)
    try {
      await fetch('/api/memory', {
        method: 'DELETE',
        headers: { 'X-FollowApp-Device-Id': deviceId },
      })
    } catch (error) {
      console.error('[v0] Failed to clear memory:', error)
    } finally {
      setClearing(false)
      setConfirming(false)
      mutate()
    }
  }

  return (
    <div className="relative z-[1] mx-auto max-w-4xl px-5 py-5 sm:px-8 lg:py-7">
      {/* Profile */}
      <ProfileHeader
        voiceLabel={voiceLabel}
        peopleCount={peopleCount}
        streak={streak}
        sentCount={sentCount}
      />

      {/* Shareable digital business card */}
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
          <span className="block text-[12px] text-[var(--ink-secondary)] text-pretty">
            Show your QR so anyone can save you in a tap
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>

      {/* People management */}
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
            className="primary-action pressable flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
          >
            <UserPlus className="size-4" />
            Add someone
          </button>
        </div>

        <p className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          Sort into circles
        </p>
        <PeopleCircles
          contacts={contacts}
          groups={groups}
          onSetGroup={onSetGroup}
        />
      </section>

      {/* Voice summary */}
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
              {[0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-white/20" />
              ))}
            </div>
          ) : insights.length === 0 ? (
            <div className="rounded-xl border border-[var(--hairline)] bg-white/15 px-4 py-5 text-center">
              <p className="text-sm text-[var(--ink-secondary)] text-pretty">
                Nothing learned yet. As you send, skip, and edit openers,
                FollowApp picks up your style and adapts — all tuned to a{' '}
                <span className="font-medium text-[var(--ink-strong)]">{voiceLabel}</span>{' '}
                voice for now.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {insights.map((insight, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-xl border border-[var(--hairline)] bg-white/15 px-4 py-3 text-sm leading-relaxed text-pretty text-[var(--ink-body)]"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--ink-tertiary)]" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Privacy reassurance */}
      <section className="glass-card mt-4 p-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
            <Lock className="size-[18px]" />
          </span>
          <div className="text-sm leading-relaxed text-pretty text-[var(--ink-secondary)]">
            <p>
              <span className="font-medium text-[var(--ink-strong)]">
                Private by default, controlled by you.
              </span>{' '}
              FollowApp stores your contacts and writing preferences for this
              device so your network survives reloads. Messages are never sent
              without your review, and you can clear what it has learned anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Clear control */}
      <section className="mt-4">
        {confirming ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-pretty">
              Clear everything FollowApp has learned?
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground text-pretty">
              Your openers will reset to the default {voiceLabel} voice. This
              can&apos;t be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleClear}
                disabled={clearing}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                {clearing ? 'Clearing…' : 'Yes, clear it'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
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
            onClick={() => setConfirming(true)}
            disabled={count === 0}
            className="glass-button pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-[var(--ink-secondary)] disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            Clear what FollowApp has learned
          </button>
        )}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[var(--ink-secondary)]">
          <ShieldCheck className="size-3.5" />
          Stored under this device&apos;s private FollowApp key
        </p>
      </section>
    </div>
  )
}
