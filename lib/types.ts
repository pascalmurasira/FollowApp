export type MessageSender = 'me' | 'them'

/** External channels that FollowApp can prepare an outreach for. */
export type OutreachChannel = 'whatsapp' | 'email'

export interface Message {
  id: string
  sender: MessageSender
  text: string
  /** Minutes ago, used to render relative timestamps in the demo. */
  minutesAgo: number
  /** Absolute time for persisted, user-confirmed outreach history. */
  sentAt?: string
  /**
   * The sender's local calendar date (YYYY-MM-DD). This is separate from the
   * absolute timestamp so confirmations near midnight keep the date the user
   * actually saw even when the server is in another time zone.
   */
  sentOn?: string
  /** Where the user confirmed sending the outreach. */
  channel?: OutreachChannel
  /**
   * Renders as a centered status note rather than a chat bubble — used for
   * non-text events like "You called Maya" so a call shows in the thread
   * without faking a sent text message.
   */
  system?: boolean
}

/**
 * Relationship tier — sets how often you want to stay in touch with someone.
 * Drives the follow-up cadence and feed prioritization for FollowApp.
 *   key     → high-value connection, short cadence
 *   network → regular professional contact, medium cadence
 *   casual  → keep-warm contact, long cadence
 */
export type Tier = 'key' | 'network' | 'casual'

/** How a new relationship entered FollowApp. */
export type EncounterCaptureMethod =
  | 'card-scan'
  | 'qr-scan'
  | 'manual'
  | 'contact-import'

export type EncounterReviewState = 'pending' | 'reviewed'
export type FollowUpDisposition = 'important' | 'later' | 'none'
export type NextStepKind =
  | 'send-deck'
  | 'send-quote'
  | 'make-introduction'
  | 'book-meeting'
  | 'send-sample'
  | 'application'
  | 'follow-up'
  | 'custom'
export type NextStepOwner = 'me' | 'them' | 'shared'
export type NextStepStatus = 'open' | 'done' | 'dismissed'

export interface EncounterEvent {
  /** Random, immutable session id. Event names are editable and not unique. */
  id: string
  name: string
  /** Local calendar date, YYYY-MM-DD. */
  date?: string
  location?: string
}

export interface EncounterNextStep {
  kind: NextStepKind
  label: string
  owner: NextStepOwner
  /** Local calendar date, YYYY-MM-DD. */
  dueOn?: string
  status: NextStepStatus
  createdAt: string
  completedAt?: string
}

/**
 * A compact, user-approved memory of one relationship-forming encounter.
 * Versioning lets future clients migrate this JSON without corrupting legacy
 * contacts or treating inferred data as certain.
 */
export interface ContactEncounter {
  version: 1
  captureMethod: EncounterCaptureMethod
  capturedAt: string
  event?: EncounterEvent
  memorySeed?: string
  nextStep?: EncounterNextStep
  reviewState: EncounterReviewState
  disposition?: FollowUpDisposition
  reviewedAt?: string
}

export interface Contact {
  id: string
  name: string
  /** Short relationship label, e.g. "Former manager". */
  relationship: string
  /** Role + company, shown under the name, e.g. "Design Lead · Linear". */
  title?: string
  /** Phone number (with country code) used for the WhatsApp deep link. */
  phone?: string
  /** Email, used to match the contact to a real FollowApp user for in-app chat. */
  email?: string
  /** Hex-free accent token name used for the avatar background. */
  avatarHue: 'coral' | 'teal' | 'amber' | 'rose' | 'sage'
  /** Optional photo (data URL or remote URL). Falls back to initials avatar. */
  photoUrl?: string
  /** Days since your last touch. Drives the follow-up reminder. */
  daysSinceContact: number
  /**
   * Date the user last spoke to this person, as YYYY-MM-DD. `null` means the
   * user has never contacted them, so they should surface as due.
   */
  lastContactedAt?: string | null
  /** Relationship priority. Defaults to "network" when unset. */
  tier?: Tier
  /** Free-form context the AI uses to craft a relevant message. */
  context: string
  /** Things this person cares about — work focus, recent moves, shared history. */
  interests: string[]
  /** Bounded encounter history; the latest entry drives the immediate plan. */
  encounters?: ContactEncounter[]
  /** Circles this person belongs to, e.g. ["Clients"]. Used to filter the feed. */
  groups?: string[]
  messages: Message[]
}

export interface Profile {
  /** Display name shown on the You tab. */
  name: string
  /** Optional profile photo as a small, locally-stored data URL. */
  photoUrl?: string
  /** Role/title shown on your digital business card, e.g. "Design Lead". */
  title?: string
  /** Company shown on your digital business card, e.g. "Linear". */
  company?: string
  /** Phone number for your card's QR/vCard (also enables in-app chat matching). */
  phone?: string
  /** Email for your card's QR/vCard (also enables in-app chat matching). */
  email?: string
}

export interface Suggestion {
  /** Short label for the vibe of the message, e.g. "Casual", "Caring". */
  tone: string
  /** The ready-to-send message text. */
  text: string
}

export interface EnrichmentHook {
  /** One short, factual sentence about a recent professional development. */
  text: string
  /** Category of the development, used to label and icon the chip. */
  kind: 'job-change' | 'company-news' | 'press' | 'other'
  /** Optional short source name or domain. */
  source?: string
}

export interface TalkingPoint {
  /** Short verb-led category, e.g. "Ask about", "Share", "Suggest". */
  label: string
  /** The actual point to raise on the call, phrased for a quick glance. */
  text: string
}

export type Tab = 'nudges' | 'chats' | 'you'
