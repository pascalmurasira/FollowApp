'use client'

import { useEffect, useRef, useState } from 'react'
import { X, UserPlus, Check, Link2, Loader2 } from 'lucide-react'
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
  const [sharing, setSharing] = useState(false)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstName = contact.name.split(' ')[0]

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  const handleInvite = async () => {
    if (inFlightRef.current || state !== 'idle') return
    inFlightRef.current = true
    setSharing(true)
    try {
      const result = await shareInvite(contact, channelLabel)
      if (!mountedRef.current) return
      if (result === 'shared' || result === 'copied') {
        setState(result)
        // Give the truthful outcome a beat to register, then close.
        dismissTimerRef.current = setTimeout(
          onDismiss,
          result === 'shared' ? 900 : 1600,
        )
      }
    } finally {
      if (mountedRef.current) setSharing(false)
      inFlightRef.current = false
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
          ) : sharing ? (
            <Loader2 className="size-[18px] animate-spin" />
          ) : (
            <UserPlus className="size-[18px]" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            {state === 'copied'
              ? 'Invite link copied'
              : state === 'shared'
                ? 'Shared'
                : sharing
                  ? 'Opening share options…'
                : `Share FollowApp with ${firstName}`}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground text-pretty">
            {done
              ? `${firstName} can decide whether FollowApp is useful for their own network.`
              : `Only share if it feels natural after your conversation.`}
          </p>
        </div>

        {!done && (
          <button
            type="button"
            onClick={handleInvite}
            disabled={sharing}
            className="primary-action pressable shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
          >
            {sharing ? 'Opening…' : 'Share'}
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
