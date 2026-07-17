'use client'

import { Sparkles, Users, User } from 'lucide-react'
import type { Tab } from '@/lib/types'
import { cn } from '@/lib/utils'

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'nudges', label: 'Follow-ups', icon: Sparkles },
  { id: 'chats', label: 'People', icon: Users },
  { id: 'you', label: 'You', icon: User },
]

export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
}) {
  const activeIndex = Math.max(0, TABS.findIndex((item) => item.id === tab))

  return (
    <nav className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.15rem)] z-10 mx-auto w-[min(26rem,calc(100%-2rem))] lg:order-1 lg:static lg:w-full lg:max-w-none lg:px-8 lg:pb-0">
      <div className="glass-card relative mx-auto grid max-w-md grid-cols-3 items-center gap-1 overflow-hidden rounded-[var(--r-nav)] p-1.5 lg:mx-0 lg:shadow-none">
        <span
          key={tab}
          aria-hidden
          className="tab-active-pill primary-action pointer-events-none absolute bottom-1.5 top-1.5 z-0 rounded-full"
          style={{
            left: '0.375rem',
            width: 'calc((100% - 0.75rem) / 3)',
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'pressable relative z-[1] flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
                active
                  ? 'text-[var(--action-fg)]'
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
                    : 'font-medium text-[var(--ink-tertiary)]',
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
