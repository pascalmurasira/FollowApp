'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  Sparkles,
  RotateCw,
  Newspaper,
  Check,
  MessageCircle,
} from 'lucide-react'
import type { Contact, EnrichmentHook } from '@/lib/types'
import { ContactAvatar } from '@/components/contact-avatar'
import { ChannelIcon } from '@/components/channel-icon'
import { ChannelSwitcher } from '@/components/channel-switcher'
import { useSuggestions } from '@/hooks/use-suggestions'
import { useEnrichment } from '@/hooks/use-enrichment'
import { useChannelPref } from '@/hooks/use-channel-pref'
import { driftLabel, clockTime } from '@/lib/format'
import { hasInvited, markInvited } from '@/lib/invite'
import {
  deliver,
  resolveChannel,
  channelLabel,
} from '@/lib/channels'
import { InvitePrompt } from '@/components/invite-prompt'
import { InAppChat } from '@/components/in-app-chat'
import { useContactMatch } from '@/hooks/use-contact-match'
import { cn } from '@/lib/utils'

export function ConversationView({
  contact,
  voice,
  isTyping,
  onBack,
  onSend,
}: {
  contact: Contact
  voice: string
  isTyping: boolean
  onBack: () => void
  onSend: (text: string) => Promise<void>
}) {
  // Per-contact preference (if set) wins; otherwise the smart default applies,
  // with automatic fallback. Never a hard dependency on any one channel.
  const [preferred, setPreferred] = useChannelPref(contact.id)
  // Is this contact a real FollowApp user we can chat with in-app? When the
  // link is accepted we replace the demo composer with the live thread.
  const { match, requestChat } = useContactMatch(contact)
  const linkStatus = match?.link?.status ?? null
  const chatLive = linkStatus === 'accepted' && !!match
  const channel = resolveChannel(contact, preferred)
  // WhatsApp send wears WhatsApp green so the channel handoff is recognizable.
  const isWhatsApp = channel === 'whatsapp'
  const firstName = contact.name.split(' ')[0]
  // The lookup is most useful when reconnecting after a gap (or a blank thread).
  const isColdOpen =
    contact.messages.length === 0 || contact.daysSinceContact >= 14

  // Opt-in, on-demand context lookup. Never auto-runs; the chosen hooks are
  // fed into the opener generator below. Session-only, nothing persisted.
  const { hooks, status: enrichStatus, run: runEnrichment } =
    useEnrichment(contact)
  const [chosenHooks, setChosenHooks] = useState<string[]>([])

  const toggleHook = (text: string) =>
    setChosenHooks((prev) =>
      prev.includes(text) ? prev.filter((t) => t !== text) : [...prev, text],
    )

  // AI message suggestions for the composer.
  const { suggestions, loading, refresh } = useSuggestions(contact, voice, {
    enabled: true,
    enrichment: chosenHooks,
  })

  const [draft, setDraft] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [contact.messages.length, isTyping])

  const submit = (text: string) => {
    if (!text.trim()) return
    setDraft('')
    // Compose in Nudge, deliver through the channel they already use.
    deliver(contact, text, preferred)
    void onSend(text)
    // The sent message is the viral moment — offer to bring this person onto
    // Nudge, but only once per contact so it never feels spammy.
    if (!hasInvited(contact.id)) {
      markInvited(contact.id)
      setShowInvite(true)
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="glass-appbar z-10 flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5 text-appbar-foreground">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to list"
          className="flex size-11 items-center justify-center rounded-full text-appbar-foreground transition-colors active:bg-appbar-foreground/15"
        >
          <ChevronLeft className="size-6" />
        </button>
        <ContactAvatar contact={contact} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-semibold leading-tight">
            {contact.name}
          </p>
          <p className="truncate text-xs text-appbar-foreground/70">
            {contact.daysSinceContact === 0
              ? 'online'
              : driftLabel(contact.daysSinceContact)}
          </p>
        </div>
        <ChannelSwitcher
          contact={contact}
          preferred={preferred}
          onChange={setPreferred}
        />
      </header>

      {chatLive && match ? (
        <InAppChat otherUserId={match.otherUserId} otherName={match.otherName} />
      ) : (
        <>
      <div
        ref={scrollRef}
        className="chat-wallpaper flex-1 space-y-1.5 overflow-y-auto overscroll-y-contain px-3 py-3"
      >
        <div className="mx-auto my-2 w-fit rounded-full bg-foreground/[0.06] px-3 py-1 text-center text-[11px] text-muted-foreground backdrop-blur">
          {`Sent from your own ${channelLabel(channel)} · replies arrive in ${channelLabel(channel)}, not here`}
        </div>

        {contact.messages.map((message) => {
          const mine = message.sender === 'me'
          return (
            <div
              key={message.id}
              className={cn('flex', mine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'relative max-w-[80%] px-3 py-2 text-[15px] leading-relaxed text-pretty shadow-sm',
                  mine
                    ? 'rounded-2xl rounded-br-sm bg-bubble-out text-bubble-out-foreground'
                    : 'rounded-2xl rounded-bl-sm bg-bubble-in text-bubble-in-foreground',
                )}
              >
                {message.text}
                <span
                  className={cn(
                    'mt-0.5 block text-right text-[10px] tnum',
                    mine
                      ? 'text-bubble-out-foreground/55'
                      : 'text-muted-foreground/70',
                  )}
                >
                  {clockTime(message.minutesAgo)}
                </span>
              </div>
            </div>
          )
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-bubble-in px-4 py-3.5 shadow-sm">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </div>
          </div>
        )}
      </div>

      {match && linkStatus !== 'accepted' && (
        <ChatLinkBanner
          name={match.otherName}
          status={linkStatus}
          direction={match.link?.direction ?? null}
          onRequest={requestChat}
        />
      )}

      <div className="border-t border-border bg-card/95 backdrop-blur">
        <>
            {showInvite ? (
              <InvitePrompt
                contact={contact}
                channelLabel={channelLabel(channel)}
                onDismiss={() => setShowInvite(false)}
              />
            ) : (
              <>
                {isColdOpen && (
                  <EnrichmentBar
                    firstName={firstName}
                    status={enrichStatus}
                    hooks={hooks}
                    chosen={chosenHooks}
                    onRun={runEnrichment}
                    onToggle={toggleHook}
                  />
                )}

              {/* AI suggestion bar — the "what to say" engine */}
              <div className="px-4 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Sparkles className="size-3 text-primary" />
                    {isTyping ? 'Reading the room' : 'Tap to say it'}
                  </div>
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={loading}
                    aria-label="Get new suggestions"
                    className="-my-2 flex min-h-11 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors active:bg-muted disabled:opacity-50"
                  >
                    <RotateCw className={cn('size-3.5', loading && 'animate-spin')} />
                    New ideas
                  </button>
                </div>

                <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {loading && suggestions.length === 0 ? (
                    <>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-[72px] w-[82%] shrink-0 snap-start animate-pulse rounded-xl border border-border bg-muted"
                        />
                      ))}
                    </>
                  ) : (
                    suggestions.map((suggestion, i) => (
                      <button
                        key={`${suggestion.text}-${i}`}
                        type="button"
                        onClick={() => submit(suggestion.text)}
                        className="flex h-[72px] w-[82%] shrink-0 snap-start flex-col justify-center rounded-xl border border-border bg-secondary/60 px-4 py-2 text-left transition-transform active:scale-[0.98]"
                      >
                        <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                          {suggestion.tone}
                        </span>
                        <span className="line-clamp-2 text-sm leading-snug text-foreground">
                          {suggestion.text}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              </>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit(draft)
              }}
              className="flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Or write your own…"
                aria-label="Message"
                className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label={`Send via ${channelLabel(channel)}`}
                className={cn(
                  'flex size-11 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40',
                  isWhatsApp
                    ? 'bg-whatsapp text-whatsapp-foreground'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                <ChannelIcon channel={channel} className="size-5" />
              </button>
            </form>
          </>
      </div>
        </>
      )}
    </div>
  )
}

/**
 * Opt-in recent-news lookup. Idle → a single tappable button; done → the found
 * hooks as toggleable chips that feed the opener generator. Transparent and
 * never automatic, matching the product's privacy stance.
 */
function EnrichmentBar({
  firstName,
  status,
  hooks,
  chosen,
  onRun,
  onToggle,
}: {
  firstName: string
  status: 'idle' | 'loading' | 'done' | 'error'
  hooks: EnrichmentHook[]
  chosen: string[]
  onRun: () => void
  onToggle: (text: string) => void
}) {
  if (status === 'idle') {
    return (
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={onRun}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary/50 px-4 text-[13px] font-semibold text-foreground transition-transform active:scale-[0.98]"
        >
          <Newspaper className="size-4 text-primary" />
          {`Look up recent news about ${firstName}`}
        </button>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-4 pt-3 text-[13px] text-muted-foreground">
        <Newspaper className="size-4 animate-pulse text-primary" />
        {`Checking what ${firstName} has been up to…`}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="px-4 pt-3 text-[13px] text-muted-foreground">
        {`Couldn't check the news right now — your openers are still ready below.`}
      </div>
    )
  }

  // status === 'done'
  if (hooks.length === 0) {
    return (
      <div className="px-4 pt-3 text-[13px] text-muted-foreground">
        {`Nothing recent came up for ${firstName}. No problem — pick an opener below.`}
      </div>
    )
  }

  return (
    <div className="px-4 pt-3">
      <p className="mb-2 text-[12px] text-muted-foreground text-pretty">
        FollowApp found this — tap any to weave it into your openers:
      </p>
      <div className="flex flex-col gap-1.5">
        {hooks.map((hook) => {
          const active = chosen.includes(hook.text)
          return (
            <button
              key={hook.text}
              type="button"
              onClick={() => onToggle(hook.text)}
              aria-pressed={active}
              className={cn(
                'flex items-start gap-2 rounded-xl border px-3 py-2 text-left text-[13px] leading-snug transition-colors',
                active
                  ? 'border-primary bg-primary/[0.08] text-foreground'
                  : 'border-border bg-secondary/50 text-foreground',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40',
                )}
              >
                {active && <Check className="size-3" />}
              </span>
              <span className="flex-1 text-pretty">
                {hook.text}
                {hook.source && (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    {`· ${hook.source}`}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-2 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  )
}

/**
 * Shown when a contact is a real FollowApp user but the two aren't linked yet.
 * Offers to send a chat request (none), reflects a sent/incoming request
 * (pending), or notes a declined one. Once accepted, the live thread replaces
 * the whole composer so this banner disappears.
 */
function ChatLinkBanner({
  name,
  status,
  direction,
  onRequest,
}: {
  name: string
  status: 'pending' | 'accepted' | 'declined' | null
  direction: 'incoming' | 'outgoing' | null
  onRequest: () => void | Promise<void>
}) {
  const firstName = name.split(' ')[0]
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      await onRequest()
    } finally {
      setBusy(false)
    }
  }

  // Incoming pending requests are answered from the Chats tab, so here we just
  // note it; the actionable case from this view is sending a new request.
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-primary/[0.06] px-4 py-2.5 text-[13px] text-foreground">
        <MessageCircle className="size-4 shrink-0 text-primary" />
        <span className="text-pretty">
          {direction === 'incoming'
            ? `${firstName} wants to chat on FollowApp — open Chats to accept.`
            : `Chat request sent — you'll be able to message ${firstName} here once they accept.`}
        </span>
      </div>
    )
  }

  if (status === 'declined') {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-2.5 text-[13px] text-muted-foreground">
        <MessageCircle className="size-4 shrink-0" />
        <span className="text-pretty">{`Your chat request wasn't accepted — keep reaching out your usual way.`}</span>
      </div>
    )
  }

  // status === null — matched but no link yet.
  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 border-t border-border bg-primary/[0.08] px-4 py-3 text-[14px] font-semibold text-primary transition-colors active:bg-primary/[0.14] disabled:opacity-60"
    >
      <MessageCircle className="size-4" />
      {busy ? 'Sending request…' : `${firstName} is on FollowApp — chat in-app`}
    </button>
  )
}
