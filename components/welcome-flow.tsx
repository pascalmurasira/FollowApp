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
  onScanContact: (input: NewContactInput) => void
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
    onScanContact(input)
    setScannedName(input.name?.trim() || 'your contact')
  }

  // Step 0 is the full marketing landing surface, which owns its own layout.
  if (step === 0) {
    return <LandingIntro onGetStarted={() => setStep(1)} />
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col bg-background lg:my-6 lg:min-h-[calc(100dvh-3rem)] lg:overflow-hidden lg:rounded-[1.25rem] lg:border lg:border-border lg:shadow-card-lg">
      <header className="flex items-center justify-between border-b border-border bg-card px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-8 lg:py-4">
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <NudgeLogo className="size-[17px]" />
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">
            FollowApp
          </span>
        </span>
        <span className="text-xs font-medium text-muted-foreground">
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

      <div className="flex flex-1 flex-col px-6 sm:px-10">
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
    className="group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-card transition-all duration-200 active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
    >
      {sweep && !disabled && (
        <span
          aria-hidden
          className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-primary-foreground/25 blur-md"
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
        <h2 className="text-balance font-heading text-[1.85rem] font-semibold leading-tight tracking-tight">
          Who do you keep meaning to text?
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
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
                    'relative flex min-h-11 w-full flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-200 active:scale-[0.98]',
                    isSelected
                      ? 'scale-[1.02] border-primary bg-primary/[0.06] shadow-card ring-2 ring-primary/25'
                      : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  {isSelected && (
                    <span className="animate-bloom absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  <ContactAvatar contact={contact} size="lg" />
                  <span className="mt-1 text-sm font-medium leading-tight text-foreground">
                    {contact.name}
                  </span>
                  <span className="text-xs leading-tight text-muted-foreground">
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
            ? 'Continue'
            : `Continue with ${selected.length}`}
          <ArrowRight className="size-4" />
        </PrimaryButton>
        {selected.length === 0 && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
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
        <h2 className="text-balance font-heading text-[1.85rem] font-semibold leading-tight tracking-tight">
          How do you sound?
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
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
                    'flex min-h-11 w-full flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.97]',
                    isSelected
                      ? 'scale-[1.02] border-primary bg-primary/[0.06] shadow-card ring-2 ring-primary/25'
                      : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-xl transition-colors duration-200',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="mt-1 text-sm font-medium leading-tight text-foreground">
                    {tone.label}
                  </span>
                  <span className="text-xs leading-tight text-muted-foreground">
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
          Continue
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
            className="animate-halo pointer-events-none absolute size-40 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="animate-bloom relative flex size-[4.5rem] items-center justify-center rounded-[1.5rem] bg-primary text-primary-foreground shadow-card-lg">
            <ScanLine className="size-9" />
          </div>
        </div>

        <h2 className="animate-rise mt-9 text-balance font-serif text-[1.95rem] font-medium leading-tight tracking-tight">
          Add your first card
        </h2>
        <p className="animate-rise mt-3 max-w-[20rem] text-pretty leading-relaxed text-muted-foreground">
          Got a business card handy? Snap it and FollowApp fills in the details
          for you. You can always do this later.
        </p>

        {scannedName && (
          <div className="animate-bloom mt-7 flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-4 py-2 text-sm font-medium text-primary">
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
              className="mt-3 min-h-11 w-full text-center text-sm font-medium text-muted-foreground transition-colors active:text-foreground"
            >
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  )
}
