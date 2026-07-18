'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Lightbulb,
  X,
} from 'lucide-react'
import type {
  Contact,
  FollowUpDisposition,
  NextStepKind,
} from '@/lib/types'
import type { ContactUpdateInput } from '@/lib/contacts-store'
import {
  eventGroupsFromContacts,
  normalizeEncounters,
  NEXT_STEP_OPTIONS,
  reviewEncounter,
} from '@/lib/encounters'
import { ENCOUNTER_LIMITS } from '@/lib/persistence-limits'
import { ContactAvatar } from '@/components/contact-avatar'
import { cn } from '@/lib/utils'
import { useModalFocus } from '@/hooks/use-modal-focus'

export function ConferenceInboxSheet({
  open,
  contacts,
  initialEventId,
  onClose,
  onUpdate,
  onOpenContact,
}: {
  open: boolean
  contacts: Contact[]
  initialEventId?: string | null
  onClose: () => void
  onUpdate: (contactId: string, updates: ContactUpdateInput) => void
  onOpenContact: (contactId: string) => void
}) {
  const events = useMemo(() => eventGroupsFromContacts(contacts), [contacts])
  const [eventId, setEventId] = useState('')
  const [index, setIndex] = useState(0)
  const [memorySeed, setMemorySeed] = useState('')
  const [nextStepKind, setNextStepKind] = useState<NextStepKind | undefined>()
  const [dueOn, setDueOn] = useState('')
  const [disposition, setDisposition] =
    useState<FollowUpDisposition>('important')
  const wasOpenRef = useRef(false)
  const saveGuardRef = useRef(false)
  const seededReviewRef = useRef('')

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    const currentStillExists = events.some((item) => item.event.id === eventId)
    if (wasOpenRef.current && currentStillExists) return
    const requested = events.some((item) => item.event.id === initialEventId)
      ? initialEventId
      : events[0]?.event.id
    setEventId(requested ?? '')
    setIndex(0)
    wasOpenRef.current = true
  }, [eventId, events, initialEventId, open])

  const eventContacts = useMemo(() => {
    const list = contacts.filter(
      (contact) =>
        normalizeEncounters(contact.encounters).some(
          (encounter) => encounter.event?.id === eventId,
        ),
    )
    return [...list].sort((a, b) => {
      const aEncounter = normalizeEncounters(a.encounters).find(
        (encounter) => encounter.event?.id === eventId,
      )
      const bEncounter = normalizeEncounters(b.encounters).find(
        (encounter) => encounter.event?.id === eventId,
      )
      return (aEncounter?.capturedAt ?? '').localeCompare(
        bEncounter?.capturedAt ?? '',
      )
    })
  }, [contacts, eventId])
  const contact = eventContacts[index]
  const summary = events.find((item) => item.event.id === eventId)

  useEffect(() => {
    saveGuardRef.current = false
  }, [contact?.id, eventId])

  useEffect(() => {
    if (!open) {
      seededReviewRef.current = ''
      return
    }
    const seedIdentity = `${eventId}:${contact?.id ?? 'none'}`
    if (seededReviewRef.current === seedIdentity) return
    const encounter = contact
      ? normalizeEncounters(contact.encounters).find(
          (item) => item.event?.id === eventId,
        )
      : undefined
    setMemorySeed(encounter?.memorySeed ?? '')
    setNextStepKind(encounter?.nextStep?.kind)
    setDueOn(encounter?.nextStep?.dueOn ?? '')
    setDisposition(encounter?.disposition ?? 'important')
    seededReviewRef.current = seedIdentity
  }, [contact, eventId, open])

  const { portalRoot, dialogRef, modalRootRef } = useModalFocus(open, onClose)

  if (!open || !portalRoot) return null

  const saveAndMove = () => {
    if (!contact || saveGuardRef.current) return
    const encounterIndex = normalizeEncounters(contact.encounters).findIndex(
      (item) => item.event?.id === eventId,
    )
    if (encounterIndex < 0) return
    saveGuardRef.current = true
    const encounters = normalizeEncounters(contact.encounters)
    encounters[encounterIndex] = reviewEncounter(encounters[encounterIndex], {
      memorySeed,
      nextStepKind,
      dueOn,
      disposition,
    })
    onUpdate(contact.id, { encounters })
    setIndex((value) => value + 1)
  }

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-[55] flex items-end justify-center"
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/45 backdrop-blur-sm"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conference-inbox-title"
        tabIndex={-1}
        className="app-field relative isolate flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] shadow-xl outline-none"
      >
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] border-b border-[var(--hairline)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="conference-inbox-title"
                className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
              >
                Conference inbox
              </h2>
              <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                {summary
                  ? `You met ${summary.count}. ${summary.clearNextSteps} ${summary.clearNextSteps === 1 ? 'clear next step' : 'clear next steps'}.`
                  : 'Review one encounter at a time.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="glass-button pressable flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--ink-secondary)]"
            >
              <X className="size-5" />
            </button>
          </div>
          {events.length > 1 && (
            <select
              value={eventId}
              onChange={(event) => {
                setEventId(event.target.value)
                setIndex(0)
              }}
              aria-label="Choose conference"
              className="mt-3 h-11 w-full rounded-2xl border border-[var(--hairline)] bg-white/25 px-3 text-sm font-semibold text-[var(--ink-strong)] outline-none"
            >
              {events.map((item) => (
                <option key={item.event.id} value={item.event.id}>
                  {item.event.name} · {item.count}
                </option>
              ))}
            </select>
          )}
        </header>

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {!contact ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Check className="size-8 text-[var(--status-on-track)]" />
              <p className="font-heading text-xl font-semibold text-[var(--ink-strong)]">
                {eventContacts.length > 0 ? 'Event reviewed' : 'Nothing to review yet'}
              </p>
              {eventContacts.length > 0 && (
                <>
                  <p className="max-w-[16rem] text-sm text-[var(--ink-secondary)]">
                    Your clues and next steps are saved. FollowApp will surface
                    the promises that need attention first.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIndex(0)}
                      className="glass-button pressable min-h-11 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)]"
                    >
                      Review again
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="primary-action pressable min-h-11 rounded-full px-5 text-sm font-semibold"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="glass-hero flex items-center gap-3 rounded-3xl p-4">
                <ContactAvatar contact={contact} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-[18px] font-semibold text-[var(--ink-strong)]">
                    {contact.name}
                  </p>
                  <p className="truncate text-[13px] text-[var(--ink-secondary)]">
                    {contact.title ?? contact.relationship}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
                    {index + 1} of {eventContacts.length}
                  </p>
                </div>
              </div>

              <label className="glass-card block rounded-3xl p-4">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--ink-strong)]">
                  <Lightbulb className="size-4" />
                  Give future-you one clue
                </span>
                <textarea
                  value={memorySeed}
                  onChange={(event) => setMemorySeed(event.target.value)}
                  maxLength={ENCOUNTER_LIMITS.memorySeed}
                  rows={3}
                  placeholder="Met after the food-tech panel; expanding into Rwanda."
                  className="mt-3 w-full resize-none rounded-2xl border border-[var(--hairline)] bg-white/25 px-3 py-2.5 text-base leading-relaxed text-[var(--ink-body)] outline-none placeholder:text-[var(--ink-tertiary)] focus-visible:border-[var(--action-bg)]"
                />
              </label>

              <section className="glass-card rounded-3xl p-4">
                <p className="text-[12px] font-semibold text-[var(--ink-strong)]">
                  What happens next?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {NEXT_STEP_OPTIONS.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() =>
                        setNextStepKind((current) =>
                          current === option.kind ? undefined : option.kind,
                        )
                      }
                      aria-pressed={nextStepKind === option.kind}
                      className={cn(
                        'pressable min-h-10 rounded-full border px-3 text-[12px] font-semibold',
                        nextStepKind === option.kind
                          ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)]'
                          : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                      )}
                    >
                      {option.shortLabel}
                    </button>
                  ))}
                </div>
                {nextStepKind && (
                  <label className="mt-4 block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-tertiary)]">
                      When · optional
                    </span>
                    <div className="relative mt-2">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-tertiary)]" />
                      <input
                        type="date"
                        value={dueOn}
                        onInput={(event) => setDueOn(event.currentTarget.value)}
                        className="h-11 w-full rounded-2xl border border-[var(--hairline)] bg-white/25 pl-10 pr-3 text-base text-[var(--ink-body)] outline-none"
                      />
                    </div>
                  </label>
                )}
              </section>

              <section className="glass-card rounded-3xl p-4">
                <p className="text-[12px] font-semibold text-[var(--ink-strong)]">
                  Keep this in today’s plan?
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['important', 'Important'],
                      ['later', 'Later'],
                      ['none', 'No follow-up'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDisposition(value)}
                      aria-pressed={disposition === value}
                      className={cn(
                        'pressable min-h-11 rounded-2xl border px-2 text-[11px] font-semibold',
                        disposition === value
                          ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)]'
                          : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-tertiary)]">
                  Later keeps this out of today&apos;s plan until you review the
                  event again.
                </p>
              </section>
            </div>
          )}
        </div>

        {contact && (
          <footer className="relative z-[1] border-t border-[var(--hairline)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
                disabled={index === 0}
                aria-label="Previous person"
                className="glass-button pressable flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--ink-secondary)] disabled:opacity-30"
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={saveAndMove}
                className="primary-action pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
              >
                {index < eventContacts.length - 1 ? 'Save & next' : 'Save review'}
                {index < eventContacts.length - 1 ? (
                  <ArrowRight className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenContact(contact.id)
              }}
              className="pressable mt-2 min-h-10 w-full rounded-full text-[12px] font-semibold text-[var(--ink-secondary)]"
            >
              Open full contact
            </button>
          </footer>
        )}
      </section>
    </div>,
    portalRoot,
  )
}
