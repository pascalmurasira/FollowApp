const AUTH_PATH = '/api/auth/magic-link/verify'

/** Only auth links from FollowApp's production origin may enter the WebView. */
export function nativeAuthDestination(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (
      url.origin !== 'https://followapp.chat' ||
      url.username ||
      url.password
    ) {
      return null
    }
    if (url.pathname !== AUTH_PATH) return null
    if (!url.searchParams.get('token')?.trim()) return null
    return url.toString()
  } catch {
    return null
  }
}

/** A non-secret, stable marker used to consume a native launch link once. */
export function nativeAuthMarker(value: unknown): string | null {
  const destination = nativeAuthDestination(value)
  if (!destination) return null
  const token = new URL(destination).searchParams.get('token') ?? ''
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  const digest = [first, second]
    .map((part) => (part >>> 0).toString(16).padStart(8, '0'))
    .join('')
  return `followapp.native-auth.consumed.${digest}`
}
