'use client'

import { useState } from 'react'
import { Clock, Moon, Check, Pencil } from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { Nudge } from '@/hooks/use-nudges'
import type { SnoozeDuration } from '@/hooks/use-engagement'
import { ContactAvatar } from '@/components/contact-avatar'
import { ChannelIcon } from '@/components/channel-icon'
import { healthLevel } from '@/lib/format'
import {
  deliver,
  resolveChannel,
  canDeliver,
  sendActionLabel,
  sentConfirmLabel,
} from '@/lib/channels'
import { getChannelPref } from '@/hooks/use-channel-pref'
import { DEMO_CONTACT_IDS } from '@/lib/mock-data'
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
  const level = healthLevel(contact.daysSinceContact, contact.tier)
  const isExample = DEMO_CONTACT_IDS.has(contact.id)

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

  if (!featured) {
    return (
      <article className="border-b border-[var(--hairline)] last:border-b-0">
        <button
          type="button"
          onClick={onOpen}
          className="pressable flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <ContactAvatar contact={contact} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ink-strong)]">
              {contact.name}
              {isExample && (
                <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
                  Example
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-secondary)]">
              {contact.title ?? contact.relationship}
            </span>
          </span>
          <StatusBlock level={level} days={contact.daysSinceContact} />
        </button>
      </article>
    )
  }

  return (
    <article
      className="glass-hero p-[18px]"
    >
      {/* Header */}
      <button
        type="button"
        onClick={onOpen}
        className="pressable flex w-full items-center gap-3 rounded-2xl text-left"
      >
        <ContactAvatar contact={contact} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className="truncate font-heading text-[17px] font-semibold leading-tight tracking-[-0.018em] text-[var(--ink-strong)]"
            >
              {contact.name}
            </p>
            {contact.tier === 'key' && (
              <span className="shrink-0 rounded-full border border-[var(--hairline)] bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-secondary)]">
                Key contact
              </span>
            )}
            {isExample && (
              <span className="shrink-0 rounded-full border border-[var(--hairline)] bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-secondary)]">
                Example
              </span>
            )}
          </div>
          <p className="truncate text-[13px] leading-tight text-[var(--ink-secondary)]">
            {contact.title ?? (pinned ? 'Priority follow-up' : contact.relationship)}
          </p>
        </div>
        <StatusBlock level={level} days={contact.daysSinceContact} />
      </button>

      {/* Opener — the hero. No nested box; it breathes on the card. */}
      <div className="relative mt-5">
        {loading || !nudge ? (
          <div className="space-y-2.5 py-1">
            <div className="h-3 w-[88%] animate-pulse rounded-full bg-[var(--hairline)]" />
            <div className="h-3 w-[64%] animate-pulse rounded-full bg-[var(--hairline)]" />
          </div>
        ) : (
          <>
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-tertiary)]">
              Draft · {nudge.tone}
            </span>
            <p
              className="text-pretty text-[15.5px] leading-[1.5] tracking-[-0.012em] text-[var(--ink-body)]"
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
            className="glass-button pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--r-button)] text-sm font-medium text-[var(--ink-strong)]"
          >
            <Clock className="size-4" />
            Later today
          </button>
          <button
            type="button"
            onClick={() => handleSnooze('weekend')}
            className="glass-button pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--r-button)] text-sm font-medium text-[var(--ink-strong)]"
          >
            <Moon className="size-4" />
            This weekend
          </button>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !nudge || sending || !canSend}
            className={cn(
              'primary-action pressable flex min-h-[46px] flex-1 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-40',
              isWhatsApp
                ? 'bg-whatsapp text-whatsapp-foreground shadow-sm'
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
              className="glass-button pressable flex size-[46px] items-center justify-center rounded-[var(--r-button)] text-[var(--ink-secondary)]"
            >
              <Clock className="size-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            aria-label="Edit opener"
            className="glass-button pressable flex size-[46px] items-center justify-center rounded-[var(--r-button)] text-[var(--ink-secondary)]"
          >
            <Pencil className="size-[17px]" />
          </button>
        </div>
      )}
    </article>
  )
}

function statusCopy(
  level: 'on-track' | 'due-soon' | 'overdue',
  days: number,
): { label: string; sublabel: string } {
  return {
    label:
      level === 'overdue'
        ? 'Overdue'
        : level === 'due-soon'
          ? 'Due soon'
          : 'On track',
    sublabel: days <= 0 ? 'today' : `${days} days`,
  }
}

function StatusBlock({
  level,
  days,
}: {
  level: 'on-track' | 'due-soon' | 'overdue'
  days: number
}) {
  const status = statusCopy(level, days)
  return (
    <span
      aria-label={`${status.label}, ${status.sublabel}`}
      title={`${status.label}, ${status.sublabel}`}
      className={cn(
        'tnum shrink-0 text-right leading-none',
        level === 'overdue'
          ? 'status-overdue'
          : level === 'due-soon'
            ? 'status-due-soon'
            : 'status-on-track',
      )}
    >
      <span className="block text-[12px] font-semibold">{status.label}</span>
      <span className="mt-1 block text-[11.5px] font-medium text-[var(--ink-secondary)]">
        {status.sublabel}
      </span>
    </span>
  )
}
