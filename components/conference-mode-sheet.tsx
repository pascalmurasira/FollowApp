'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, MapPin, ScanLine, X } from 'lucide-react'
import type { ConferenceSession } from '@/lib/encounters'
import { ENCOUNTER_LIMITS } from '@/lib/persistence-limits'
import { useModalFocus } from '@/hooks/use-modal-focus'

export function ConferenceModeSheet({
  open,
  session,
  capturedCount,
  onClose,
  onStart,
  onUpdate,
  onScan,
  onReview,
  onEnd,
}: {
  open: boolean
  session: ConferenceSession | null
  capturedCount: number
  onClose: () => void
  onStart: (name: string, location?: string) => void
  onUpdate: (name: string, location?: string) => void
  onScan: (name: string, location?: string) => void
  onReview: () => void
  onEnd: (name: string, location?: string) => void
}) {
  const [name, setName] = useState("Today's event")
  const [location, setLocation] = useState('')

  useEffect(() => {
    if (!open) return
    setName(session?.name ?? "Today's event")
    setLocation(session?.location ?? '')
  }, [open, session])

  const { portalRoot, dialogRef, modalRootRef } = useModalFocus(open, onClose)

  if (!open || !portalRoot) return null
  const active = session?.active === true
  const validName = Boolean(name.trim())

  const saveDetails = () => {
    if (!validName) return
    if (active) onUpdate(name.trim(), location.trim() || undefined)
    else onStart(name.trim(), location.trim() || undefined)
  }

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conference-mode-title"
        tabIndex={-1}
        className="app-field relative isolate w-full max-w-md overflow-hidden rounded-t-[2rem] shadow-xl outline-none"
      >
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] flex items-start justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div>
            <h2
              id="conference-mode-title"
              className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
            >
              {active ? 'Conference mode is on' : 'Start conference mode'}
            </h2>
            <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
              {active
                ? `${capturedCount} ${capturedCount === 1 ? 'person' : 'people'} captured in this event`
                : 'Group every scan and review the details when the rush is over.'}
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
        </header>

        <div className="relative z-[1] space-y-4 px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
              Event name
            </span>
            <div className="relative mt-2">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-tertiary)]" />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={ENCOUNTER_LIMITS.eventName}
                autoFocus={!active}
                className="h-12 w-full rounded-2xl border border-[var(--hairline)] bg-white/25 pl-10 pr-4 text-base text-[var(--ink-body)] outline-none focus-visible:border-[var(--action-bg)]"
                placeholder="e.g. FutureTech Amsterdam"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
              Location · optional
            </span>
            <div className="relative mt-2">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-tertiary)]" />
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={ENCOUNTER_LIMITS.location}
                className="h-12 w-full rounded-2xl border border-[var(--hairline)] bg-white/25 pl-10 pr-4 text-base text-[var(--ink-body)] outline-none focus-visible:border-[var(--action-bg)]"
                placeholder="City or venue"
              />
            </div>
          </label>

          {active ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  onScan(name.trim(), location.trim() || undefined)
                }
                disabled={!validName}
                className="primary-action pressable flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-40"
              >
                <ScanLine className="size-4" />
                Scan next
              </button>
              <button
                type="button"
                onClick={() => {
                  saveDetails()
                  onReview()
                }}
                disabled={!validName || capturedCount === 0}
                className="glass-button pressable min-h-12 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)] disabled:opacity-40"
              >
                Review captures
              </button>
              <button
                type="button"
                onClick={saveDetails}
                disabled={!validName}
                className="glass-button pressable min-h-11 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)] disabled:opacity-40"
              >
                Save details
              </button>
              <button
                type="button"
                onClick={() =>
                  onEnd(name.trim(), location.trim() || undefined)
                }
                disabled={!validName}
                className="pressable min-h-11 rounded-full px-4 text-sm font-semibold text-[var(--ink-secondary)] disabled:opacity-40"
              >
                End & review
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={saveDetails}
              disabled={!validName}
              className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-40"
            >
              <ScanLine className="size-4" />
              Start and scan
            </button>
          )}
        </div>
      </section>
    </div>,
    portalRoot,
  )
}
