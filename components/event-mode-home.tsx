'use client'

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Lightbulb,
  MapPin,
  QrCode,
  ScanLine,
  Users,
} from 'lucide-react'
import type { Contact } from '@/lib/types'
import { ContactAvatar } from '@/components/contact-avatar'
import {
  eventActionStack,
  normalizeEncounters,
  type ConferenceSession,
} from '@/lib/encounters'

export function EventModeHome({
  session,
  contacts,
  onManage,
  onScan,
  onShowCard,
  onReview,
}: {
  session: ConferenceSession
  contacts: Contact[]
  onManage: () => void
  onScan: () => void
  onShowCard: () => void
  onReview: () => void
}) {
  const eventContacts = contacts
    .filter((contact) =>
      normalizeEncounters(contact.encounters).some(
        (encounter) => encounter.event?.id === session.id,
      ),
    )
    .sort((a, b) => {
      const aCapture = normalizeEncounters(a.encounters).find(
        (encounter) => encounter.event?.id === session.id,
      )?.capturedAt
      const bCapture = normalizeEncounters(b.encounters).find(
        (encounter) => encounter.event?.id === session.id,
      )?.capturedAt
      return (bCapture ?? '').localeCompare(aCapture ?? '')
    })
  const stack = eventActionStack(eventContacts, session.id)
  const promises = stack.promises.length
  const remembered = eventContacts.filter((contact) =>
    normalizeEncounters(contact.encounters).some(
      (encounter) =>
        encounter.event?.id === session.id && Boolean(encounter.memorySeed),
    ),
  ).length

  return (
    <div className="relative z-[1] mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
      <section className="overflow-hidden rounded-[2rem] bg-card text-card-foreground shadow-card-lg ring-1 ring-black/[0.04]">
        <div className="border-b border-border/70 px-5 pb-5 pt-5 sm:px-7 sm:pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--status-on-track)]">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--status-on-track)] opacity-30" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-[var(--status-on-track)]" />
                </span>
                Event mode is live
              </div>
              <button
                type="button"
                onClick={onManage}
                className="pressable mt-2 block max-w-full text-left"
              >
                <h2 className="truncate font-heading text-[30px] font-bold leading-tight tracking-[-0.04em] text-[var(--ink-strong)] sm:text-4xl">
                  {session.name}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink-secondary)]">
                  {session.date && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" />
                      {formatEventDate(session.date)}
                    </span>
                  )}
                  {session.location && (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="size-4 shrink-0" />
                      <span className="truncate">{session.location}</span>
                    </span>
                  )}
                </p>
              </button>
            </div>
            <button
              type="button"
              onClick={onManage}
              className="glass-button pressable min-h-11 shrink-0 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-strong)]"
            >
              Manage
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border/70 bg-secondary/35">
          <Metric icon={<Users className="size-4" />} value={eventContacts.length} label="captured" />
          <Metric icon={<Lightbulb className="size-4" />} value={remembered} label="remembered" />
          <Metric icon={<CheckCircle2 className="size-4" />} value={promises} label="promises" />
        </div>
      </section>

      <section aria-label="Conference capture actions" className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onScan}
          className="primary-action pressable col-span-2 flex min-h-20 items-center justify-center gap-3 rounded-[1.75rem] px-6 text-[18px] font-semibold shadow-card-lg"
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white/10">
            <ScanLine className="size-6" />
          </span>
          Capture someone
        </button>
        <button
          type="button"
          onClick={onShowCard}
          className="glass-button pressable flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-[var(--ink-strong)]"
        >
          <QrCode className="size-5" />
          My QR
        </button>
        <button
          type="button"
          onClick={onReview}
          disabled={eventContacts.length === 0}
          className="glass-button pressable flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-[var(--ink-strong)] disabled:opacity-40"
        >
          Review event
          <ArrowRight className="size-4" />
        </button>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-[var(--ink-strong)]">
            Just captured
          </h3>
          {eventContacts.length > 0 && (
            <span className="text-[12px] text-[var(--ink-secondary)]">
              Details can wait
            </span>
          )}
        </div>
        {eventContacts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/70 px-6 py-9 text-center">
            <p className="font-heading text-lg font-semibold text-[var(--ink-strong)]">
              Ready for the first introduction
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-[var(--ink-secondary)]">
              Capture their card, add one detail you want to remember, then get
              straight back to the conversation.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-black/[0.04]">
            {eventContacts.slice(0, 4).map((contact, index) => {
              const encounter = normalizeEncounters(contact.encounters).find(
                (item) => item.event?.id === session.id,
              )
              return (
                <div
                  key={contact.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    index > 0 ? 'border-t border-border/70' : ''
                  }`}
                >
                  <ContactAvatar contact={contact} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-[var(--ink-strong)]">
                      {contact.name}
                    </p>
                    <p className="truncate text-[13px] text-[var(--ink-secondary)]">
                      {encounter?.memorySeed ??
                        encounter?.nextStep?.label ??
                        contact.title ??
                        'Saved — add a memory when the rush slows down'}
                    </p>
                  </div>
                  {encounter?.nextStep?.status === 'open' && (
                    <span className="shrink-0 rounded-full bg-[var(--status-due-soon-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--status-due-soon)]">
                      Promise
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <div className="flex flex-col items-center px-2 py-4 text-center">
      <span className="flex items-center gap-1.5 text-[20px] font-bold tabular-nums text-[var(--ink-strong)]">
        <span className="text-[var(--ink-tertiary)]">{icon}</span>
        {value}
      </span>
      <span className="mt-0.5 text-[11px] font-medium text-[var(--ink-secondary)]">
        {label}
      </span>
    </div>
  )
}

function formatEventDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
