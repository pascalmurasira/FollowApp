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
    <nav className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.15rem)] z-10 mx-auto w-[min(26rem,calc(100%-2rem))] lg:order-1 lg:static lg:w-full lg:max-w-none lg:px-8 lg:pb-0">
      <div className="glass-card mx-auto flex max-w-md items-center justify-around gap-1 rounded-[var(--r-nav)] p-1.5 lg:mx-0 lg:justify-start lg:shadow-none">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'pressable flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors lg:max-w-40',
                active
                  ? 'bg-[var(--action-bg)] text-[var(--action-fg)]'
                  : 'text-[var(--ink-tertiary)]',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center transition-colors',
                  active ? 'text-[var(--action-fg)]' : 'text-[var(--ink-tertiary)]',
                )}
              >
                <Icon className="size-[20px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  'text-[11px] leading-none transition-colors',
                  active
                    ? 'font-semibold text-[var(--action-fg)]'
                    : 'sr-only font-medium text-[var(--ink-tertiary)] lg:not-sr-only',
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
