/**
 * A deliberately small delivery-level email check. OCR and manual entry may
 * contain partial values such as `name@`; those should remain editable contact
 * data but must never unlock an Email send action.
 */
export function isDeliverableEmail(value?: string | null): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? '').trim())
}
