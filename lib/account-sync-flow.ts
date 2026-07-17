/** Build the same-origin callback carried by a one-time magic link. */
export function accountSyncCallbackURL(sourceDeviceId: string): string {
  const source = sourceDeviceId.trim()
  return source
    ? `/welcome-back?sourceDeviceId=${encodeURIComponent(source)}`
    : '/welcome-back'
}

/**
 * Reconcile the link-requesting device before the browser that opened it.
 * De-duplicating the ids keeps same-device sign-ins to one server transaction.
 */
export function accountSyncDeviceIds(
  sourceDeviceId: string | null | undefined,
  destinationDeviceId: string,
): string[] {
  const source = sourceDeviceId?.trim()
  const destination = destinationDeviceId.trim()
  return [...new Set([source, destination].filter((id): id is string => Boolean(id)))]
}
