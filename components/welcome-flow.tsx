'use client'

import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Camera,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { NewContactInput } from '@/lib/contacts-store'
import { DEMO_CONTACT_IDS } from '@/lib/mock-data'
import { NudgeLogo } from '@/components/nudge-logo'
import { ScanCardSheet } from '@/components/scan-card-sheet'
import { MyCardSheet } from '@/components/my-card-sheet'
import { activationAfterOwnCard } from '@/lib/onboarding'

export interface WelcomeResult {
  selectedContactIds: string[]
  toneId: string
  sampleMode: boolean
  openContactId?: string
}

interface WelcomeFlowProps {
  contacts: Contact[]
  onComplete: (result: WelcomeResult) => void
  /** Persist a card scanned during onboarding (same path as the in-app scanner). */
  onScanContact: (input: NewContactInput) => Contact
}

/**
 * First run is an activation surface, not a product tour. The two jobs users
 * arrive with—capturing somebody else's card and sharing their own—are both one
 * tap away. Tone and cadence use sensible defaults after the first saved card.
 */
export function WelcomeFlow({
  contacts,
  onComplete,
  onScanContact,
}: WelcomeFlowProps) {
  const [scanOpen, setScanOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [cardReady, setCardReady] = useState(false)
  const sampleContact = useMemo(
    () => contacts.find((contact) => DEMO_CONTACT_IDS.has(contact.id)),
    [contacts],
  )

  const completeWithContact = (contactId: string, sampleMode: boolean) => {
    onComplete({
      selectedContactIds: [contactId],
      toneId: 'lowkey',
      sampleMode,
      openContactId: contactId,
    })
  }

  const handleScanAdd = (input: NewContactInput) => {
    return onScanContact(input)
  }

  const handleScanClose = () => {
    setScanOpen(false)
  }

  const handleCardClose = () => {
    setCardOpen(false)
    if (!cardReady) return

    // Creating a shareable card is a valid first win. Samples remain explicitly
    // opt-in through "Try with a sample" and never appear as real relationships.
    onComplete(activationAfterOwnCard())
  }

  const trySample = () => {
    if (!sampleContact) return
    completeWithContact(sampleContact.id, true)
  }

  return (
    <div className="app-field mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col lg:my-6 lg:min-h-[calc(100dvh-3rem)] lg:overflow-hidden lg:rounded-[1.6rem] lg:border lg:border-white/40 lg:shadow-card-lg">
      <span className="field-grain" aria-hidden />
      <header className="relative z-[1] flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-8 lg:py-5">
        <span className="flex items-center gap-2.5">
          <span className="primary-action flex size-9 items-center justify-center rounded-xl">
            <NudgeLogo className="size-[18px]" />
          </span>
          <span className="font-heading text-base font-semibold tracking-tight text-[var(--ink-strong)]">
            FollowApp
          </span>
        </span>
        <span className="rounded-full border border-[var(--hairline)] bg-white/25 px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-secondary)] backdrop-blur">
          No account required
        </span>
      </header>

      <main className="relative z-[1] flex flex-1 flex-col items-center justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 text-center sm:px-10">
        <div className="relative flex items-center justify-center">
          <span
            aria-hidden
            className="animate-halo pointer-events-none absolute size-44 rounded-full bg-[var(--field-glow-a)] blur-3xl"
          />
          <div className="glass-hero relative flex h-36 w-56 items-center justify-center overflow-hidden rounded-[1.75rem]">
            <div className="absolute inset-5 rounded-2xl border border-dashed border-[var(--ink-tertiary)]/40" />
            <div className="primary-action relative flex h-20 w-32 -rotate-3 flex-col justify-center rounded-xl px-4 text-left shadow-card-lg">
              <span className="h-2 w-16 rounded-full bg-current opacity-80" />
              <span className="mt-3 h-1.5 w-20 rounded-full bg-current opacity-45" />
              <span className="mt-1.5 h-1.5 w-12 rounded-full bg-current opacity-30" />
            </div>
            <ScanLine className="absolute bottom-3 right-3 size-5 text-[var(--ink-secondary)]" />
          </div>
        </div>

        <div className="mt-9 max-w-md">
          <div className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
            <Sparkles className="size-3.5" />
            First follow-up in under a minute
          </div>
          <h1 className="text-balance font-heading text-[2.25rem] font-bold leading-[1.05] tracking-[-0.045em] text-[var(--ink-strong)] sm:text-[2.75rem]">
            Scan theirs. Share yours.
          </h1>
          <p className="mx-auto mt-4 max-w-[22rem] text-pretty text-[15px] leading-relaxed text-[var(--ink-secondary)]">
            Capture a business card and get a ready-to-send follow-up, or let
            someone scan your digital card.
          </p>
        </div>

        <div className="mt-8 w-full max-w-sm">
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold"
          >
            <Camera className="size-4" />
            Scan their card
            <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setCardOpen(true)}
            className="glass-button pressable mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold text-[var(--ink-strong)]"
          >
            <QrCode className="size-4" />
            Show my QR code
          </button>
          {sampleContact && (
            <button
              type="button"
              onClick={trySample}
              className="pressable mt-3 min-h-11 w-full rounded-full px-4 text-sm font-semibold text-[var(--ink-secondary)]"
            >
              Try with a sample
            </button>
          )}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] leading-relaxed text-[var(--ink-tertiary)]">
            <ShieldCheck className="size-3.5" />
            You review everything before it is saved or sent.
          </p>
        </div>
      </main>

      <ScanCardSheet
        open={scanOpen}
        autoLaunchCamera
        variant="onboarding"
        onClose={handleScanClose}
        onAdd={handleScanAdd}
        onOpenContact={(contactId) => completeWithContact(contactId, false)}
        onTrySample={sampleContact ? trySample : undefined}
      />
      <MyCardSheet
        open={cardOpen}
        onClose={handleCardClose}
        onCardReady={() => setCardReady(true)}
      />
    </div>
  )
}
