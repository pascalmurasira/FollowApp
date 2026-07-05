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
    <nav className="glass fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-glass-border px-2 pb-[env(safe-area-inset-bottom)] lg:order-1 lg:static lg:max-w-none lg:border-x-0 lg:border-t-0 lg:border-b lg:bg-card lg:px-8 lg:pb-0 lg:shadow-none">
      <div className="flex items-center justify-around gap-1 py-1.5 lg:justify-start lg:gap-1 lg:py-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors active:bg-muted/50 lg:max-w-40 lg:flex-row lg:gap-2 lg:px-4"
            >
              <span
                className={cn(
                  'flex items-center justify-center rounded-md px-5 py-1 transition-colors lg:p-0',
                  active ? 'bg-primary/10 text-primary lg:bg-transparent' : 'text-muted-foreground',
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
