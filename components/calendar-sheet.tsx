'use client'

import { useEffect, useState } from 'react'
import { X, CalendarPlus, Check } from 'lucide-react'
import {
  downloadICS,
  defaultEventTitle,
  guessDateFromText,
  toDateInputValue,
} from '@/lib/calendar'
import { cn } from '@/lib/utils'

const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
]

export interface CalendarSeed {
  /** Contact name used to prefill a friendly title, e.g. "Coffee with Maya". */
  contactName?: string
  /** Free text (e.g. a plan message) scanned for a mentioned day. */
  seedText?: string
}

export function CalendarSheet({
  open,
  seed,
  onClose,
}: {
  open: boolean
  seed: CalendarSeed | null
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(60)
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState(false)

  // Prefill sensible defaults from context each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setTitle(defaultEventTitle(seed?.contactName))
    setDate(guessDateFromText(seed?.seedText))
    setTime('10:00')
    setDuration(60)
    setLocation('')
    setNotes('')
    setDone(false)
  }, [open, seed])

  if (!open) return null

  const canSave = title.trim().length > 0 && date.length > 0

  const handleSave = () => {
    if (!canSave) return
    downloadICS({
      title: title.trim(),
      date,
      time,
      durationMinutes: duration,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    // Brief confirmation, then close — the .ics has begun downloading.
    setDone(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to calendar"
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-serif text-xl font-medium tracking-tight">
            Add to calendar
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="flex flex-col gap-4">
            <Field label="Title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Coffee with Maya"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Date" required className="flex-1">
                <input
                  type="date"
                  value={date}
                  min={toDateInputValue(new Date())}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </Field>
              <Field label="Time" className="flex-1">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </Field>
            </div>

            <Field label="Duration">
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      'flex-1 rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors',
                      duration === d.value
                        ? 'border-primary bg-primary/[0.08] text-primary'
                        : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Location" hint="Optional">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Blue Bottle, or a video link"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
              />
            </Field>

            <Field label="Notes" hint="Optional">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What you want to catch up on…"
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-base leading-relaxed outline-none focus-visible:border-primary"
              />
            </Field>
          </div>
        </div>

        <footer className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || done}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {done ? (
              <>
                <Check className="size-4" />
                Added — check your downloads
              </>
            ) : (
              <>
                <CalendarPlus className="size-4" />
                Download calendar invite
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground text-pretty">
            Opens in Google, Outlook, or Apple Calendar — no account needed.
          </p>
        </footer>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="flex items-baseline gap-2 px-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {required && <span className="text-xs text-primary">required</span>}
        {hint && (
          <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
      {children}
    </label>
  )
}
