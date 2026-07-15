'use client'

import { useState } from 'react'
import { Check, ArrowRight, ScanLine, Sparkles } from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { NewContactInput } from '@/lib/contacts-store'
import { ContactAvatar } from '@/components/contact-avatar'
import { LandingIntro } from '@/components/landing-intro'
import { NudgeLogo } from '@/components/nudge-logo'
import { ScanCardSheet } from '@/components/scan-card-sheet'
import { TONE_OPTIONS } from '@/lib/onboarding'
import { cn } from '@/lib/utils'

interface WelcomeFlowProps {
  contacts: Contact[]
  onComplete: (result: { selectedContactIds: string[]; toneId: string }) => void
  /** Persist a card scanned during onboarding (same path as the in-app scanner). */
  onScanContact: (input: NewContactInput) => Contact
}

type Step = 0 | 1 | 2 | 3

export function WelcomeFlow({
  contacts,
  onComplete,
  onScanContact,
}: WelcomeFlowProps) {
  const [step, setStep] = useState<Step>(0)
  const [selected, setSelected] = useState<string[]>([])
  const [toneId, setToneId] = useState<string>('')
  const [scanOpen, setScanOpen] = useState(false)
  const [scannedName, setScannedName] = useState<string | null>(null)

  const toggleContact = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  const finish = () => {
    onComplete({
      selectedContactIds: selected,
      toneId: toneId || 'lowkey',
    })
  }

  const handleScanAdd = (input: NewContactInput) => {
    const contact = onScanContact(input)
    setSelected((previous) =>
      previous.includes(contact.id) ? previous : [...previous, contact.id],
    )
    setScannedName(input.name?.trim() || 'your contact')
  }

  // Step 0 is the full marketing landing surface, which owns its own layout.
  if (step === 0) {
    return <LandingIntro onGetStarted={() => setStep(1)} />
  }

  return (
    <div className="app-field mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col lg:my-6 lg:min-h-[calc(100dvh-3rem)] lg:overflow-hidden lg:rounded-[1.6rem] lg:border lg:border-white/40 lg:shadow-card-lg">
      <span className="field-grain" aria-hidden />
      <header className="relative z-[1] flex items-center justify-between border-b border-[var(--hairline)] px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur sm:px-8 lg:py-4">
        <span className="flex items-center gap-2.5">
          <span className="primary-action flex size-8 items-center justify-center rounded-lg">
            <NudgeLogo className="size-[17px]" />
          </span>
          <span className="font-heading text-base font-semibold tracking-tight text-[var(--ink-strong)]">
            FollowApp
          </span>
        </span>
        <span className="text-xs font-medium text-[var(--ink-secondary)]">
          Step {step} of 3
        </span>
      </header>

      <div className="flex items-center gap-2 px-6 pt-6 pb-1 sm:px-10">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i === step
                ? 'bg-primary'
                : i < step
                  ? 'bg-primary/45'
                  : 'bg-border',
            )}
          />
        ))}
      </div>

      <div className="relative z-[1] flex flex-1 flex-col px-6 sm:px-10">
        {step === 1 && (
          <PeopleStep
            contacts={contacts}
            selected={selected}
            onToggle={toggleContact}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <ToneStep
            toneId={toneId}
            onSelect={setToneId}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <ScanStep
            scannedName={scannedName}
            onScan={() => setScanOpen(true)}
            onFinish={finish}
          />
        )}
      </div>

      <ScanCardSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onAdd={handleScanAdd}
      />
    </div>
  )
}

/* Shared full-width primary action, with a single light sweep on mount. */
function PrimaryButton({
  children,
  onClick,
  disabled,
  sweep = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  sweep?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="primary-action pressable group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[var(--r-button-lg)] text-sm font-semibold disabled:opacity-40 disabled:shadow-none"
    >
      {sweep && !disabled && (
        <span
          aria-hidden
          className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/25 blur-md"
        />
      )}
      <span className="relative flex items-center gap-2">{children}</span>
    </button>
  )
}

function PeopleStep({
  contacts,
  selected,
  onToggle,
  onNext,
}: {
  contacts: Contact[]
  selected: string[]
  onToggle: (id: string) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="animate-rise pt-6">
        <h2 className="text-balance font-heading text-[1.95rem] font-bold leading-tight tracking-[-0.03em] text-[var(--ink-strong)]">
          Who do you keep meaning to text?
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--ink-secondary)]">
          Pick a few. We’ll move them to the top and have an opener ready for
          each — no typing required.
        </p>
      </div>

      <div className="mt-6 flex-1 overflow-y-auto">
        <ul className="grid grid-cols-2 gap-3">
          {contacts.map((contact, i) => {
            const isSelected = selected.includes(contact.id)
            return (
              <li
                key={contact.id}
                className="animate-rise"
                style={{ animationDelay: `${0.06 + i * 0.05}s` }}
              >
                <button
                  type="button"
                  onClick={() => onToggle(contact.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'glass-card pressable relative flex min-h-11 w-full flex-col items-center gap-2 rounded-xl p-4 text-center transition-all duration-200',
                    isSelected
                      ? 'scale-[1.02] border-[var(--action-bg)] bg-white/40 shadow-card ring-2 ring-[var(--action-bg)]/20'
                      : 'hover:border-[var(--action-bg)]/40',
                  )}
                >
                  {isSelected && (
                    <span className="animate-bloom primary-action absolute right-2 top-2 flex size-5 items-center justify-center rounded-full shadow-card">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  <ContactAvatar contact={contact} size="lg" />
                  <span className="mt-1 text-sm font-medium leading-tight text-[var(--ink-strong)]">
                    {contact.name}
                  </span>
                  <span className="text-xs leading-tight text-[var(--ink-secondary)]">
                    {contact.relationship}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="pb-8 pt-6">
        <PrimaryButton onClick={onNext}>
          {selected.length === 0
            ? 'Skip examples and choose tone'
            : `Next: choose tone for ${selected.length}`}
          <ArrowRight className="size-4" />
        </PrimaryButton>
        {selected.length === 0 && (
          <p className="mt-3 text-center text-xs text-[var(--ink-secondary)]">
            You can skip the examples and add your own people next.
          </p>
        )}
      </div>
    </div>
  )
}

function ToneStep({
  toneId,
  onSelect,
  onNext,
}: {
  toneId: string
  onSelect: (id: string) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="animate-rise pt-6">
        <h2 className="text-balance font-heading text-[1.95rem] font-bold leading-tight tracking-[-0.03em] text-[var(--ink-strong)]">
          How do you sound?
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-[var(--ink-secondary)]">
          Tap the vibe that feels most like you. Every suggestion we write will
          match it.
        </p>
      </div>

      <div className="mt-6 flex-1">
        <ul className="grid grid-cols-2 gap-3">
          {TONE_OPTIONS.map((tone, i) => {
            const Icon = tone.icon
            const isSelected = toneId === tone.id
            return (
              <li
                key={tone.id}
                className="animate-rise"
                style={{ animationDelay: `${0.06 + i * 0.06}s` }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(tone.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'glass-card pressable flex min-h-11 w-full flex-col items-start gap-2 rounded-2xl p-4 text-left transition-all duration-200',
                    isSelected
                      ? 'scale-[1.02] border-[var(--action-bg)] bg-white/35 shadow-card ring-2 ring-[var(--action-bg)]/20'
                      : 'hover:border-[var(--action-bg)]/40',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-xl transition-colors duration-200',
                      isSelected
                        ? 'bg-[var(--action-bg)] text-[var(--action-fg)]'
                        : 'bg-white/25 text-[var(--ink-secondary)]',
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="mt-1 text-sm font-medium leading-tight text-[var(--ink-strong)]">
                    {tone.label}
                  </span>
                  <span className="text-xs leading-tight text-[var(--ink-secondary)]">
                    {tone.blurb}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="pb-8 pt-6">
        <PrimaryButton onClick={onNext} disabled={!toneId} sweep={!!toneId}>
          Next: add your first contact
          <ArrowRight className="size-4" />
        </PrimaryButton>
      </div>
    </div>
  )
}

/* Optional last step: scan a business card to add the very first contact —
   showcasing the app's signature input right at the start. Fully skippable. */
function ScanStep({
  scannedName,
  onScan,
  onFinish,
}: {
  scannedName: string | null
  onScan: () => void
  onFinish: () => void
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
        <div className="relative flex items-center justify-center">
          <span
            aria-hidden
            className="animate-halo pointer-events-none absolute size-40 rounded-full bg-[var(--field-glow-a)] blur-3xl"
          />
          <div className="animate-bloom primary-action relative flex size-[4.5rem] items-center justify-center rounded-[1.5rem] shadow-card-lg">
            <ScanLine className="size-9" />
          </div>
        </div>

        <h2 className="animate-rise mt-9 text-balance font-heading text-[1.95rem] font-bold leading-tight tracking-[-0.03em] text-[var(--ink-strong)]">
          Add your first card
        </h2>
        <p className="animate-rise mt-3 max-w-[20rem] text-pretty leading-relaxed text-[var(--ink-secondary)]">
          Got a business card handy? Snap it and FollowApp fills in the details
          for you. You can always do this later.
        </p>

        {scannedName && (
          <div className="animate-bloom mt-7 flex items-center gap-2 rounded-full border border-[var(--status-on-track)]/25 bg-[var(--status-on-track-tint)] px-4 py-2 text-sm font-medium text-[var(--status-on-track)]">
            <Sparkles className="size-4" />
            Added {scannedName} — nice start.
          </div>
        )}
      </div>

      <div className="pb-8 pt-6">
        {scannedName ? (
          <PrimaryButton onClick={onFinish} sweep>
            Show me who to text
            <ArrowRight className="size-4" />
          </PrimaryButton>
        ) : (
          <>
            <PrimaryButton onClick={onScan}>
              <ScanLine className="size-4" />
              Scan a business card
            </PrimaryButton>
            <button
              type="button"
              onClick={onFinish}
              className="pressable mt-3 min-h-11 w-full rounded-full text-center text-sm font-medium text-[var(--ink-secondary)]"
            >
              Skip — take me to my follow-ups
            </button>
          </>
        )}
      </div>
    </div>
  )
}
