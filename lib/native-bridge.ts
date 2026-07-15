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
