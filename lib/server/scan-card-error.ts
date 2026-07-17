import {
  operationalErrorMetadata,
  type OperationalErrorMetadata,
} from './error-metadata.ts'

export type ScanCardErrorMetadata = OperationalErrorMetadata

/**
 * Reduce an arbitrary AI/provider exception to an allowlisted operational
 * category. Messages, stacks, causes, request/response bodies, and image data
 * are never copied into the result, so it is safe to pass to server logging.
 */
export function scanCardErrorMetadata(error: unknown): ScanCardErrorMetadata {
  return operationalErrorMetadata(error)
}

export function isScanCardUnavailable(metadata: ScanCardErrorMetadata): boolean {
  return (
    metadata.category === 'rate_limited' ||
    metadata.category === 'quota_exhausted' ||
    metadata.category === 'access_denied'
  )
}
