'use client'

import { Sparkles, MessageCircle, ListChecks, User } from 'lucide-react'
import type { Tab } from '@/lib/types'
import { cn } from '@/lib/utils'

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'nudges', label: 'Follow-ups', icon: Sparkles },
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'you', label: 'You', icon: User },
]

export function BottomNav({
  tab,
  onChange,
  badges = {},
}: {
  tab: Tab
  onChange: (tab: Tab) => void
  /** Per-tab count badges, e.g. due reminders on Follow-ups, open tasks. */
  badges?: Partial<Record<Tab, number>>
}) {
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-glass-border px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around gap-1 py-1.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          const badge = badges[id] ?? 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors active:bg-muted/50"
            >
              <span
                className={cn(
                  'relative flex items-center justify-center rounded-full px-5 py-1 transition-colors',
                  active ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-[20px]" strokeWidth={active ? 2.4 : 2} />
                {badge > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
                    aria-label={`${badge} ${badge === 1 ? 'item' : 'items'}`}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-[11px] leading-none transition-colors',
                  active
                    ? 'font-semibold text-primary'
                    : 'font-medium text-muted-foreground',
                )}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
