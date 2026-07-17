'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  Sparkles,
  RotateCw,
  Newspaper,
  Check,
  MessageCircle,
  Copy,
  Plus,
} from 'lucide-react'
import type { Contact, EnrichmentHook } from '@/lib/types'
import type { ContactUpdateInput } from '@/lib/contacts-store'
import { ContactAvatar } from '@/components/contact-avatar'
import { ChannelIcon } from '@/components/channel-icon'
import { ChannelSwitcher } from '@/components/channel-switcher'
import { useSuggestions } from '@/hooks/use-suggestions'
import { useEnrichment } from '@/hooks/use-enrichment'
import { useChannelPref } from '@/hooks/use-channel-pref'
import { cadenceLabel, clockTime, clockTimeAt, driftLabel } from '@/lib/format'
import {
  resolveChannel,
  channelLabel,
  canDeliver,
  sendActionLabel,
  toWhatsAppNumber,
  type ChannelId,
} from '@/lib/channels'
import { copyText } from '@/lib/native'
import { isDeliverableEmail } from '@/lib/contact-validation'
import { InAppChat } from '@/components/in-app-chat'
import { useContactMatch } from '@/hooks/use-contact-match'
import { cn } from '@/lib/utils'
import {
  formatFollowUpDate,
  nextFollowUpForContact,
} from '@/lib/contact-dates'
import { trackProductEvent } from '@/lib/product-analytics'

export function ConversationView({
  contact,
  voice,
  initialDraft,
  clearDraftRevision,
  onBack,
  onHandoff,
  onUpdateContact,
}: {
  contact: Contact
  voice: string
  initialDraft?: string
  clearDraftRevision: number
  onBack: () => void
  onHandoff: (text: string, preferred?: ChannelId) => void
  onUpdateContact: (
    updates: Pick<ContactUpdateInput, 'phone' | 'email'>,
  ) => void
}) {
  // Per-contact preference (if set) wins; otherwise the smart default applies,
  // with automatic fallback. Never a hard dependency on any one channel.
  const [preferred, setPreferred] = useChannelPref(contact.id)
  // Is this contact a real FollowApp user we can chat with in-app? When the
  // link is accepted we replace the demo composer with the live thread.
  const { match, requestChat } = useContactMatch(contact)
  const linkStatus = match?.link?.status ?? null
  const chatLive =
    linkStatus === 'accepted' && !!match?.otherUserId
  const channel = resolveChannel(contact, preferred)
  const canSend = canDeliver(contact)
  // WhatsApp send wears WhatsApp green so the channel handoff is recognizable.
  const isWhatsApp = channel === 'whatsapp'
  const firstName = contact.name.split(' ')[0]
  const cadence = cadenceLabel(contact.tier).toLowerCase()
  const nextFollowUp = nextFollowUpForContact(contact)
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

  const [draft, setDraft] = useState(initialDraft ?? '')
  const [showDestinationEditor, setShowDestinationEditor] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const scrollRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLInputElement>(null)
  const handledClearRevision = useRef(clearDraftRevision)

  useEffect(() => {
    if (!initialDraft?.trim()) return
    setDraft(initialDraft)
    window.requestAnimationFrame(() => draftRef.current?.focus())
  }, [contact.id, initialDraft])

  useEffect(() => {
    if (handledClearRevision.current === clearDraftRevision) return
    handledClearRevision.current = clearDraftRevision
    setDraft('')
    setCopyStatus('idle')
  }, [clearDraftRevision])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [contact.messages.length])

  const openComposer = (text: string) => {
    if (!text.trim() || !canSend) return
    onHandoff(text.trim(), preferred)
  }

  const copyDraft = async (text: string) => {
    const value = text.trim()
    if (!value) return
    // Keep the draft selectable even if a browser blocks clipboard access.
    setDraft(value)
    setCopyStatus('idle')
    try {
      await copyText(value)
      setCopyStatus('copied')
    } catch (error) {
      console.error('[v0] Copy draft failed:', error)
      setCopyStatus('error')
    }
  }

  const handleSuggestion = (text: string) => {
    setDraft(text)
    setCopyStatus('idle')
    trackProductEvent('draft_selected', {
      source: 'suggestion',
      channel_available: canSend,
    })
    window.requestAnimationFrame(() => draftRef.current?.focus())
  }

  return (
    <div className="relative z-[1] mx-auto flex h-[100dvh] w-full max-w-3xl flex-col lg:h-[calc(100dvh-3rem)] lg:border-x lg:border-white/30">
      <header className="z-10 flex items-center gap-2 border-b border-[var(--hairline)] px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5 text-[var(--ink-strong)] backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to list"
          className="glass-button pressable flex size-11 items-center justify-center rounded-full text-[var(--ink-strong)]"
        >
          <ChevronLeft className="size-6" />
        </button>
        <ContactAvatar contact={contact} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-[15.5px] font-semibold leading-tight tracking-[-0.01em]">
            {contact.name}
          </p>
          <p className="truncate text-xs text-[var(--ink-secondary)]">
            {contact.lastContactedAt === null
              ? `Cadence: ${cadence} · due now`
              : contact.daysSinceContact === 0
                ? `Cadence: ${cadence} · next ${formatFollowUpDate(nextFollowUp)}`
                : `Cadence: ${cadence} · ${driftLabel(contact.daysSinceContact)} · next ${formatFollowUpDate(nextFollowUp)}`}
          </p>
        </div>
        {canSend || chatLive ? (
          <ChannelSwitcher
            contact={contact}
            preferred={preferred}
            onChange={setPreferred}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowDestinationEditor((value) => !value)}
            aria-expanded={showDestinationEditor}
            className="primary-action pressable flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold"
          >
            <Plus className="size-3.5" />
            Add phone/email
          </button>
        )}
      </header>

      {!canSend && !chatLive && showDestinationEditor && (
        <DestinationEditor
          contact={contact}
          onSave={(updates) => {
            onUpdateContact(updates)
            setShowDestinationEditor(false)
          }}
          onCancel={() => setShowDestinationEditor(false)}
        />
      )}

      {chatLive && match?.otherUserId ? (
        <InAppChat otherUserId={match.otherUserId} otherName={match.otherName} />
      ) : (
        <>
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-3 py-4"
      >
        <div className="mx-auto my-2 w-fit rounded-full border border-[var(--hairline)] bg-white/20 px-3 py-1 text-center text-[11px] text-[var(--ink-secondary)] backdrop-blur">
          {canSend
            ? `Sent from your own ${channelLabel(channel)} · replies arrive in ${channelLabel(channel)}, not here`
            : 'Your draft is usable now — add a phone/email to send, or copy it anywhere'}
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
                  'relative max-w-[80%] px-3.5 py-2.5 text-[15px] leading-relaxed text-pretty shadow-sm',
                  mine
                    ? 'rounded-2xl rounded-br-sm bg-[var(--action-bg)] text-[var(--action-fg)]'
                    : 'glass-card rounded-2xl rounded-bl-sm text-[var(--ink-body)]',
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
                  {message.sentAt
                    ? clockTimeAt(message.sentAt)
                    : clockTime(message.minutesAgo)}
                </span>
              </div>
            </div>
          )
        })}

      </div>

      {match && linkStatus !== 'accepted' && (
        <ChatLinkBanner
          name={match.otherName}
          status={linkStatus}
          direction={match.link?.direction ?? null}
          onRequest={requestChat}
        />
      )}

      <div className="border-t border-[var(--hairline)] bg-white/20 backdrop-blur-xl">
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
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                    <Sparkles className="size-3 text-[var(--ink-secondary)]" />
                    Draft · matches your tone
                  </div>
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={loading}
                    aria-label="Get new suggestions"
                    className="pressable -my-2 flex min-h-11 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-[var(--ink-secondary)] disabled:opacity-50"
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
                          className="h-[72px] w-[82%] shrink-0 snap-start animate-pulse rounded-xl border border-[var(--hairline)] bg-white/20"
                        />
                      ))}
                    </>
                  ) : (
                    suggestions.map((suggestion, i) => (
                      <button
                        key={`${suggestion.text}-${i}`}
                        type="button"
                        onClick={() => handleSuggestion(suggestion.text)}
                        aria-label={`Use draft: ${suggestion.text}`}
                        className="glass-card pressable flex h-[72px] w-[82%] shrink-0 snap-start flex-col justify-center rounded-xl px-4 py-2 text-left"
                      >
                        <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                          {`${suggestion.tone} · tap to edit`}
                        </span>
                        <span className="line-clamp-2 text-sm leading-snug text-[var(--ink-body)]">
                          {suggestion.text}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (canSend) openComposer(draft)
                else void copyDraft(draft)
              }}
              className="flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
            >
              <input
                ref={draftRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setCopyStatus('idle')
                }}
                placeholder={canSend ? 'Or write your own…' : 'Edit or paste your draft…'}
                aria-label="Message"
                className="glass-card h-11 flex-1 rounded-full px-4 text-base text-[var(--ink-body)] outline-none placeholder:text-[var(--ink-tertiary)] focus-visible:border-[var(--action-bg)]"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label={
                  canSend ? sendActionLabel(channel) : 'Copy draft'
                }
                className={cn(
                  'pressable flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold disabled:opacity-40',
                  canSend && isWhatsApp
                    ? 'bg-whatsapp text-whatsapp-foreground'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {canSend ? (
                  <>
                    <ChannelIcon channel={channel} className="size-4" />
                    <span>{sendActionLabel(channel)}</span>
                  </>
                ) : copyStatus === 'copied' ? (
                  <><Check className="size-4" /><span>Copied</span></>
                ) : (
                  <><Copy className="size-4" /><span>Copy</span></>
                )}
              </button>
            </form>
            {!canSend && copyStatus !== 'idle' && (
              <p
                role="status"
                aria-live="polite"
                className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[12px] text-[var(--ink-secondary)]"
              >
                {copyStatus === 'copied'
                  ? 'Draft copied — paste it wherever you reach out.'
                  : 'Clipboard was unavailable. The draft is still selected above for manual copying.'}
              </p>
            )}
      </div>
        </>
      )}
    </div>
  )
}

function DestinationEditor({
  contact,
  onSave,
  onCancel,
}: {
  contact: Contact
  onSave: (updates: Pick<ContactUpdateInput, 'phone' | 'email'>) => void
  onCancel: () => void
}) {
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const nextPhone = phone.trim()
    const nextEmail = email.trim().toLowerCase()
    const phoneValid = !nextPhone || toWhatsAppNumber(nextPhone) !== null
    const emailValid = !nextEmail || isDeliverableEmail(nextEmail)

    if (!nextPhone && !nextEmail) {
      setError('Add a phone number or email to continue.')
      return
    }
    if (!phoneValid || !emailValid) {
      setError(
        !phoneValid
          ? 'Use a complete phone number, including the country code.'
          : 'Check that the email address is complete.',
      )
      return
    }

    onSave({
      phone: nextPhone || undefined,
      email: nextEmail || undefined,
    })
  }

  return (
    <form
      onSubmit={submit}
      className="relative z-[2] border-b border-[var(--hairline)] bg-white/30 px-4 py-3 backdrop-blur-xl"
    >
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-[var(--ink-strong)]">
              Where should this follow-up go?
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--ink-secondary)]">
              Add either one. For WhatsApp, include the country code.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="pressable min-h-11 rounded-full px-2 text-[12px] font-semibold text-[var(--ink-secondary)]"
          >
            Cancel
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone, e.g. +31…"
            aria-label="Phone number"
            className="glass-card h-11 rounded-2xl px-3 text-base text-[var(--ink-body)] outline-none focus-visible:border-[var(--action-bg)]"
          />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email address"
            aria-label="Email address"
            className="glass-card h-11 rounded-2xl px-3 text-base text-[var(--ink-body)] outline-none focus-visible:border-[var(--action-bg)]"
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[12px] text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="primary-action pressable mt-2 min-h-11 w-full rounded-full px-4 text-sm font-semibold"
        >
          Save sending details
        </button>
      </div>
    </form>
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
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary/50 px-4 text-[13px] font-semibold text-foreground transition-transform active:scale-[0.98]"
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
      <div className="glass-card mx-3 mb-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] text-[var(--ink-strong)]">
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
      <div className="glass-card mx-3 mb-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] text-[var(--ink-secondary)]">
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
      className="primary-action pressable mx-3 mb-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-semibold disabled:opacity-60"
    >
      <MessageCircle className="size-4" />
      {busy ? 'Sending request…' : `${firstName} is on FollowApp — chat in-app`}
    </button>
  )
}
