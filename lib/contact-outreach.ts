import type { Message } from './types.ts'
import { normalizeLastContactedAt } from './contact-dates.ts'

export interface MessageAppendResult {
  messages: Message[]
  inserted: boolean
}

/**
 * Append one confirmed outreach exactly once. Replaying an existing id returns
 * the original array so callers can also leave cadence timestamps untouched.
 */
export function appendMessageOnce(
  previous: Message[],
  message: Message,
  limit = 100,
): MessageAppendResult {
  if (previous.some((item) => item.id === message.id)) {
    return { messages: previous, inserted: false }
  }
  return {
    messages: [...previous, message].slice(-Math.max(1, limit)),
    inserted: true,
  }
}

/**
 * Resolve the user's confirmed calendar date. `sentOn` is authoritative for
 * current clients; `sentAt` keeps persisted confirmations from older releases
 * readable and replayable.
 */
export function confirmedOutreachDate(
  message: Pick<Message, 'sentAt' | 'sentOn'>,
): string | null {
  const sentOn = normalizeLastContactedAt(message.sentOn)
  if (sentOn) return sentOn
  return normalizeLastContactedAt(message.sentAt) ?? null
}
