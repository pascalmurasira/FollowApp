import type { Contact } from './types.ts'

/** The product earns trust through real follow-ups before asking for a share. */
export const INVITE_AFTER_CONFIRMED_OUTREACH = 3

export function confirmedOutreachCount(contacts: Contact[]): number {
  const ids = new Set<string>()
  for (const contact of contacts) {
    for (const message of contact.messages) {
      if (
        message.sender === 'me' &&
        Boolean(message.sentAt) &&
        (message.channel === 'whatsapp' || message.channel === 'email')
      ) {
        ids.add(message.id)
      }
    }
  }
  return ids.size
}
