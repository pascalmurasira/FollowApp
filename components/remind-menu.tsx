'use client'

import { useState } from 'react'
import { Sun, CalendarDays, CalendarClock, Check, ChevronLeft } from 'lucide-react'
import { presetToDueAt, type ReminderPreset } from '@/hooks/use-reminders'
import { cn } from '@/lib/utils'

const QUICK: { preset: ReminderPreset; label: string; icon: typeof Sun }[] = [
  { preset: 'tomorrow', label: 'Tomorrow', icon: Sun },
  { preset: 'in3days', label: 'In 3 days', icon: CalendarDays },
  { preset: 'nextweek', label: 'Next week', icon: CalendarClock },
]

/**
 * Inline "Remind me" control shown in place of a card's action row. Offers
 * quick presets plus a custom date/time, and hands back an epoch-ms due time.
 */
export function RemindMenu({
  onPick,
}: {
  onPick: (dueAt: number) => void
}) {
  const [custom, setCustom] = useState(false)
  const [value, setValue] = useState('')

  if (custom) {
    return (
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCustom(false)}
          aria-label="Back to quick options"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
        >
          <ChevronLeft className="size-5" />
        </button>
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Custom reminder date and time"
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none focus-visible:border-primary"
        />
        <button
          type="button"
          onClick={() => {
            if (!value) return
            const ts = new Date(value).getTime()
            if (!Number.isNaN(ts)) onPick(ts)
          }}
          disabled={!value}
          aria-label="Set custom reminder"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
        >
          <Check className="size-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {QUICK.map(({ preset, label, icon: Icon }) => (
        <button
          key={preset}
          type="button"
          onClick={() => onPick(presetToDueAt(preset))}
          className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-secondary text-sm font-medium text-foreground transition-colors active:bg-muted"
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setCustom(true)}
        className={cn(
          'flex min-h-11 items-center justify-center gap-2 rounded-full',
          'border border-border bg-card text-sm font-medium text-foreground transition-colors active:bg-muted',
        )}
      >
        <CalendarClock className="size-4" />
        Custom
      </button>
    </div>
  )
}
