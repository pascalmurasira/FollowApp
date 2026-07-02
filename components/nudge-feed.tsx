'use client'

import { useMemo } from 'react'
import { Sparkles, Check } from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { Reminder } from '@/hooks/use-reminders'
import { NudgeCard } from '@/components/nudge-card'
import { RemindersSection } from '@/components/reminders-section'
import { useNudges } from '@/hooks/use-nudges'
import { cadenceForTier } from '@/lib/format'
import { cn } from '@/lib/utils'

export function NudgeFeed({
  contacts,
  voice,
  pinnedIds = [],
  snoozedIds = [],
  groups = [],
  groupFilter = null,
  dueReminders = [],
  upcomingReminders = [],
  onFilterChange,
  onOpen,
  onSend,
  onRemind,
  onAddToCalendar,
  onCompleteReminder,
  onSnoozeReminder,
  onDismissReminder,
}: {
  contacts: Contact[]
  voice: string
  pinnedIds?: string[]
  snoozedIds?: string[]
  groups?: string[]
  groupFilter?: string | null
  dueReminders?: Reminder[]
  upcomingReminders?: Reminder[]
  onFilterChange?: (group: string | null) => void
  onOpen: (id: string) => void
  onSend: (id: string, text: string) => Promise<void>
  /** Create a reminder for a contact due at the given epoch-ms time. */
  onRemind: (id: string, dueAt: number) => void
  /** Open the calendar modal seeded with a contact. */
  onAddToCalendar: (id: string) => void
  onCompleteReminder: (id: string) => void
  onSnoozeReminder: (id: string, dueAt: number) => void
  onDismissReminder: (id: string) => void
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
      .filter((c) => c.daysSinceContact >= 5 && !snoozedSet.has(c.id))
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
    <div className="flex flex-col gap-7 px-4 pt-1">
      {groups.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      <RemindersSection
        due={dueReminders}
        upcoming={upcomingReminders}
        onComplete={onCompleteReminder}
        onSnooze={onSnoozeReminder}
        onDismiss={onDismissReminder}
      />

      {dailyPick ? (
        <section className="flex flex-col gap-3">
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
            onRemind={(dueAt) => onRemind(dailyPick.id, dueAt)}
            onAddToCalendar={() => onAddToCalendar(dailyPick.id)}
          />
        </section>
      ) : (
        <AllCaughtUp />
      )}

      {rest.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>
            Needs a follow-up
            <span className="ml-auto tnum text-muted-foreground/70">
              {rest.length}
            </span>
          </SectionLabel>
          <div className="flex flex-col gap-3">
            {rest.map((contact) => (
              <NudgeCard
                key={contact.id}
                contact={contact}
                nudge={nudges[contact.id]}
                loading={loading && !nudges[contact.id]}
                pinned={pinnedIds.includes(contact.id)}
                onOpen={() => onOpen(contact.id)}
                onSend={(text) => onSend(contact.id, text)}
                onRemind={(dueAt) => onRemind(contact.id, dueAt)}
                onAddToCalendar={() => onAddToCalendar(contact.id)}
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
        'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  )
}

function AllCaughtUp() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-accent">
        <Check className="size-6" strokeWidth={2.25} />
      </div>
      <div className="max-w-[18rem]">
        <p className="font-serif text-2xl font-medium leading-tight text-balance">
          You&apos;re all caught up
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
          No follow-ups due right now. Your network&apos;s warm — check back
          tomorrow.
        </p>
      </div>
    </div>
  )
}
