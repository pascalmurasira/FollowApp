'use client'

import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'
import { NudgeLogo } from '@/components/nudge-logo'

interface LandingIntroProps {
  onGetStarted: () => void
}

const followUps = [
  {
    initials: 'MC',
    name: 'Maya Chen',
    role: 'Partner · Northline',
    status: 'Priority',
    tone: 'bg-rose-100 text-rose-700',
  },
  {
    initials: 'DO',
    name: 'David Okafor',
    role: 'VP Engineering · Stripe',
    status: 'Due today',
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    initials: 'PN',
    name: 'Priya Nair',
    role: 'Founder · Loop',
    status: 'This week',
    tone: 'bg-slate-100 text-slate-600',
  },
]

const capabilities = [
  {
    icon: UserRoundCheck,
    label: 'Know who matters now',
    body: 'A focused queue ranked by relationship priority and time since your last touch.',
  },
  {
    icon: MessageSquareText,
    label: 'Start with the right words',
    body: 'A considered opener shaped by your context and communication style.',
  },
  {
    icon: ShieldCheck,
    label: 'Stay in control',
    body: 'Review every draft. Nothing is sent until you choose the channel and approve it.',
  },
]

export function LandingIntro({ onGetStarted }: LandingIntroProps) {
  return (
    <div className="app-field min-h-[100dvh]">
      <span className="field-grain" aria-hidden />
      <header className="relative z-[1] border-b border-[var(--hairline)] bg-white/15 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="primary-action flex size-8 items-center justify-center rounded-lg">
              <NudgeLogo className="size-[17px]" />
            </span>
            <span className="font-heading text-[17px] font-semibold tracking-tight text-[var(--ink-strong)]">
              FollowApp
            </span>
          </div>

          <nav className="hidden items-center gap-7 text-sm text-[var(--ink-secondary)] md:flex">
            <a href="#product" className="transition-colors hover:text-[var(--ink-strong)]">
              Product
            </a>
            <a href="#principles" className="transition-colors hover:text-[var(--ink-strong)]">
              Principles
            </a>
            <button
              type="button"
              onClick={onGetStarted}
              className="primary-action pressable rounded-lg px-4 py-2 font-medium"
            >
              Start setup
            </button>
          </nav>
        </div>
      </header>

      <main className="relative z-[1]">
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:py-28">
          <div>
            <div className="glass-button inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-secondary)]">
              <BriefcaseBusiness className="size-3.5 text-[var(--ink-strong)]" />
              Relationship intelligence for operators
            </div>

            <h1 className="mt-6 max-w-2xl text-balance font-heading text-[2.75rem] font-bold leading-[1.02] tracking-[-0.045em] text-[var(--ink-strong)] sm:text-[4rem]">
              Your network is an asset.
              <span className="block text-[var(--ink-secondary)]">Operate it like one.</span>
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-[var(--ink-secondary)]">
              FollowApp shows you who needs attention, drafts a thoughtful
              opener in your voice, and lets you send through the channels you
              already use.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onGetStarted}
                className="primary-action pressable group inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--r-button-lg)] px-5 text-sm font-semibold"
              >
                Open your follow-up list
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href="#product"
                className="glass-button pressable inline-flex min-h-12 items-center justify-center rounded-[var(--r-button-lg)] px-5 text-sm font-semibold text-[var(--ink-strong)]"
              >
                See how it works
              </a>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-secondary)]">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[var(--status-on-track)]" />
                No account required
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[var(--status-on-track)]" />
                Nothing auto-sent
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[var(--status-on-track)]" />
                Private by default
              </span>
            </div>
          </div>

          <ProductPreview />
        </section>

        <section className="border-y border-[var(--hairline)] bg-white/15 backdrop-blur">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-7 sm:grid-cols-[1fr_2fr] sm:px-8">
            <p className="text-sm font-semibold text-foreground">
              Built for people whose relationships compound.
            </p>
            <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm text-muted-foreground">
              <span>Founders</span>
              <span>Executives</span>
              <span>Investors</span>
              <span>Partnership leaders</span>
              <span>Recruiters</span>
            </div>
          </div>
        </section>

        <section
          id="product"
          className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-24"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              A disciplined follow-up system
            </p>
            <h2 className="mt-3 text-balance font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Less relationship admin. More meaningful contact.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              A deliberately small workflow that keeps judgment with you and
              removes the awkward work around it.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {capabilities.map(({ icon: Icon, label, body }, index) => (
              <article
                key={label}
                className="glass-card rounded-xl p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-6 font-heading text-lg font-semibold tracking-tight">
                  {label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="principles" className="bg-appbar text-appbar-foreground">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-appbar-foreground/55">
                Control is the product
              </p>
              <h2 className="mt-3 text-balance font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Designed for discretion, not engagement tricks.
              </h2>
            </div>

            <div className="grid gap-px overflow-hidden rounded-xl border border-appbar-foreground/10 bg-appbar-foreground/10 sm:grid-cols-2">
              <Principle
                icon={LockKeyhole}
                title="Private by default"
                body="Your data is scoped to this browser until you choose to secure it to an account."
              />
              <Principle
                icon={Clock3}
                title="Your timing"
                body="Snooze, reprioritize, or skip any relationship without feeding an algorithm."
              />
              <Principle
                icon={MessageSquareText}
                title="Your voice"
                body="Suggestions adapt to your tone and remain fully editable before sending."
              />
              <Principle
                icon={ShieldCheck}
                title="Your approval"
                body="FollowApp prepares the handoff. You make every final decision."
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="glass-hero grid items-center gap-8 rounded-2xl p-7 sm:p-10 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Start in under a minute
              </p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                Put your most important relationships back on the radar.
              </h2>
            </div>
            <button
              type="button"
              onClick={onGetStarted}
              className="primary-action pressable group inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--r-button-lg)] px-5 text-sm font-semibold"
            >
              Start setup — build my list
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[34rem]">
      <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-primary/[0.05]" />
      <div className="glass-hero overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Thursday, 2 July</p>
            <h2 className="mt-0.5 font-heading text-base font-semibold">
              Priority follow-ups
            </h2>
          </div>
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
            3 due
          </span>
        </div>

        <div className="divide-y divide-border">
          {followUps.map((person) => (
            <div key={person.name} className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-primary">
                {person.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {person.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {person.role}
                </span>
              </span>
              <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${person.tone}`}>
                {person.status}
              </span>
            </div>
          ))}
        </div>

        <div className="glass-card m-4 rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <span>Suggested opener</span>
            <span>Warm · concise</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground">
            Hi Maya — congratulations on the new fund. I’d love to hear what
            you’re most excited to build with the team this year.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="glass-button rounded-lg px-3 py-2 text-xs font-semibold">
              Edit
            </span>
            <span className="primary-action rounded-lg px-3 py-2 text-xs font-semibold">
              Review &amp; send
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Principle({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck
  title: string
  body: string
}) {
  return (
    <article className="bg-appbar/70 p-5 backdrop-blur-xl sm:p-6">
      <Icon className="size-5 text-appbar-foreground/65" />
      <h3 className="mt-5 font-heading text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-appbar-foreground/60">{body}</p>
    </article>
  )
}
