export const GENERIC_INVITE_PATH = '/i/join'

const PRODUCTION_ORIGIN = 'https://followapp.chat'

/**
 * Build an invitation URL without accepting any contact data. Keeping this
 * helper data-independent prevents names and local contact identifiers from
 * leaking through browser history, link previews, analytics, or server logs.
 */
export function buildGenericInviteLink(origin = PRODUCTION_ORIGIN): string {
  try {
    return `${new URL(origin).origin}${GENERIC_INVITE_PATH}`
  } catch {
    return `${PRODUCTION_ORIGIN}${GENERIC_INVITE_PATH}`
  }
}

/** Legacy invite codes are deliberately ignored and never promoted into UI. */
export function inviteLandingHeadline(_legacyCode?: string): string {
  void _legacyCode
  return 'You’ve been invited to FollowApp'
}
