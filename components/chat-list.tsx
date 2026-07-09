'use client'

import { useMemo } from 'react'
import type { Contact } from '@/lib/types'
import { ContactAvatar } from '@/components/contact-avatar'
import { relativeTime, driftLevel } from '@/lib/format'
import { cn } from '@/lib/utils'

function lastMessagePreview(contact: Contact) {
  const last = contact.messages[contact.messages.length - 1]
  if (!last) return { text: 'No messages yet', minutesAgo: null, mine: false }
  return {
    text: `${last.sender === 'me' ? 'You: ' : ''}${last.text}`,
    minutesAgo: last.minutesAgo,
    mine: last.sender === 'me',
  }
}

export function ChatList({
  contacts,
  onOpen,
}: {
  contacts: Contact[]
  onOpen: (id: string) => void
}) {
  // Most recently active conversations first.
  const ordered = useMemo(
    () =>
      [...contacts].sort((a, b) => {
        const al = a.messages[a.messages.length - 1]?.minutesAgo ?? Infinity
        const bl = b.messages[b.messages.length - 1]?.minutesAgo ?? Infinity
        return al - bl
      }),
    [contacts],
  )

  return (
    <ul className="flex flex-col pt-1">
      {ordered.map((contact) => {
        const preview = lastMessagePreview(contact)
        const level = driftLevel(contact.daysSinceContact)
        const time = preview.minutesAgo === null ? '' : relativeTime(preview.minutesAgo)
        return (
          <li key={contact.id}>
            <button
              type="button"
              onClick={() => onOpen(contact.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted"
            >
              <div className="relative">
                <ContactAvatar contact={contact} size="lg" />
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-card',
                    level === 'warm' && 'bg-accent',
                    level === 'cooling' && 'bg-[oklch(0.7_0.11_72)]',
                    level === 'cold' && 'bg-primary',
                  )}
                />
              </div>
              <div className="min-w-0 flex-1 border-b border-border/70 pb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-heading text-[16px] font-semibold leading-tight">
                    {contact.name}
                  </p>
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      level === 'cold'
                        ? 'font-medium text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    {time}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-muted-foreground">
                    {preview.text}
                  </p>
                  {level === 'cold' && (
                    <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
                      Drifting
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
