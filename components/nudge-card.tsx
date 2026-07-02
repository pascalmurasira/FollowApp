'use client'

import { useState } from 'react'
import { ChevronRight, Clock, CalendarPlus, Check } from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { Nudge } from '@/hooks/use-nudges'
import { RemindMenu } from '@/components/remind-menu'
import { ContactAvatar } from '@/components/contact-avatar'
import { ChannelIcon } from '@/components/channel-icon'
import { lastTouchShort, healthLevel } from '@/lib/format'
import {
  deliver,
  resolveChannel,
  sendActionLabel,
  sentConfirmLabel,
} from '@/lib/channels'
import { getChannelPref } from '@/hooks/use-channel-pref'
import { cn } from '@/lib/utils'

export function NudgeCard({
  contact,
  nudge,
  loading,
  pinned = false,
  featured = false,
  onOpen,
  onSend,
  onRemind,
  onAddToCalendar,
}: {
  contact: Contact
  nudge?: Nudge
  loading: boolean
  pinned?: boolean
  featured?: boolean
  onOpen: () => void
  onSend: (text: string) => Promise<void>
  /** Create a reminder for this contact due at the given epoch-ms time. */
  onRemind?: (dueAt: number) => void
  /** Open the "Add to calendar" modal seeded with this contact. */
  onAddToCalendar?: () => void
}) {
  const [sending, setSending] = useState(false)
  const [showRemind, setShowRemind] = useState(false)

  // Channel-agnostic: respect any per-contact preference, else the smart
  // default, with automatic fallback so it's never a choke point. Resolved here
  // so the CTA shows the real destination.
  const preferred = getChannelPref(contact.id)
  const channel = resolveChannel(contact, preferred)
  // WhatsApp sends wear WhatsApp's own green so the handoff to the app is
  // instantly recognizable; every other Nudge action stays brand blue.
  const isWhatsApp = channel === 'whatsapp'

  const handleSend = async () => {
    if (!nudge) return
    // Hand off synchronously (within the click) so the deep link isn't blocked.
    deliver(contact, nudge.text, preferred)
    setSending(true)
    await onSend(nudge.text)
    onOpen()
  }

  const handleRemind = (dueAt: number) => {
    setShowRemind(false)
    onRemind?.(dueAt)
  }

  return (
    <article
      className={cn(
        'bg-card',
        featured
          ? 'rounded-3xl p-5 shadow-card-lg'
          : 'rounded-2xl p-4 shadow-card',
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 text-left"
      >
        <ContactAvatar contact={contact} size={featured ? 'lg' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                'truncate font-heading font-semibold leading-tight text-foreground',
                featured ? 'text-[17px]' : 'text-[15px]',
              )}
            >
              {contact.name}
            </p>
            {contact.tier === 'key' && (
              <span className="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-primary">
                Key
              </span>
            )}
          </div>
          <p className="truncate text-[13px] leading-tight text-muted-foreground">
            {pinned ? 'Priority follow-up' : contact.title ?? contact.relationship}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground/80">
          <HealthDot
            level={healthLevel(contact.daysSinceContact, contact.tier)}
          />
          {lastTouchShort(contact.daysSinceContact)}
        </span>
      </button>

      {/* Opener — the hero. No nested box; it breathes on the card. */}
      <div className={cn('relative', featured ? 'mt-5' : 'mt-4')}>
        {loading || !nudge ? (
          <div className="space-y-2.5 py-1">
            <div className="h-3 w-[88%] animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-[64%] animate-pulse rounded-full bg-muted" />
          </div>
        ) : (
          <>
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {nudge.tone}
            </span>
            <p
              className={cn(
                'text-pretty text-foreground',
                featured
                  ? 'text-[19px] leading-[1.5] tracking-[-0.01em]'
                  : 'line-clamp-2 text-[15px] leading-relaxed',
              )}
            >
              {nudge.text}
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      {showRemind ? (
        <div>
          <div className="mt-4 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Remind me to follow up
            </span>
            <button
              type="button"
              onClick={() => setShowRemind(false)}
              className="text-xs font-medium text-muted-foreground transition-colors active:text-foreground"
            >
              Cancel
            </button>
          </div>
          <RemindMenu onPick={handleRemind} />
        </div>
      ) : (
        <div className={cn('flex items-center gap-2', featured ? 'mt-5' : 'mt-4')}>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !nudge || sending}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-all active:scale-[0.98] disabled:opacity-40',
              isWhatsApp
                ? // Hero pick gets the bold, solid WhatsApp green; secondary
                  // cards get a quiet tonal green so only one button shouts per
                  // screen while still signaling the WhatsApp channel.
                  featured
                  ? 'bg-whatsapp text-whatsapp-foreground shadow-sm'
                  : 'border border-whatsapp/40 bg-whatsapp/10 text-whatsapp'
                : 'bg-primary text-primary-foreground shadow-sm',
            )}
          >
            {sending ? (
              <Check className="size-[18px]" />
            ) : (
              <ChannelIcon channel={channel} className="size-[18px]" />
            )}
            {sending ? sentConfirmLabel(channel) : sendActionLabel(channel)}
          </button>
          {onAddToCalendar && (
            <button
              type="button"
              onClick={onAddToCalendar}
              aria-label={`Add a calendar appointment with ${contact.name}`}
              className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary active:bg-muted"
            >
              <CalendarPlus className="size-[18px]" />
            </button>
          )}
          {onRemind && (
            <button
              type="button"
              onClick={() => setShowRemind(true)}
              aria-label={`Remind me to follow up with ${contact.name}`}
              className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary active:bg-muted"
            >
              <Clock className="size-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            aria-label="Open conversation"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary active:bg-muted"
          >
            <ChevronRight className="size-[18px]" />
          </button>
        </div>
      )}
    </article>
  )
}

/** A small status dot showing how the relationship sits against its cadence. */
function HealthDot({
  level,
}: {
  level: 'on-track' | 'due-soon' | 'overdue'
}) {
  const label =
    level === 'overdue'
      ? 'Overdue for a follow-up'
      : level === 'due-soon'
        ? 'Due for a follow-up soon'
        : 'On track'
  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        'size-2 shrink-0 rounded-full',
        level === 'overdue'
          ? 'bg-health-late'
          : level === 'due-soon'
            ? 'bg-health-warn'
            : 'bg-health-good',
      )}
    />
  )
}
