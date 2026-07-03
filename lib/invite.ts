import type { Contact } from '@/lib/types'

const STORAGE_KEY = 'nudge.invited.v1'

/** Stable, shareable invite link for a given contact (demo uses a short code). */
export function inviteLink(contact: Contact): string {
  const code = `${contact.id}-${contact.name.split(' ')[0].toLowerCase()}`
  const base =
    typeof window !== 'undefined' ? window.location.origin : 'https://followapp.app'
  return `${base}/i/${code}`
}

/** A warm, non-spammy invite message that demonstrates the product itself. */
export function inviteMessage(contact: Contact, channelLabel = 'WhatsApp'): string {
  const firstName = contact.name.split(' ')[0]
  return `Hey ${firstName} — that message I just sent you on ${channelLabel}? FollowApp helped me find the words. It reminds me who I've been meaning to reach and writes the opener so I actually do it. Thought you'd like it for keeping your own people close.`
}

/**
 * Shares the invite via the native share sheet when available, otherwise
 * copies the link to the clipboard. Returns how it was handled so the UI can
 * show the right confirmation.
 */
export async function shareInvite(
  contact: Contact,
  channelLabel?: string,
): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteLink(contact)
  const text = inviteMessage(contact, channelLabel)

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'Join me on FollowApp', text, url })
      return 'shared'
    } catch (error) {
      // User cancelled the share sheet — not a real failure, just stop.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'failed'
      }
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n\n${url}`)
    return 'copied'
  } catch (error) {
    console.error('Failed to copy invite link:', error)
    return 'failed'
  }
}

/** Whether we've already prompted to invite this contact (never nag twice). */
export function hasInvited(contactId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    return (JSON.parse(raw) as string[]).includes(contactId)
  } catch {
    return false
  }
}

/** Marks a contact as already prompted, so the invite prompt won't reappear. */
export function markInvited(contactId: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    if (!list.includes(contactId)) {
      list.push(contactId)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    }
  } catch (error) {
    console.error('Failed to persist invite state:', error)
  }
}
