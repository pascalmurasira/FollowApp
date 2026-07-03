import type { Contact } from './types'

export type ChannelId = 'whatsapp' | 'email'

/** Mobile devices, where native app deep links (WhatsApp app, Messages) work best. */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent)
}

/**
 * Common region (ISO 3166-1 alpha-2) → country calling code. Used to turn a
 * bare national number into the full international form WhatsApp requires.
 */
const DIALING_CODES: Record<string, string> = {
  US: '1', CA: '1', GB: '44', IE: '353', AU: '61', NZ: '64', IN: '91',
  DE: '49', FR: '33', ES: '34', IT: '39', NL: '31', BE: '32', CH: '41',
  AT: '43', SE: '46', NO: '47', DK: '45', FI: '358', PT: '351', PL: '48',
  CZ: '420', GR: '30', RO: '40', HU: '36', BR: '55', MX: '52', AR: '54',
  CL: '56', CO: '57', PE: '51', ZA: '27', NG: '234', KE: '254', EG: '20',
  AE: '971', SA: '966', IL: '972', TR: '90', SG: '65', HK: '852', JP: '81',
  KR: '82', CN: '86', ID: '62', MY: '60', PH: '63', TH: '66', VN: '84',
}

/** Best-effort device region from the browser locale, e.g. "en-GB" → "GB". */
function deviceRegion(): string | null {
  if (typeof navigator === 'undefined') return null
  const locales =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language]
  for (const loc of locales) {
    if (!loc) continue
    try {
      const region = new Intl.Locale(loc).maximize().region
      if (region) return region.toUpperCase()
    } catch {
      const m = /[-_]([A-Za-z]{2})\b/.exec(loc)
      if (m) return m[1].toUpperCase()
    }
  }
  return null
}

function defaultDialingCode(): string | null {
  const region = deviceRegion()
  return region ? (DIALING_CODES[region] ?? null) : null
}

/**
 * Turn a stored phone into a wa.me-acceptable number: full international digits,
 * no '+', no '00', no leading zero. Handles E.164 ('+...'), the '00' intl prefix,
 * and bare national numbers (prepends the device-locale country code, stripping a
 * trunk '0'). Returns null when it can't form a number WhatsApp could route — in
 * which case the caller falls through to SMS.
 */
export function toWhatsAppNumber(phone?: string): string | null {
  const raw = (phone ?? '').trim()
  if (!raw) return null

  // E.164: already carries a country code.
  if (raw.startsWith('+')) {
    const d = raw.replace(/\D/g, '')
    return d.length >= 8 ? d : null
  }

  // '00' international dialing prefix → drop it, the rest is the full number.
  if (raw.startsWith('00')) {
    const d = raw.replace(/\D/g, '').replace(/^0+/, '')
    return d.length >= 8 ? d : null
  }

  // Bare national number — needs a country code to route on WhatsApp.
  const national = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (!national) return null
  const cc = defaultDialingCode()
  if (cc) return `${cc}${national}`
  // No country context: only trust it if it's long enough to already include one.
  return national.length >= 11 ? national : null
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
    const number = toWhatsAppNumber(c.phone)
    if (!number) {
      // Shouldn't happen (canSend gates this), but never open a dead link —
      // keep the composed message by copying it to the clipboard.
      void navigator.clipboard?.writeText(text).catch(() => {})
      return
    }
    // Route explicitly so the link never dead-ends: the app/wa.me on mobile,
    // WhatsApp Web on desktop.
    const url = isMobile()
      ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
      : `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  },
}

const email: Channel = {
  id: 'email',
  canSend: (c) => !!c.email && c.email.trim().length > 0,
  open: (c, text) => {
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
): ChannelId {
  const channel =
    orderedFor(preferred).find((c) => c.canSend(contact)) ?? whatsapp
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

/** Display name of a channel, e.g. for a banner. */
export function channelLabel(id: ChannelId): string {
  if (id === 'whatsapp') return 'WhatsApp'
  return 'Email'
}

/** Primary CTA label for sending via a channel. */
export function sendActionLabel(id: ChannelId): string {
  if (id === 'whatsapp') return 'Send on WhatsApp'
  return 'Send via Email'
}

/** Post-send confirmation label for a channel. */
export function sentConfirmLabel(id: ChannelId): string {
  if (id === 'whatsapp') return 'Opened in WhatsApp'
  return 'Opened in Email'
}
