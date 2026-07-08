'use client'

import { useState } from 'react'
import { X, UserPlus, Check, Link2 } from 'lucide-react'
import type { Contact } from '@/lib/types'
import { shareInvite } from '@/lib/invite'

export function InvitePrompt({
  contact,
  channelLabel,
  onDismiss,
}: {
  contact: Contact
  channelLabel: string
  onDismiss: () => void
}) {
  const [state, setState] = useState<'idle' | 'shared' | 'copied'>('idle')
  const firstName = contact.name.split(' ')[0]

  const handleInvite = async () => {
    const result = await shareInvite(contact, channelLabel)
    if (result === 'shared') {
      setState('shared')
      // Give a beat to register, then close.
      setTimeout(onDismiss, 900)
    } else if (result === 'copied') {
      setState('copied')
      setTimeout(onDismiss, 1600)
    }
  }

  const done = state !== 'idle'

  return (
    <div className="px-4 pt-3">
      <div className="glass-card relative flex items-center gap-3 rounded-2xl p-3">
        <span className="glass-button flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-strong)]">
          {state === 'copied' ? (
            <Link2 className="size-[18px]" />
          ) : done ? (
            <Check className="size-[18px]" strokeWidth={2.5} />
          ) : (
            <UserPlus className="size-[18px]" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            {state === 'copied'
              ? 'Invite link copied'
              : state === 'shared'
                ? 'Invite sent'
                : `Sent to ${firstName} on ${channelLabel}`}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground text-pretty">
            {done
              ? `If ${firstName} likes FollowApp, they can keep their own network warm too.`
              : `Think ${firstName} would like FollowApp for their own network? Pass it on.`}
          </p>
        </div>

        {!done && (
          <button
            type="button"
            onClick={handleInvite}
            className="primary-action pressable shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
          >
            Share
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss invite"
          className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground/60 transition-colors active:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
