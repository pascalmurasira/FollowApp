import type { LucideIcon } from 'lucide-react'
import { Heart, Laugh, Coffee, Target } from 'lucide-react'

const STORAGE_KEY = 'nudge.onboarding.v1'

export interface ToneOption {
  id: string
  label: string
  blurb: string
  icon: LucideIcon
  /** Fed to the AI so generated messages match how the user sounds. */
  voice: string
}

export const TONE_OPTIONS: ToneOption[] = [
  {
    id: 'warm',
    label: 'Warm & caring',
    blurb: 'Heartfelt and kind',
    icon: Heart,
    voice:
      'Warm and caring. Leads with feeling and makes people feel seen. Short, heartfelt texts. Light on emojis.',
  },
  {
    id: 'funny',
    label: 'Playful & funny',
    blurb: 'Light and teasing',
    icon: Laugh,
    voice:
      'Playful and funny. Uses light humor and teasing to break the ice. Casual and upbeat. Occasional emoji.',
  },
  {
    id: 'lowkey',
    label: 'Low-key & chill',
    blurb: 'Casual, no pressure',
    icon: Coffee,
    voice:
      'Low-key and chill. Short, casual texts with zero pressure. Not big on emojis. Keeps it effortless.',
  },
  {
    id: 'direct',
    label: 'Direct & clear',
    blurb: 'Straight to the point',
    icon: Target,
    voice:
      'Direct and clear. Gets to the point quickly and suggests concrete plans. Friendly but efficient.',
  },
]

export function voiceForTone(toneId: string): string {
  return (
    TONE_OPTIONS.find((t) => t.id === toneId)?.voice ?? TONE_OPTIONS[2].voice
  )
}

/** A short, human-friendly label for a tone, e.g. "warm & caring". */
export function labelForTone(toneId: string): string {
  const label =
    TONE_OPTIONS.find((t) => t.id === toneId)?.label ?? TONE_OPTIONS[2].label
  return label.toLowerCase()
}

export interface OnboardingState {
  completed: boolean
  /** IDs of contacts the user chose or created during activation. */
  selectedContactIds: string[]
  /** Chosen tone id, maps to an AI voice. */
  toneId: string
  /** Samples are opt-in and disappear as soon as the user adds a real person. */
  sampleMode?: boolean
}

/**
 * New users may preview samples, but real relationship data must never be mixed
 * with fictional people. Undefined preserves the legacy sample experience only
 * for existing installs that have no real contacts yet.
 */
export function shouldShowSampleContacts(
  state: OnboardingState | null,
  realContactCount: number,
): boolean {
  if (realContactCount > 0) return false
  if (!state?.completed) return true
  return state.sampleMode !== false
}

/** Real relationship data is itself proof that first-run activation happened. */
export function shouldEnterApp(
  state: OnboardingState | null,
  realContactCount: number,
): boolean {
  return state?.completed === true || realContactCount > 0
}

export function loadOnboarding(): OnboardingState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OnboardingState
  } catch (error) {
    console.error('Failed to load onboarding state:', error)
    return null
  }
}

export function saveOnboarding(state: OnboardingState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save onboarding state:', error)
  }
}

export function clearOnboarding() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear onboarding state:', error)
  }
}
