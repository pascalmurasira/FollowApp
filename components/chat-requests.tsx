'use client'

import { Check, X, MessageCircle, ChevronRight } from 'lucide-react'
import { useInbox, type LinkView } from '@/hooks/use-inbox'

/**
 * Incoming chat-request inbox, shown at the top of the Chats tab when someone
 * who has the user as a contact asks to chat in-app. Accept turns the pair into
 * a live thread (openable from their conversation); decline keeps things on the
 * existing WhatsApp/SMS handoff. Hidden entirely when signed out or empty so it
 * never adds noise.
 */
export function ChatRequests({
  onOpenThread,
}: {
  /** Open an accepted cloud thread, even when the person is not saved locally. */
  onOpenThread?: (link: LinkView) => void
}) {
  const { accepted, incoming, signedIn, respond } = useInbox()

  const openableAccepted = accepted.filter((link) => link.otherUserId)

  if (!signedIn || (incoming.length === 0 && openableAccepted.length === 0)) {
    return null
  }

  const accept = async (link: LinkView) => {
    const acceptedSuccessfully = await respond(link.id, true)
    if (acceptedSuccessfully && link.otherUserId) {
      onOpenThread?.({ ...link, status: 'accepted' })
    }
  }

  return (
    <div className="border-b border-[var(--hairline)] bg-white/20 px-4 py-3 backdrop-blur-xl">
      {incoming.length > 0 && (
        <section>
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
                    {link.otherName.trim() || 'Someone'}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground text-pretty">
                    {link.intro?.trim() || 'wants to chat with you on FollowApp'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => respond(link.id, false)}
                    aria-label={`Decline ${link.otherName.trim() || 'chat request'}`}
                    className="glass-button pressable flex size-11 items-center justify-center rounded-full text-[var(--ink-secondary)]"
                  >
                    <X className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => accept(link)}
                    aria-label={`Accept ${link.otherName.trim() || 'chat request'}`}
                    className="primary-action pressable flex size-11 items-center justify-center rounded-full"
                  >
                    <Check className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openableAccepted.length > 0 && (
        <section className={incoming.length > 0 ? 'mt-4' : undefined}>
          <h2 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <MessageCircle className="size-3 text-primary" />
            FollowApp chats
          </h2>
          <ul className="flex flex-col">
            {openableAccepted.map((link) => {
              const name = link.otherName.trim() || 'Someone'
              return (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => onOpenThread?.(link)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors active:bg-muted"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
                      {name}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
