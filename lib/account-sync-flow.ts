/**
 * Build the same-origin callback carried by a one-time magic link.
 *
 * A device id is a bearer capability until it is claimed by an account. Never
 * put that capability in an email link: if the link is opened on another
 * device, that browser must not be able to claim the source installation and
 * leave it signed out of its own data. The installation that opens the link
 * reconciles its own local id on `/welcome-back` instead.
 */
export function accountSyncCallbackURL(): string {
  return '/welcome-back'
}

/**
 * Reconcile only the browser that actually holds the authenticated session.
 *
 * `sourceDeviceId` remains accepted so old, already-sent links can be handled
 * safely. It is used only when it is exactly the current installation id; a
 * cross-device source capability is deliberately ignored.
 */
export function accountSyncDeviceIds(
  sourceDeviceId: string | null | undefined,
  destinationDeviceId: string,
): string[] {
  // Kept in the signature for safe handling of links emitted by older builds.
  void sourceDeviceId
  const destination = destinationDeviceId.trim()
  if (!destination) return []
  return [destination]
}
