'use client'

import { useState } from 'react'
import {
  Check,
  ArrowRight,
  Radar,
  PenLine,
  Send,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import type { Contact } from '@/lib/types'
import type { NewContactInput } from '@/lib/contacts-store'
import { ContactAvatar } from '@/components/contact-avatar'
import { NudgeLogo } from '@/components/nudge-logo'
import { ScanCardSheet } from '@/components/scan-card-sheet'
import { ShaderBackdrop } from '@/components/shader-backdrop'
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
    setScanOpen(false)
  }

  return (
    <div className="relative isolate mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background">
      {/* Ambient shader field — strongest at the top/bottom edges, fading out
          through the middle so step content and text stay perfectly legible. */}
      <ShaderBackdrop
        variant="hero"
        className="-z-10 opacity-90 [mask-image:linear-gradient(to_bottom,black,transparent_46%,transparent_56%,black)]"
      />
      {/* Clay app bar — matches the main messenger shell */}
      <header className="flex items-center justify-center gap-2 bg-appbar px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-appbar-foreground">
        <NudgeLogo className="size-[20px]" />
        <span className="font-heading text-lg font-semibold tracking-tight">
          FollowApp
        </span>
      </header>

      {/* Progress — a calm, crafted indicator of where you are */}
      <div className="flex items-center justify-center gap-1.5 px-6 pt-5 pb-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-500 ease-out',
              i === step
                ? 'w-8 bg-primary'
                : i < step
                  ? 'w-1.5 bg-primary/45'
                  : 'w-1.5 bg-border',
            )}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col px-6">
        {step === 0 && <IntroStep onNext={() => setStep(1)} />}

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
      className="group relative flex min-h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-primary font-medium text-primary-foreground shadow-card transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
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

const INTRO_FEATURES = [
  {
    icon: Radar,
    title: 'We notice who’s due',
    body: 'FollowApp surfaces the connections you’re due to reach — ranked by how much each one matters to you.',
  },
  {
    icon: PenLine,
    title: 'We find the words',
    body: 'A warm, ready-to-send opener written in your voice — no blank screen, no awkward re-intro.',
  },
  {
    icon: Send,
    title: 'You just send',
    body: 'One tap and it’s on its way. Staying in touch finally fits a busy schedule.',
  },
]

function IntroStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
        {/* Brand mark — the ambient shader field behind the flow provides the
            surrounding glow, so the mark only needs its own soft shadow. */}
        <div className="relative flex items-center justify-center">
          <div className="animate-bloom relative flex size-[4.75rem] items-center justify-center rounded-[1.5rem] bg-primary text-primary-foreground shadow-card-lg">
            <NudgeLogo className="size-10" />
          </div>
        </div>

        <h1
          className="animate-rise mt-10 text-balance font-serif text-[2.6rem] font-medium leading-[1.04] tracking-tight"
          style={{ animationDelay: '0.12s' }}
        >
          Keep your professional
          <br />
          relationships warm.
        </h1>
        <p
          className="animate-rise mt-4 max-w-[20rem] text-pretty leading-relaxed text-muted-foreground"
          style={{ animationDelay: '0.2s' }}
        >
          The people who matter to your career are easy to lose touch with.
          FollowApp tells you who to reach and helps you say it — in seconds.
        </p>

        {/* Grouped, hairline-divided feature card — one considered surface */}
        <div
          className="animate-rise mt-9 w-full overflow-hidden rounded-3xl border border-border/70 bg-card/70 text-left shadow-card backdrop-blur-sm"
          style={{ animationDelay: '0.3s' }}
        >
          <ul className="divide-y divide-border/60">
            {INTRO_FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <li
                  key={f.title}
                  className="animate-rise flex items-start gap-3.5 px-4 py-3.5"
                  style={{ animationDelay: `${0.38 + i * 0.1}s` }}
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[0.9375rem] font-medium leading-snug text-foreground">
                      {f.title}
                    </span>
                    <span className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                      {f.body}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div
        className="animate-rise pb-8 pt-6"
        style={{ animationDelay: '0.7s' }}
      >
        <PrimaryButton onClick={onNext} sweep>
          Let’s begin
          <ArrowRight className="size-4 transition-transform duration-200 group-active:translate-x-0.5" />
        </PrimaryButton>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          Takes about a minute. No account needed.
        </p>
      </div>
    </div>
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
        <h2 className="text-balance font-serif text-[1.85rem] font-medium leading-tight tracking-tight">
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
                    'relative flex min-h-11 w-full flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all duration-200 active:scale-[0.97]',
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
        <PrimaryButton onClick={onNext} disabled={selected.length === 0}>
          {selected.length === 0
            ? 'Pick at least one'
            : `Continue with ${selected.length}`}
          {selected.length > 0 && <ArrowRight className="size-4" />}
        </PrimaryButton>
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
        <h2 className="text-balance font-serif text-[1.85rem] font-medium leading-tight tracking-tight">
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
