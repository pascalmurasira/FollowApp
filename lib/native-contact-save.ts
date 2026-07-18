export type ContactSaveOutcome =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'exported'
  | 'cancelled'
  | 'denied'
  | 'error'

export const NATIVE_CONTACT_SAVE_TIMEOUT_MS = 65_000

export async function nativeContactSaveWithin<T>(
  operation: Promise<T>,
  timeoutMs = NATIVE_CONTACT_SAVE_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(
            'Saving to Contacts took too long. Please try again.',
          ) as Error & { code?: string }
          error.code = 'CONTACT_SAVE_TIMEOUT'
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function nativeContactSaveLabel(
  state: ContactSaveOutcome,
  idleLabel = 'Also save to phone',
): string {
  switch (state) {
    case 'saving':
      return 'Saving to Contacts…'
    case 'saved':
      return 'Saved to Contacts'
    case 'exported':
      return 'Contact file ready'
    case 'cancelled':
      return 'Not saved — try again'
    case 'denied':
      return 'Open Settings for Contacts'
    case 'error':
      return 'Could not save — try again'
    default:
      return idleLabel
  }
}
