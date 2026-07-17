'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useThread } from '@/hooks/use-thread'
import { cn } from '@/lib/utils'

/** Wall-clock time (e.g. "4:32 PM") from an ISO timestamp. */
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Live, in-app message thread between two linked FollowApp users. Replaces the
 * WhatsApp/SMS handoff for this contact: messages are stored in Neon and polled
 * (~4s) so a reply appears here without leaving the app. Auto-scrolls to the
 * newest message and reflects send state immediately.
 */
export function InAppChat({
  otherUserId,
  otherName,
}: {
  otherUserId: string
  otherName: string
}) {
  const { messages, loading, sending, send, sendError } = useThread(otherUserId)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    const sent = await send(text)
    if (sent) setDraft((current) => (current.trim() === text ? '' : current))
  }

  const firstName = otherName.split(' ')[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-[16rem] py-10 text-center">
            <p className="text-pretty text-[14px] font-medium text-foreground">
              {`You're connected on FollowApp`}
            </p>
            <p className="mt-1 text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {`Say hi to ${firstName} — your messages stay right here, and their replies land in this thread.`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex flex-col',
                  m.mine ? 'items-end' : 'items-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-[0_14px_30px_-20px_oklch(0.22_0.04_255_/_0.55)]',
                    m.mine
                      ? 'primary-action rounded-br-md'
                      : 'glass-card rounded-bl-md text-[var(--ink-body)]',
                  )}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                  {timeLabel(m.createdAt)}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-[var(--hairline)] bg-white/15 px-3 py-3 backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <input
          value={draft}
          maxLength={4_000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${firstName}…`}
          className="glass-card h-11 flex-1 rounded-full px-4 text-base outline-none focus-visible:border-[var(--action-bg)]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          className="primary-action pressable flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Send className="size-5" />
          )}
        </button>
      </form>
      {sendError && (
        <p className="px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] text-xs text-destructive">
          {sendError}
        </p>
      )}
    </div>
  )
}
