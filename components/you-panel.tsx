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
    <div className="mx-auto max-w-4xl px-5 py-5 sm:px-8 lg:py-7">
      {/* Profile */}
      <ProfileHeader
        voiceLabel={voiceLabel}
        peopleCount={peopleCount}
        streak={streak}
      />

      {/* Shareable digital business card */}
      <button
        type="button"
        onClick={onShowCard}
        className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card transition-colors active:bg-secondary/60"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary">
          <QrCode className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-semibold leading-tight">
            Your card
          </span>
          <span className="block text-[12px] text-muted-foreground text-pretty">
            Show your QR so anyone can save you in a tap
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>

      {/* People management */}
      <section className="mt-4 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-semibold leading-tight">
              Your network
            </h2>
            <p className="text-[12px] text-muted-foreground">
              {peopleCount} {peopleCount === 1 ? 'connection' : 'connections'} in
              FollowApp
            </p>
          </div>
          <button
            type="button"
            onClick={onAddPerson}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <UserPlus className="size-4" />
            Add someone
          </button>
        </div>

        <p className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Sort into circles
        </p>
        <PeopleCircles
          contacts={contacts}
          groups={groups}
          onSetGroup={onSetGroup}
        />
      </section>

      {/* Voice summary */}
      <section className="mt-4 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Sparkles className="size-[18px]" />
          </span>
          <div>
            <h2 className="font-heading text-base font-semibold leading-tight">
              What FollowApp has learned
            </h2>
            <p className="text-[12px] text-muted-foreground">
              Tunes your openers to sound like you
            </p>
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : insights.length === 0 ? (
            <div className="rounded-xl bg-secondary/50 px-4 py-5 text-center">
              <p className="text-sm text-muted-foreground text-pretty">
                Nothing learned yet. As you send, skip, and edit openers,
                FollowApp picks up your style and adapts — all tuned to a{' '}
                <span className="font-medium text-foreground">{voiceLabel}</span>{' '}
                voice for now.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {insights.map((insight, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-xl bg-secondary/50 px-4 py-3 text-sm leading-relaxed text-pretty"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Privacy reassurance */}
      <section className="mt-4 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Lock className="size-[18px]" />
          </span>
          <div className="text-sm leading-relaxed text-pretty text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                Only your habits, never your contacts.
              </span>{' '}
              FollowApp remembers which tones you pick and how you edit — tied
              to this device alone, never sold or shared. Clear it anytime.
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
                className="min-h-11 flex-1 rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors active:bg-muted"
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
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors active:bg-muted disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            Clear what FollowApp has learned
          </button>
        )}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Stored anonymously on this device
        </p>
      </section>
    </div>
  )
}
