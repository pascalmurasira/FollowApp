/** True only for an absent/older bridge method, where the vCard fallback is safe. */
export function isNativeMethodUnavailableError(error: unknown): boolean {
  if (!error) return false
  const candidate =
    typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown })
      : null
  const code =
    typeof candidate?.code === 'string' ? candidate.code.toUpperCase() : ''
  if (
    code === 'UNIMPLEMENTED' ||
    code === 'NOT_IMPLEMENTED' ||
    code === 'PLUGIN_NOT_FOUND' ||
    code === 'UNAVAILABLE'
  ) {
    return true
  }

  const message =
    typeof candidate?.message === 'string' ? candidate.message : String(error)
  return (
    /(?:followappnative|savecontact|plugin|method).*(?:not implemented|unimplemented|not available|unavailable|not a function|missing)/i.test(
      message,
    ) ||
    /(?:not implemented|unimplemented|not available|unavailable|missing).*(?:followappnative|savecontact|plugin|method)/i.test(
      message,
    )
  )
}

/**
 * Only adapter-availability failures may fall through to Capacitor Camera.
 * Permission, cancellation, busy, and capture errors must stay single-path so
 * one tap can never open multiple camera implementations in sequence.
 */
export function isNativeCameraAdapterUnavailableError(error: unknown): boolean {
  if (isNativeMethodUnavailableError(error)) return true
  const candidate =
    typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown })
      : null
  const code =
    typeof candidate?.code === 'string' ? candidate.code.toUpperCase() : ''
  if (code === 'CAMERA_UNAVAILABLE') return true
  const message =
    typeof candidate?.message === 'string' ? candidate.message : String(error)
  return /camera (?:is unavailable|could not be opened)/i.test(message)
}
