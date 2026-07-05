'use client'

import { useState } from 'react'
import { ChevronRight, Clock, Moon, Check } from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { Nudge } from '@/hooks/use-nudges'
import type { SnoozeDuration } from '@/hooks/use-engagement'
import { ContactAvatar } from '@/components/contact-avatar'
import { ChannelIcon } from '@/components/channel-icon'
import { lastTouchShort, healthLevel } from '@/lib/format'
import {
  deliver,
  resolveChannel,
  canDeliver,
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
  onSnooze,
}: {
  contact: Contact
  nudge?: Nudge
  loading: boolean
  pinned?: boolean
  featured?: boolean
  onOpen: () => void
  onSend: (text: string) => Promise<void>
  onSnooze?: (duration: SnoozeDuration) => void
}) {
  const [sending, setSending] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)

  // Channel-agnostic: respect any per-contact preference, else the smart
  // default, with automatic fallback so it's never a choke point. Resolved here
  // so the CTA shows the real destination.
  const preferred = getChannelPref(contact.id)
  const channel = resolveChannel(contact, preferred)
  const canSend = canDeliver(contact)
  // WhatsApp sends wear WhatsApp's own green so the handoff to the app is
  // instantly recognizable; every other Nudge action stays brand blue.
  const isWhatsApp = channel === 'whatsapp'

  const handleSend = async () => {
    if (!nudge || !canSend) return
    // Hand off synchronously (within the click) so the deep link isn't blocked.
    const deliveredVia = deliver(contact, nudge.text, preferred)
    if (!deliveredVia) return
    setSending(true)
    await onSend(nudge.text)
    onOpen()
  }

  const handleSnooze = (duration: SnoozeDuration) => {
    setShowSnooze(false)
    onSnooze?.(duration)
  }

  return (
    <article
      className={cn(
        'border border-border bg-card transition-shadow hover:shadow-card',
        featured
          ? 'rounded-2xl border-primary/20 p-5 shadow-card-lg sm:p-6'
          : 'rounded-xl p-4',
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
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Suggested opener · {nudge.tone}
            </span>
            <p
              className={cn(
                'text-pretty text-foreground',
                featured
                  ? 'text-[18px] leading-[1.55] tracking-[-0.012em]'
                  : 'line-clamp-2 text-[15px] leading-relaxed',
              )}
            >
              {nudge.text}
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      {showSnooze ? (
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSnooze('later')}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium text-foreground transition-colors active:bg-muted"
          >
            <Clock className="size-4" />
            Later today
          </button>
          <button
            type="button"
            onClick={() => handleSnooze('weekend')}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium text-foreground transition-colors active:bg-muted"
          >
            <Moon className="size-4" />
            This weekend
          </button>
        </div>
      ) : (
        <div className={cn('flex items-center gap-2', featured ? 'mt-5' : 'mt-4')}>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !nudge || sending || !canSend}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40',
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
            {sending
              ? sentConfirmLabel(channel)
              : canSend
                ? sendActionLabel(channel)
                : 'Add phone or email'}
          </button>
          {onSnooze && (
            <button
              type="button"
              onClick={() => setShowSnooze(true)}
              aria-label={`Snooze ${contact.name}`}
              className="flex size-11 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary active:bg-muted"
            >
              <Clock className="size-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            aria-label="Open conversation"
            className="flex size-11 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary active:bg-muted"
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
