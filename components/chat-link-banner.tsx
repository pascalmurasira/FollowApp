'use client'

import { useState } from 'react'
import { MessageCircle, Clock, Loader2 } from 'lucide-react'

type Status = 'pending' | 'accepted' | 'declined' | null
type Direction = 'incoming' | 'outgoing' | null

/**
 * Sits above the composer when a contact is a real FollowApp user. It nudges
 * the user to start an in-app chat and reflects the link's state:
 *   - no link  → "Chat on FollowApp" CTA (sends a request)
 *   - pending  → waiting on them / waiting on you, depending on direction
 *   - declined → quietly explains the WhatsApp/SMS handoff still works
 * Accepted links never render this (the live thread takes over instead).
 */
export function ChatLinkBanner({
  name,
  status,
  direction,
  onRequest,
}: {
  name: string
  status: Status
  direction: Direction
  onRequest: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const firstName = name.split(' ')[0]

  if (status === 'declined') {
    return (
      <Wrap>
        <p className="text-[13px] leading-snug text-muted-foreground text-pretty">
          {`${firstName} isn't taking in-app chats right now — your message still goes out the usual way below.`}
        </p>
      </Wrap>
    )
  }

  if (status === 'pending') {
    const waitingOnThem = direction === 'outgoing'
    return (
      <Wrap>
        <Clock className="size-4 shrink-0 text-primary" />
        <p className="text-[13px] leading-snug text-foreground text-pretty">
          {waitingOnThem
            ? `Chat request sent — we'll open the thread as soon as ${firstName} accepts.`
            : `${firstName} wants to chat on FollowApp. Check your inbox to accept.`}
        </p>
      </Wrap>
    )
  }

  // No link yet → offer to start one.
  const request = async () => {
    setBusy(true)
    try {
      await onRequest()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Wrap>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
          <MessageCircle className="size-4" />
        </span>
        <p className="min-w-0 text-[13px] leading-snug text-foreground text-pretty">
          {`${firstName} is on FollowApp — chat right here instead.`}
        </p>
      </div>
      <button
        type="button"
        onClick={request}
        disabled={busy}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Chat
      </button>
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border bg-secondary/40 px-4 py-2.5">
      {children}
    </div>
  )
}
