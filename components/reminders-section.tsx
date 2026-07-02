'use client'

import { Bell, BellRing, Check, Clock, X } from 'lucide-react'
import type { Reminder } from '@/hooks/use-reminders'
import { presetToDueAt } from '@/hooks/use-reminders'
import { cn } from '@/lib/utils'

/** Friendly due phrasing, e.g. "Due now", "in 2h", "Tomorrow 9:00 AM". */
function dueLabel(dueAt: number): string {
  const now = Date.now()
  const diff = dueAt - now
  if (diff <= 0) return 'Due now'

  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours}h`

  const d = new Date(dueAt)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const days = Math.round(hours / 24)
  if (days === 1) return `Tomorrow ${time}`
  if (days < 7) {
    const weekday = d.toLocaleDateString([], { weekday: 'long' })
    return `${weekday} ${time}`
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` ${time}`
}

export function RemindersSection({
  due,
  upcoming,
  onComplete,
  onSnooze,
  onDismiss,
}: {
  due: Reminder[]
  upcoming: Reminder[]
  onComplete: (id: string) => void
  onSnooze: (id: string, dueAt: number) => void
  onDismiss: (id: string) => void
}) {
  if (due.length === 0 && upcoming.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Bell className="size-3.5" />
        Reminders
        {due.length > 0 && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-primary">
            <BellRing className="size-3" />
            {due.length} due
          </span>
        )}
      </h2>

      <div className="flex flex-col gap-2">
        {due.map((r) => (
          <ReminderRow
            key={r.id}
            reminder={r}
            isDue
            onComplete={onComplete}
            onSnooze={onSnooze}
            onDismiss={onDismiss}
          />
        ))}
        {upcoming.map((r) => (
          <ReminderRow
            key={r.id}
            reminder={r}
            onComplete={onComplete}
            onSnooze={onSnooze}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </section>
  )
}

function ReminderRow({
  reminder,
  isDue = false,
  onComplete,
  onSnooze,
  onDismiss,
}: {
  reminder: Reminder
  isDue?: boolean
  onComplete: (id: string) => void
  onSnooze: (id: string, dueAt: number) => void
  onDismiss: (id: string) => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl p-3.5 shadow-card',
        isDue ? 'border border-primary/25 bg-primary/[0.06]' : 'bg-card',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          isDue ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground',
        )}
      >
        {isDue ? <BellRing className="size-4" /> : <Clock className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium leading-tight text-foreground">
          {reminder.note}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {reminder.contactName && (
            <span className="truncate">{reminder.contactName}</span>
          )}
          {reminder.contactName && <span aria-hidden="true">·</span>}
          <span className={cn(isDue && 'font-medium text-primary')}>
            {dueLabel(reminder.dueAt)}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onSnooze(reminder.id, presetToDueAt('tomorrow'))}
          aria-label="Snooze reminder to tomorrow"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
        >
          <Clock className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onDismiss(reminder.id)}
          aria-label="Dismiss reminder"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onComplete(reminder.id)}
          aria-label="Mark reminder done"
          className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
        >
          <Check className="size-4" />
        </button>
      </div>
    </div>
  )
}
