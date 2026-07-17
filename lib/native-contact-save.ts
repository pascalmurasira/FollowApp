export type ContactSaveOutcome =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'exported'
  | 'cancelled'
  | 'denied'
  | 'error'

export function nativeContactSaveLabel(
  state: ContactSaveOutcome,
  idleLabel = 'Also save to phone',
): string {
  switch (state) {
    case 'saving':
      return 'Opening Contacts…'
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
