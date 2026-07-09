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
    <section className="border-b border-[var(--hairline)] bg-white/20 px-4 py-3 backdrop-blur-xl">
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
            className="glass-card flex items-center gap-3 rounded-xl px-3 py-2.5"
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
                className="glass-button pressable flex size-11 items-center justify-center rounded-full text-[var(--ink-secondary)]"
              >
                <X className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => accept(link.id)}
                aria-label={`Accept ${link.otherName}`}
                className="primary-action pressable flex size-11 items-center justify-center rounded-full"
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
