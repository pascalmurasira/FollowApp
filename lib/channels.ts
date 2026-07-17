import type { Contact, OutreachChannel } from './types'
import { copyText, openExternalUrl, tapFeedback } from './native'
import { isDeliverableEmail } from './contact-validation'
import { toInternationalWhatsAppNumber } from './phone'

export type ChannelId = OutreachChannel

/** Mobile devices, where native app deep links (WhatsApp app, Messages) work best. */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent)
}

/**
 * Turn a stored phone into a wa.me-acceptable number: full international digits,
 * no '+', no '00', no leading zero. Only explicit international forms are safe:
 * silently guessing a country from the device locale can message the wrong person.
 */
export function toWhatsAppNumber(phone?: string): string | null {
  return toInternationalWhatsAppNumber(phone)
}

interface Channel {
  id: ChannelId
  /** Can this channel deliver to this contact at all? */
  canSend: (contact: Contact) => boolean
  /** Fire the handoff. Must run synchronously inside a click for popups/sms. */
  open: (contact: Contact, text: string) => void | Promise<void>
}

const whatsapp: Channel = {
  id: 'whatsapp',
  // Only offer WhatsApp when we can build a routable international number.
  canSend: (c) => toWhatsAppNumber(c.phone) !== null,
  open: (c, text) => {
    void tapFeedback()
    const number = toWhatsAppNumber(c.phone)
    if (!number) {
      // Shouldn't happen (canSend gates this), but never open a dead link —
      // keep the composed message by copying it to the clipboard.
      void copyText(text).catch(() => {})
      return
    }
    // Route explicitly so the link never dead-ends: the app/wa.me on mobile,
    // WhatsApp Web on desktop.
    const url = isMobile()
      ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
      : `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(text)}`
    void openExternalUrl(url)
  },
}

const email: Channel = {
  id: 'email',
  canSend: (c) => isDeliverableEmail(c.email),
  open: (c, text) => {
    void tapFeedback()
    const address = (c.email ?? '').trim()
    // The composed nudge becomes the email body; a light subject keeps it from
    // landing as a blank-subject message.
    const subject = `Hi ${c.name.split(' ')[0]}`
    window.location.href = `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(text)}`
  },
}

const CHANNELS: Record<ChannelId, Channel> = { whatsapp, email }

/**
 * Default priority for delivering a message: WhatsApp first, then email. We
 * fall through automatically so WhatsApp stays the default without ever being
 * a hard dependency — a contact with only an email still gets reached.
 */
const DEFAULT_ORDER: ChannelId[] = ['whatsapp', 'email']

/** Order shown in the channel switcher. */
const SELECTABLE_ORDER: ChannelId[] = ['whatsapp', 'email']

function orderedFor(preferred?: ChannelId): Channel[] {
  const ids = preferred
    ? [preferred, ...DEFAULT_ORDER.filter((id) => id !== preferred)]
    : DEFAULT_ORDER
  return ids.map((id) => CHANNELS[id])
}

/**
 * Channel-agnostic delivery. Nudge composes the message; this picks the
 * smoothest *available* channel so WhatsApp stays the default without ever
 * becoming a hard dependency — if it can't deliver, we fall through to email.
 * Returns the channel actually used.
 *
 * Must be called synchronously from a click handler so the handoff isn't blocked.
 */
export function deliver(
  contact: Contact,
  text: string,
  preferred?: ChannelId,
): ChannelId | null {
  const channel = orderedFor(preferred).find((c) => c.canSend(contact))
  if (!channel) return null
  void channel.open(contact, text)
  return channel.id
}

/** Which channel a message to this contact *would* go out on, for labelling UI. */
export function resolveChannel(contact: Contact, preferred?: ChannelId): ChannelId {
  return (orderedFor(preferred).find((c) => c.canSend(contact)) ?? whatsapp).id
}

/** Channels that can actually reach this contact — for the switcher UI. */
export function selectableChannels(contact: Contact): ChannelId[] {
  return SELECTABLE_ORDER.filter((id) => CHANNELS[id].canSend(contact))
}

/** Whether at least one external channel can reach this contact. */
export function canDeliver(contact: Contact): boolean {
  return selectableChannels(contact).length > 0
}

/** Display name of a channel, e.g. for a banner. */
export function channelLabel(id: ChannelId): string {
  if (id === 'whatsapp') return 'WhatsApp'
  return 'Email'
}

/** Primary CTA label for the explicit handoff into an external composer. */
export function sendActionLabel(id: ChannelId): string {
  if (id === 'whatsapp') return 'Open WhatsApp'
  return 'Open Email'
}

/** Post-send confirmation label for a channel. */
export function sentConfirmLabel(id: ChannelId): string {
  if (id === 'whatsapp') return 'Opened in WhatsApp'
  return 'Opened in Email'
}
