'use client'

import { Check, X, MessageCircle } from 'lucide-react'
import { useInbox } from '@/hooks/use-inbox'

/**
 * Incoming chat-request inbox, shown at the top of the Chats tab when someone
 * who has the user as a contact asks to chat in-app. Accept turns the pair into
 * a live thread (openable from their conversation); decline keeps things on the
 * existing WhatsApp/SMS handoff. Hidden entirely when signed out or empty so it
 * never adds noise.
 */
export function ChatRequests({
  onOpenContact,
}: {
  /** Optional: jump to a conversation after accepting (matched by user id). */
  onOpenContact?: (contactId: string | null) => void
}) {
  const { incoming, signedIn, respond } = useInbox()

  if (!signedIn || incoming.length === 0) return null

  const accept = async (linkId: string) => {
    await respond(linkId, true)
    // The accepted user's matched contact card now opens a live thread; the
    // caller decides whether to navigate (we don't have the local contactId
    // here, so we pass null and let the Chats list reflect the change).
    onOpenContact?.(null)
  }

  return (
    <section className="border-b border-border bg-secondary/30 px-4 py-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <MessageCircle className="size-3 text-primary" />
        {incoming.length === 1
          ? '1 chat request'
          : `${incoming.length} chat requests`}
      </h2>
      <ul className="flex flex-col gap-2">
        {incoming.map((link) => (
          <li
            key={link.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-foreground">
                {link.otherName}
              </p>
              <p className="truncate text-[12px] text-muted-foreground text-pretty">
                {link.intro?.trim() || 'wants to chat with you on FollowApp'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => respond(link.id, false)}
                aria-label={`Decline ${link.otherName}`}
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors active:bg-muted"
              >
                <X className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => accept(link.id)}
                aria-label={`Accept ${link.otherName}`}
                className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
              >
                <Check className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
