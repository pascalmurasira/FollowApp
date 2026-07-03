import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memorySignals, type MemorySignal } from '@/lib/db/schema'

export type SignalKind =
  | 'send'
  | 'skip'
  | 'edit'
  | 'tone'
  | 'regenerate'
  | 'call'

export interface IncomingSignal {
  contactId?: string
  kind: SignalKind
  tone?: string
  detail?: string
}

/** Persist a single interaction signal for a device. */
export async function recordSignal(deviceId: string, signal: IncomingSignal) {
  await db.insert(memorySignals).values({
    deviceId,
    contactId: signal.contactId ?? null,
    kind: signal.kind,
    tone: signal.tone ?? null,
    detail: signal.detail?.slice(0, 500) ?? null,
  })
}

/** Permanently delete every learned signal for a device. */
export async function clearMemory(deviceId: string): Promise<void> {
  await db.delete(memorySignals).where(eq(memorySignals.deviceId, deviceId))
}

export interface UserLearnings {
  /** Total signals stored — drives the "nothing learned yet" state. */
  count: number
  /** Plain-English, user-facing bullets describing what Nudge has picked up. */
  insights: string[]
}

/**
 * A friendly, first-person-readable summary of what Nudge has learned, for the
 * transparency panel. Unlike `buildVoiceProfile` (which is written for the AI),
 * this is phrased for the human and always returns the raw count so the UI can
 * show an honest empty state.
 */
export async function buildUserLearnings(deviceId: string): Promise<UserLearnings> {
  let signals: MemorySignal[]
  try {
    signals = await recentSignals(deviceId)
  } catch (error) {
    console.error('[v0] buildUserLearnings failed to read signals:', error)
    return { count: 0, insights: [] }
  }

  const sentTones: Record<string, number> = {}
  const skippedTones: Record<string, number> = {}
  let sends = 0
  let skips = 0
  let edits = 0
  let calls = 0

  for (const s of signals) {
    if (s.kind === 'send') {
      sends++
      if (s.tone) sentTones[s.tone] = (sentTones[s.tone] ?? 0) + 1
    } else if (s.kind === 'skip') {
      skips++
      if (s.tone) skippedTones[s.tone] = (skippedTones[s.tone] ?? 0) + 1
    } else if (s.kind === 'edit') {
      edits++
    } else if (s.kind === 'call') {
      calls++
    }
  }

  const insights: string[] = []

  const likedTones = topEntries(sentTones, 2)
  if (likedTones.length) {
    insights.push(`You gravitate toward a ${likedTones.join(' and ')} tone.`)
  }

  if (calls >= 2) {
    insights.push(
      sends > calls
        ? 'You sometimes prefer to call instead of text, so we prep talking points for those.'
        : 'You often reach out by calling, so we focus on talking points over messages.',
    )
  }

  const dislikedTones = topEntries(skippedTones, 2).filter(
    (t) => !likedTones.includes(t),
  )
  if (dislikedTones.length) {
    insights.push(`You usually skip ${dislikedTones.join(' and ')} openers.`)
  }

  if (sends + skips >= 5) {
    const rate = sends / (sends + skips)
    if (rate >= 0.6) insights.push('You often send suggestions as-is, so we keep them ready to go.')
    else if (rate <= 0.3) insights.push('You are selective, so we lean on specific details over generic warmth.')
  }

  if (edits >= 3) {
    insights.push('You like to tweak wording, so we keep openers short and easy to edit.')
  }

  return { count: signals.length, insights }
}

/** Most recent signals for a device, newest first. */
async function recentSignals(deviceId: string, limit = 120): Promise<MemorySignal[]> {
  return db
    .select()
    .from(memorySignals)
    .where(eq(memorySignals.deviceId, deviceId))
    .orderBy(desc(memorySignals.createdAt))
    .limit(limit)
}

function topEntries(counts: Record<string, number>, n: number): string[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}

/**
 * Build a short, prompt-injectable description of how this person texts, based
 * on what they actually do: which tones they send vs. skip, how heavily they
 * edit, and any per-contact preferences. Returns '' when there isn't enough
 * history yet, so early prompts stay clean.
 *
 * When `contactId` is provided, contact-specific learnings are emphasized.
 */
export async function buildVoiceProfile(
  deviceId: string,
  contactId?: string,
): Promise<string> {
  let signals: MemorySignal[]
  try {
    signals = await recentSignals(deviceId)
  } catch (error) {
    console.error('[v0] buildVoiceProfile failed to read signals:', error)
    return ''
  }
  if (signals.length < 3) return ''

  const sentTones: Record<string, number> = {}
  const skippedTones: Record<string, number> = {}
  let sends = 0
  let skips = 0
  let edits = 0
  let editChars = 0
  let calls = 0
  let contactCalls = 0

  // Per-contact tone tallies for the requested contact.
  const contactTones: Record<string, number> = {}

  for (const s of signals) {
    if (s.kind === 'send') {
      sends++
      if (s.tone) sentTones[s.tone] = (sentTones[s.tone] ?? 0) + 1
      if (contactId && s.contactId === contactId && s.tone) {
        contactTones[s.tone] = (contactTones[s.tone] ?? 0) + 1
      }
    } else if (s.kind === 'skip') {
      skips++
      if (s.tone) skippedTones[s.tone] = (skippedTones[s.tone] ?? 0) + 1
    } else if (s.kind === 'edit') {
      edits++
      if (s.detail) editChars += s.detail.length
    } else if (s.kind === 'call') {
      calls++
      if (contactId && s.contactId === contactId) contactCalls++
    }
  }

  const lines: string[] = []

  const likedTones = topEntries(sentTones, 2)
  if (likedTones.length) {
    lines.push(`They most often send openers with a ${likedTones.join(' or ')} tone.`)
  }

  const dislikedTones = topEntries(skippedTones, 2).filter(
    (t) => !likedTones.includes(t),
  )
  if (dislikedTones.length) {
    lines.push(`They tend to skip ${dislikedTones.join(' and ')} suggestions.`)
  }

  if (sends + skips >= 5) {
    const rate = sends / (sends + skips)
    if (rate >= 0.6) lines.push('They send suggestions as-is fairly often, so aim for ready-to-send.')
    else if (rate <= 0.3) lines.push('They are picky and skip a lot — favor specificity over generic warmth.')
  }

  if (edits >= 3) {
    const avg = editChars / edits
    if (avg > 0) {
      lines.push(
        'They frequently tweak wording before sending — keep openers concise so edits are easy.',
      )
    }
  }

  if (calls >= 2) {
    lines.push('They sometimes prefer calling over texting — voice matters to them.')
  }

  if (contactId) {
    const contactLiked = topEntries(contactTones, 1)
    if (contactLiked.length) {
      lines.push(
        `For this specific person, they lean toward a ${contactLiked[0]} tone.`,
      )
    }
    if (contactCalls >= 1) {
      lines.push('They have chosen to call this person before, so a phone call feels natural here.')
    }
  }

  if (!lines.length) return ''

  return [
    'What we have learned about how this user likes to text (adapt to this):',
    ...lines.map((l) => `- ${l}`),
  ].join('\n')
}
