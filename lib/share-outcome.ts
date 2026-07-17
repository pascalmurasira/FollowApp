import { isNativeRuntime, shareContent } from './native.ts'

export type ShareOutcome = 'shared' | 'copied'

/**
 * Distinguish a completed share-sheet action from the clipboard fallback.
 * Neither outcome claims that a recipient actually received or read anything.
 */
export async function shareContentWithOutcome(input: {
  title: string
  text: string
  url?: string
}): Promise<ShareOutcome> {
  const hasShareSheet =
    (await isNativeRuntime()) ||
    (typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  await shareContent(input)
  return hasShareSheet ? 'shared' : 'copied'
}
