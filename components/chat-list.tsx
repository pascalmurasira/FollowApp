'use client'

import { useMemo } from 'react'
import { CalendarDays, CheckCircle2, Lightbulb } from 'lucide-react'
import type { Contact } from '@/lib/types'
import { ContactAvatar } from '@/components/contact-avatar'
import { driftLevel, messageMinutesAgo } from '@/lib/format'
import {
  formatFollowUpDate,
  nextFollowUpForContact,
} from '@/lib/contact-dates'
import {
  latestEncounter,
  peopleGroupsByLatestEvent,
} from '@/lib/encounters'

interface PeopleAnchor {
  text: string
  status?: 'Promise' | 'Memory' | 'Ready'
}

function relationshipAnchor(contact: Contact): PeopleAnchor {
  const encounter = latestEncounter(contact)
  if (encounter?.nextStep?.status === 'open') {
    const due = encounter.nextStep.dueOn
      ? ` · ${formatFollowUpDate(encounter.nextStep.dueOn, { weekday: 'short' })}`
      : ''
    return {
      text: `${encounter.nextStep.label}${due}`,
      status: 'Promise',
    }
  }
  if (encounter?.memorySeed) {
    return { text: encounter.memorySeed, status: 'Memory' }
  }

  const last = contact.messages[contact.messages.length - 1]
  if (last) {
    return {
      text: `${last.sender === 'me' ? 'You: ' : ''}${last.text}`,
    }
  }
  const ready = driftLevel(contact.daysSinceContact, contact.tier) === 'cold'
  return {
    text: `Next follow-up ${formatFollowUpDate(nextFollowUpForContact(contact))}`,
    status: ready ? 'Ready' : undefined,
  }
}

export function ChatList({
  contacts,
  onOpen,
}: {
  contacts: Contact[]
  onOpen: (id: string) => void
}) {
  const groups = useMemo(() => peopleGroupsByLatestEvent(contacts), [contacts])

  return (
    <div className="space-y-6 px-4 pb-5 pt-3 sm:px-6 lg:px-8">
      {groups.events.map((group) => (
        <section key={group.id} aria-labelledby={`people-event-${group.id}`}>
          <div className="mb-2 flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <h2
                id={`people-event-${group.id}`}
                className="truncate text-[14px] font-semibold text-[var(--ink-strong)]"
              >
                {group.name}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--ink-secondary)]">
                <CalendarDays className="size-3.5" />
                {group.date ? formatEventDate(group.date) : 'Recent event'}
              </p>
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-secondary)]">
              {group.contacts.length} {group.contacts.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <PeopleRows contacts={group.contacts} onOpen={onOpen} />
        </section>
      ))}

      {groups.other.length > 0 && (
        <section aria-labelledby="people-other">
          <div className="mb-2 flex items-end justify-between gap-3 px-1">
            <div>
              <h2
                id="people-other"
                className="text-[14px] font-semibold text-[var(--ink-strong)]"
              >
                Other people
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
                Relationships beyond recent events
              </p>
            </div>
            <span className="text-[12px] tabular-nums text-[var(--ink-secondary)]">
              {groups.other.length}
            </span>
          </div>
          <PeopleRows
            contacts={[...groups.other].sort((a, b) => {
              const aLast = a.messages[a.messages.length - 1]
              const bLast = b.messages[b.messages.length - 1]
              return (
                (aLast ? messageMinutesAgo(aLast) : Infinity) -
                (bLast ? messageMinutesAgo(bLast) : Infinity)
              )
            })}
            onOpen={onOpen}
          />
        </section>
      )}
    </div>
  )
}

function PeopleRows({
  contacts,
  onOpen,
}: {
  contacts: Contact[]
  onOpen: (id: string) => void
}) {
  return (
    <ul className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-black/[0.04]">
      {contacts.map((contact, index) => {
        const anchor = relationshipAnchor(contact)
        return (
          <li key={contact.id} className={index > 0 ? 'border-t border-border/70' : ''}>
            <button
              type="button"
              onClick={() => onOpen(contact.id)}
              className="pressable flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <ContactAvatar contact={contact} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-heading text-[16px] font-semibold leading-tight text-[var(--ink-strong)]">
                    {contact.name}
                  </p>
                  {anchor.status && <AnchorBadge status={anchor.status} />}
                </div>
                <p className="mt-1 truncate text-[13px] leading-snug text-[var(--ink-secondary)]">
                  {anchor.text}
                </p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function AnchorBadge({ status }: { status: NonNullable<PeopleAnchor['status']> }) {
  const icon =
    status === 'Promise' ? (
      <CheckCircle2 className="size-3" />
    ) : status === 'Memory' ? (
      <Lightbulb className="size-3" />
    ) : null
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-[var(--ink-secondary)]">
      {icon}
      {status}
    </span>
  )
}

function formatEventDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
