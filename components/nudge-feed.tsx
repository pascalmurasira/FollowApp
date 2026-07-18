'use client'

import { useMemo } from 'react'
import { Sparkles, Check, CalendarDays, QrCode, ScanLine } from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { SnoozeDuration } from '@/hooks/use-engagement'
import { NudgeCard } from '@/components/nudge-card'
import { useNudges } from '@/hooks/use-nudges'
import { cadenceForTier, healthLevel } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  formatFollowUpDate,
  nextFollowUpForContact,
} from '@/lib/contact-dates'
import type { ChannelId } from '@/lib/channels'
import { ConferenceModeCard } from '@/components/conference-mode-card'
import {
  conferencePriorityScore,
  hasActionableCommitment,
  isFollowUpDeferred,
  isFollowUpSuppressed,
  isPendingEncounterOnly,
  normalizeEncounters,
  type ConferenceSession,
  type EncounterEventSummary,
} from '@/lib/encounters'

export function NudgeFeed({
  contacts,
  voice,
  pinnedIds = [],
  snoozedIds = [],
  groups = [],
  groupFilter = null,
  onFilterChange,
  onOpen,
  onHandoff,
  onSnooze,
  onScan,
  onShowCard,
  conferenceSession,
  conferenceSummary,
  onManageConference,
  onReviewConference,
}: {
  contacts: Contact[]
  voice: string
  pinnedIds?: string[]
  snoozedIds?: string[]
  groups?: string[]
  groupFilter?: string | null
  onFilterChange?: (group: string | null) => void
  onOpen: (id: string, draft?: string) => void
  onHandoff: (id: string, text: string, preferred?: ChannelId) => void
  onSnooze: (id: string, duration: SnoozeDuration) => void
  onScan: () => void
  onShowCard: () => void
  conferenceSession: ConferenceSession | null
  conferenceSummary?: EncounterEventSummary
  onManageConference: () => void
  onReviewConference: () => void
}) {
  // Conference promises are explicit user intent and outrank generic cadence.
  // Pending captures stay in the Conference Inbox, while a live event remains
  // quiet so FollowApp never asks users to message people mid-conversation.
  const drifting = useMemo(() => {
    const pinnedSet = new Set(pinnedIds)
    const snoozedSet = new Set(snoozedIds)
    const overdueRatio = (c: Contact) =>
      c.daysSinceContact / cadenceForTier(c.tier)
    return contacts
      .filter(
        (c) => {
          const belongsToActiveEvent =
            conferenceSession?.active === true &&
            normalizeEncounters(c.encounters).some(
              (item) => item.event?.id === conferenceSession.id,
            )
          return (
            !belongsToActiveEvent &&
            !isPendingEncounterOnly(c) &&
            !isFollowUpDeferred(c) &&
            !isFollowUpSuppressed(c) &&
            (hasActionableCommitment(c) ||
              healthLevel(c.daysSinceContact, c.tier) !== 'on-track') &&
            !snoozedSet.has(c.id)
          )
        },
      )
      .filter((c) => !groupFilter || (c.groups ?? []).includes(groupFilter))
      .sort((a, b) => {
        const aPinned = pinnedSet.has(a.id)
        const bPinned = pinnedSet.has(b.id)
        const priorityDifference =
          conferencePriorityScore(b) - conferencePriorityScore(a)
        if (priorityDifference !== 0) return priorityDifference
        if (aPinned !== bPinned) return aPinned ? -1 : 1
        return overdueRatio(b) - overdueRatio(a)
      })
  }, [conferenceSession, contacts, pinnedIds, snoozedIds, groupFilter])

  // useNudges owns an effect keyed by this list. Keep the array identity stable
  // across its own loading/result renders or React will refetch forever.
  const todayPlan = useMemo(() => drifting.slice(0, 3), [drifting])
  const deferredCount = Math.max(0, drifting.length - todayPlan.length)
  const { nudges, loading } = useNudges(todayPlan, voice)

  const nextUp = useMemo(() => {
    const snoozedSet = new Set(snoozedIds)
    return contacts
      .filter(
        (contact) => {
          const belongsToActiveEvent =
            conferenceSession?.active === true &&
            normalizeEncounters(contact.encounters).some(
              (item) => item.event?.id === conferenceSession.id,
            )
          return (
            healthLevel(contact.daysSinceContact, contact.tier) === 'on-track' &&
            !belongsToActiveEvent &&
            !isPendingEncounterOnly(contact) &&
            !isFollowUpDeferred(contact) &&
            !isFollowUpSuppressed(contact) &&
            !snoozedSet.has(contact.id) &&
            (!groupFilter || (contact.groups ?? []).includes(groupFilter))
          )
        },
      )
      .sort((a, b) =>
        nextFollowUpForContact(a).localeCompare(nextFollowUpForContact(b)),
      )[0]
  }, [conferenceSession, contacts, groupFilter, snoozedIds])

  // A calm, capacity-aware plan: one focus plus at most two supporting actions.
  const dailyPick = todayPlan[0]
  const rest = todayPlan.slice(1)

  return (
    <div className="relative z-[1] grid min-w-0 gap-6 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:gap-6 lg:px-8 lg:py-7">
      <ConferenceModeCard
        session={conferenceSession}
        summary={conferenceSummary}
        onManage={onManageConference}
        onScan={onScan}
        onShowCard={onShowCard}
        onReview={onReviewConference}
      />
      {groups.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:col-span-12 [&::-webkit-scrollbar]:hidden">
          <FilterChip
            active={groupFilter === null}
            onClick={() => onFilterChange?.(null)}
          >
            Everyone
          </FilterChip>
          {groups.map((g) => (
            <FilterChip
              key={g}
              active={groupFilter === g}
              onClick={() => onFilterChange?.(groupFilter === g ? null : g)}
            >
              {g}
            </FilterChip>
          ))}
        </div>
      )}

      {dailyPick ? (
        <section className="min-w-0 flex flex-col gap-3 lg:col-span-7">
          <SectionLabel>
            Today&apos;s plan
            {loading && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                <Sparkles className="size-3 animate-pulse text-primary" />
                Writing openers
              </span>
            )}
          </SectionLabel>
          <NudgeCard
            contact={dailyPick}
            nudge={nudges[dailyPick.id]}
            pinned={pinnedIds.includes(dailyPick.id)}
            featured
            onOpen={(draft) => onOpen(dailyPick.id, draft)}
            onHandoff={(text, preferred) =>
              onHandoff(dailyPick.id, text, preferred)
            }
            onSnooze={(duration) => onSnooze(dailyPick.id, duration)}
          />
        </section>
      ) : (
        <AllCaughtUp
          nextContact={nextUp}
          hasContacts={contacts.length > 0}
          onOpen={onOpen}
          onScan={onScan}
          onShowCard={onShowCard}
        />
      )}

      {rest.length > 0 && (
        <section className="min-w-0 flex flex-col gap-3 lg:col-span-5">
          <SectionLabel>
            Next actions
            <span className="ml-auto tnum text-muted-foreground/70">
              {rest.length}
            </span>
          </SectionLabel>
          <div className="glass-card overflow-hidden">
            {rest.map((contact) => (
              <NudgeCard
                key={contact.id}
                contact={contact}
                nudge={nudges[contact.id]}
                pinned={pinnedIds.includes(contact.id)}
                onOpen={(draft) => onOpen(contact.id, draft)}
                onHandoff={(text, preferred) =>
                  onHandoff(contact.id, text, preferred)
                }
                onSnooze={(duration) => onSnooze(contact.id, duration)}
              />
            ))}
          </div>
        </section>
      )}

      {deferredCount > 0 && (
        <p className="px-1 text-center text-[12px] leading-relaxed text-[var(--ink-secondary)] lg:col-span-12">
          {deferredCount} more {deferredCount === 1 ? 'relationship is' : 'relationships are'} waiting quietly. Today’s plan stays intentionally small.
        </p>
      )}

      {dailyPick && nextUp && (
        <NextUpCard
          contact={nextUp}
          onOpen={() => onOpen(nextUp.id)}
          onScan={onScan}
          onShowCard={onShowCard}
        />
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'pressable shrink-0 rounded-[var(--r-chip)] border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)]'
          : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)] backdrop-blur',
      )}
    >
      {children}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-secondary)]">
      {children}
    </h2>
  )
}

function AllCaughtUp({
  nextContact,
  hasContacts,
  onOpen,
  onScan,
  onShowCard,
}: {
  nextContact?: Contact
  hasContacts: boolean
  onOpen: (id: string) => void
  onScan: () => void
  onShowCard: () => void
}) {
  const date = nextContact ? nextFollowUpForContact(nextContact) : null
  return (
    <div className="glass-hero mx-4 flex flex-col items-center gap-4 px-6 py-10 text-center sm:mx-6 lg:col-span-12">
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
        <Check className="size-6" strokeWidth={2.25} />
      </div>
      <div className="max-w-[18rem]">
        <p className="font-serif text-2xl font-medium leading-tight text-balance">
          {nextContact || hasContacts
            ? 'You’re all caught up'
            : 'Start your follow-up list'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)] text-pretty">
          {nextContact && date
            ? `${nextContact.name} is next on ${formatFollowUpDate(date, {
                weekday: 'short',
              })}.`
            : hasContacts
              ? 'Nothing needs attention right now. Snoozed follow-ups will return automatically.'
            : 'Scan a card to prepare a thoughtful first follow-up, or show your QR to share your details.'}
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-wrap justify-center gap-2">
        {nextContact && (
          <button
            type="button"
            onClick={() => onOpen(nextContact.id)}
            className="glass-button pressable flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)]"
          >
            <CalendarDays className="size-4" />
            View next
          </button>
        )}
        <button
          type="button"
          onClick={onScan}
          className="primary-action pressable flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
        >
          <ScanLine className="size-4" />
          Scan card
        </button>
        <button
          type="button"
          onClick={onShowCard}
          className="glass-button pressable flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)]"
        >
          <QrCode className="size-4" />
          My QR
        </button>
      </div>
    </div>
  )
}

function NextUpCard({
  contact,
  onOpen,
  onScan,
  onShowCard,
}: {
  contact: Contact
  onOpen: () => void
  onScan: () => void
  onShowCard: () => void
}) {
  return (
    <section className="glass-card flex min-w-0 items-center gap-3 p-4 lg:col-span-12">
      <CalendarDays className="size-5 shrink-0 text-[var(--ink-secondary)]" />
      <button type="button" onClick={onOpen} className="pressable min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-tertiary)]">
          Next up
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-[var(--ink-strong)]">
          {contact.name} · {formatFollowUpDate(nextFollowUpForContact(contact), {
            weekday: 'short',
          })}
        </span>
      </button>
      <button type="button" onClick={onScan} aria-label="Scan another card" className="glass-button pressable flex size-11 items-center justify-center rounded-full">
        <ScanLine className="size-4" />
      </button>
      <button type="button" onClick={onShowCard} aria-label="Show my QR code" className="glass-button pressable flex size-11 items-center justify-center rounded-full">
        <QrCode className="size-4" />
      </button>
    </section>
  )
}
