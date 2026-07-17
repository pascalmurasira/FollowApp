export interface CameraLaunchState {
  attempt: number
  active: boolean
}

/** Keep the model inside the route's 30 second execution budget. */
export const SCAN_CARD_MODEL_TIMEOUT_MS = 24_000

/** Leave enough time for the route to return its own useful timeout response. */
export const SCAN_CARD_CLIENT_TIMEOUT_MS = 28_000

export const SCAN_CARD_FIELD_KEYS = [
  'name',
  'title',
  'company',
  'phone',
  'email',
  'website',
] as const

export const SCAN_REVIEW_FIELD_KEYS = [
  'name',
  'title',
  'company',
  'phone',
  'email',
] as const

export type ScanCardField = (typeof SCAN_CARD_FIELD_KEYS)[number]
export type ScanImageQuality = 'clear' | 'usable' | 'poor' | 'unknown'

const SCAN_CARD_FIELD_SET = new Set<string>(SCAN_CARD_FIELD_KEYS)

/** Accept only known field names from the untrusted scan response. */
export function normalizeScanReviewFields(value: unknown): ScanCardField[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter(
        (field): field is ScanCardField =>
          typeof field === 'string' && SCAN_CARD_FIELD_SET.has(field),
      ),
    ),
  ]
}

/**
 * A badge means "please check", never "the OCR verified this". Optional blank
 * fields stay neutral; only a missing required name, invalid destination, or a
 * field explicitly marked ambiguous by the vision model is highlighted.
 */
export function scanFieldNeedsReview(
  field: ScanCardField,
  value: string,
  explicitlyUncertain: readonly ScanCardField[],
): boolean {
  const trimmed = value.trim()
  if (!trimmed) return field === 'name'
  if (explicitlyUncertain.includes(field)) return true
  if (field === 'email') return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  if (field === 'phone') return trimmed.replace(/\D/g, '').length < 8
  return false
}

export function scanReadingStatus(elapsedMs: number): {
  title: string
  detail: string
  canEnterManually: boolean
} {
  if (elapsedMs < 5_000) {
    return {
      title: 'Reading the card…',
      detail: 'Finding the name and contact details.',
      canEnterManually: false,
    }
  }
  if (elapsedMs < 12_000) {
    return {
      title: 'Checking the essentials…',
      detail: 'Complex layouts can take a few more seconds.',
      canEnterManually: true,
    }
  }
  return {
    title: 'Still working…',
    detail: 'You can keep waiting or enter the essentials now.',
    canEnterManually: true,
  }
}

export function scanQualityNotice(
  quality: ScanImageQuality,
  fieldsNeedingReview: number,
  qualityNote = '',
): string | null {
  if (quality === 'poor') {
    return (
      qualityNote.trim() ||
      'The photo was difficult to read. Check the highlighted details or rescan in brighter light.'
    )
  }
  if (fieldsNeedingReview > 0) {
    return fieldsNeedingReview === 1
      ? 'One detail may be uncertain. Check the highlighted field.'
      : `${fieldsNeedingReview} details may be uncertain. Check the highlighted fields.`
  }
  return null
}

export function countScanReviewCorrections(
  before: Record<(typeof SCAN_REVIEW_FIELD_KEYS)[number], string> | null,
  after: Record<(typeof SCAN_REVIEW_FIELD_KEYS)[number], string>,
): number {
  if (!before) return 0
  return SCAN_REVIEW_FIELD_KEYS.filter(
    (field) => before[field].trim() !== after[field].trim(),
  ).length
}

export function createCameraLaunchState(): CameraLaunchState {
  return { attempt: 0, active: false }
}

/** Returns a unique attempt id, or null while another camera owns the UI. */
export function beginCameraLaunch(state: CameraLaunchState): number | null {
  if (state.active) return null
  state.active = true
  state.attempt += 1
  return state.attempt
}

/** Releases ownership only for the attempt that still owns the camera. */
export function finishCameraLaunch(
  state: CameraLaunchState,
  attempt: number,
): boolean {
  if (!state.active || state.attempt !== attempt) return false
  state.active = false
  return true
}

/** Invalidates a pending result when the scan sheet is reset or closed. */
export function cancelCameraLaunch(state: CameraLaunchState): void {
  state.attempt += 1
  state.active = false
}

export function isCameraLaunchActive(state: CameraLaunchState): boolean {
  return state.active
}
