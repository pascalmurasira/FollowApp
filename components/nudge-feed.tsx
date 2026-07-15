'use client'

import { useMemo } from 'react'
import { Sparkles, Check } from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { SnoozeDuration } from '@/hooks/use-engagement'
import { NudgeCard } from '@/components/nudge-card'
import { useNudges } from '@/hooks/use-nudges'
import { cadenceForTier, healthLevel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function NudgeFeed({
  contacts,
  voice,
  pinnedIds = [],
  snoozedIds = [],
  groups = [],
  groupFilter = null,
  onFilterChange,
  onOpen,
  onSend,
  onSnooze,
}: {
  contacts: Contact[]
  voice: string
  pinnedIds?: string[]
  snoozedIds?: string[]
  groups?: string[]
  groupFilter?: string | null
  onFilterChange?: (group: string | null) => void
  onOpen: (id: string) => void
  onSend: (id: string, text: string) => Promise<void>
  onSnooze: (id: string, duration: SnoozeDuration) => void
}) {
  // Connections needing a follow-up: chosen contacts first, then by who's most
  // overdue *relative to their tier's cadence* — so a key contact overdue by a
  // week outranks a casual one overdue by a month. Snoozed people drop off
  // until their snooze expires. An active circle filter narrows the feed.
  const drifting = useMemo(() => {
    const pinnedSet = new Set(pinnedIds)
    const snoozedSet = new Set(snoozedIds)
    const overdueRatio = (c: Contact) =>
      c.daysSinceContact / cadenceForTier(c.tier)
    return contacts
      .filter(
        (c) =>
          healthLevel(c.daysSinceContact, c.tier) !== 'on-track' &&
          !snoozedSet.has(c.id),
      )
      .filter((c) => !groupFilter || (c.groups ?? []).includes(groupFilter))
      .sort((a, b) => {
        const aPinned = pinnedSet.has(a.id)
        const bPinned = pinnedSet.has(b.id)
        if (aPinned !== bPinned) return aPinned ? -1 : 1
        return overdueRatio(b) - overdueRatio(a)
      })
  }, [contacts, pinnedIds, snoozedIds, groupFilter])

  const { nudges, loading } = useNudges(drifting, voice)

  // One person to focus on today, plus the rest below it.
  const dailyPick = drifting[0]
  const rest = drifting.slice(1)

  return (
    <div className="relative z-[1] grid min-w-0 gap-6 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:gap-6 lg:px-8 lg:py-7">
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
            Today&apos;s follow-up
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
            loading={loading && !nudges[dailyPick.id]}
            pinned={pinnedIds.includes(dailyPick.id)}
            featured
            onOpen={() => onOpen(dailyPick.id)}
            onSend={(text) => onSend(dailyPick.id, text)}
              onSnooze={(duration) => onSnooze(dailyPick.id, duration)}
          />
        </section>
      ) : (
        <AllCaughtUp />
      )}

      {rest.length > 0 && (
        <section className="min-w-0 flex flex-col gap-3 lg:col-span-5">
          <SectionLabel>
            Needs a follow-up
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
                loading={loading && !nudges[contact.id]}
                pinned={pinnedIds.includes(contact.id)}
                onOpen={() => onOpen(contact.id)}
                onSend={(text) => onSend(contact.id, text)}
                onSnooze={(duration) => onSnooze(contact.id, duration)}
              />
            ))}
          </div>
        </section>
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

function AllCaughtUp() {
  return (
    <div className="glass-hero mx-4 flex flex-col items-center gap-4 px-6 py-14 text-center sm:mx-6 lg:col-span-12">
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
        <Check className="size-6" strokeWidth={2.25} />
      </div>
      <div className="max-w-[18rem]">
        <p className="font-serif text-2xl font-medium leading-tight text-balance">
          You&apos;re all caught up
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)] text-pretty">
          No follow-ups are due right now. Check back tomorrow.
        </p>
      </div>
    </div>
  )
}
