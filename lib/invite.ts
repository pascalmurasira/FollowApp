import type { Contact } from './types.ts'
import { copyText, isNativeUserCancelError } from './native.ts'
import { shareContentWithOutcome } from './share-outcome.ts'
import { buildGenericInviteLink } from './invite-link.ts'
export {
  confirmedOutreachCount,
  INVITE_AFTER_CONFIRMED_OUTREACH,
} from './invite-policy.ts'

const LEGACY_STORAGE_KEY = 'nudge.invited.v1'
const PROMPTED_STORAGE_KEY = 'followapp.invitePrompted.v2'

/** A stable invite URL that intentionally contains no contact information. */
export function inviteLink(): string {
  const base =
    typeof window !== 'undefined' ? window.location.origin : 'https://followapp.chat'
  return buildGenericInviteLink(base)
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
  const url = inviteLink()
  const text = inviteMessage(contact, channelLabel)

  try {
    return await shareContentWithOutcome({
      title: 'Join me on FollowApp',
      text,
      url,
    })
  } catch (error) {
    // User cancelled the share sheet — not a real failure, just stop.
    if (
      isNativeUserCancelError(error) ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      return 'failed'
    }
  }

  try {
    await copyText(`${text}\n\n${url}`)
    return 'copied'
  } catch (error) {
    console.error('Failed to copy invite link:', error)
    return 'failed'
  }
}

/** Whether the one-time product invite has already been shown or dismissed. */
export function hasInvited(_contactId?: string): boolean {
  void _contactId
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage.getItem(PROMPTED_STORAGE_KEY) === 'true') {
      return true
    }
    // Anyone who acted on the older per-contact prompt has already seen it.
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    const wasPreviouslyPrompted = Boolean(
      legacy && (JSON.parse(legacy) as unknown[]).length > 0,
    )
    if (wasPreviouslyPrompted) {
      window.localStorage.setItem(PROMPTED_STORAGE_KEY, 'true')
    }
    return wasPreviouslyPrompted
  } catch {
    return false
  }
}

/** Marks the global one-time prompt as handled, so it never nags again. */
export function markInvited(_contactId?: string): void {
  void _contactId
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PROMPTED_STORAGE_KEY, 'true')
  } catch (error) {
    console.error('Failed to persist invite state:', error)
  }
}
