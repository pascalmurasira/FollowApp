'use client'

import { Sparkles, MessageCircle, User } from 'lucide-react'
import type { Tab } from '@/lib/types'
import { cn } from '@/lib/utils'

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'nudges', label: 'Follow-ups', icon: Sparkles },
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'you', label: 'You', icon: User },
]

export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-glass-border px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around gap-1 py-1.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
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
                  'flex items-center justify-center rounded-full px-5 py-1 transition-colors',
                  active ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-[20px]" strokeWidth={active ? 2.4 : 2} />
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
