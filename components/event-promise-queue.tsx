'use client'

import { ArrowRight, CheckCircle2, Clock3, Inbox } from 'lucide-react'
import type { Contact } from '@/lib/types'
import { ContactAvatar } from '@/components/contact-avatar'
import {
  eventActionStack,
  normalizeEncounters,
  type EncounterEventSummary,
} from '@/lib/encounters'

export function EventPromiseQueue({
  contacts,
  summary,
  onOpen,
  onReview,
}: {
  contacts: Contact[]
  summary: EncounterEventSummary
  onOpen: (contactId: string) => void
  onReview: () => void
}) {
  const stack = eventActionStack(contacts, summary.event.id)
  const priority = [...stack.promises, ...stack.warmFollowUps].slice(0, 3)

  return (
    <section className="min-w-0 lg:col-span-12">
      <div className="mb-3 flex items-center justify-between px-0.5">
        <div>
          <p className="text-sm font-semibold text-[var(--ink-strong)]">
            Close the loop from {summary.event.name}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
            Promises first. Everything else can wait.
          </p>
        </div>
        <button
          type="button"
          onClick={onReview}
          className="glass-button pressable min-h-11 shrink-0 rounded-full px-4 text-[12px] font-semibold text-[var(--ink-strong)]"
        >
          Review event
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <QueueMetric
          icon={<CheckCircle2 className="size-4" />}
          value={stack.promises.length}
          label="promises to keep"
          emphasized
        />
        <QueueMetric
          icon={<Clock3 className="size-4" />}
          value={stack.warmFollowUps.length}
          label="warm follow-ups"
        />
        <QueueMetric
          icon={<Inbox className="size-4" />}
          value={stack.savedForLater.length}
          label="saved for later"
        />
      </div>

      {priority.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-black/[0.04]">
          {priority.map((contact, index) => {
            const encounter = normalizeEncounters(contact.encounters).find(
              (item) => item.event?.id === summary.event.id,
            )
            const promise = encounter?.nextStep?.status === 'open'
              ? encounter.nextStep
              : undefined
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => onOpen(contact.id)}
                className={`pressable flex w-full items-center gap-3 px-4 py-3 text-left ${
                  index > 0 ? 'border-t border-border/70' : ''
                }`}
              >
                <ContactAvatar contact={contact} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[var(--ink-strong)]">
                    {contact.name}
                  </p>
                  <p className="truncate text-[13px] text-[var(--ink-secondary)]">
                    {promise
                      ? `You promised to ${promise.label.toLowerCase()}${
                          promise.dueOn ? ` · ${formatDueDate(promise.dueOn)}` : ''
                        }`
                      : encounter?.memorySeed ?? 'A warm introduction worth continuing'}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[var(--ink-tertiary)]" />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function QueueMetric({
  icon,
  value,
  label,
  emphasized = false,
}: {
  icon: React.ReactNode
  value: number
  label: string
  emphasized?: boolean
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl px-3 py-3 text-center ring-1 ${
        emphasized
          ? 'bg-[var(--action-bg)] text-[var(--action-fg)] ring-transparent'
          : 'bg-card text-[var(--ink-strong)] ring-black/[0.04]'
      }`}
    >
      <div className="flex items-center justify-center gap-1.5">
        {icon}
        <span className="text-xl font-bold tabular-nums">{value}</span>
      </div>
      <p
        className={`mt-1 min-h-[2.25rem] text-[10.5px] font-medium leading-tight ${
          emphasized
            ? 'text-[var(--action-fg)] opacity-70'
            : 'text-[var(--ink-secondary)]'
        }`}
      >
        {label}
      </p>
    </div>
  )
}

function formatDueDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}
