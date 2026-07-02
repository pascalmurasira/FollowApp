'use client'

import { useRef } from 'react'
import {
  ArrowRight,
  PlayCircle,
  Radar,
  Clock,
  PenLine,
  CheckCircle2,
  Rocket,
  Briefcase,
  TrendingUp,
  Handshake,
  UserSearch,
  Mail,
  Users,
  Calendar,
  Link2,
  Database,
  Lock,
  SlidersHorizontal,
  ShieldCheck,
} from 'lucide-react'
import { NudgeLogo } from '@/components/nudge-logo'
import { ShaderBackdrop } from '@/components/shader-backdrop'
import { cn } from '@/lib/utils'

interface LandingIntroProps {
  /** Advance into the guided setup (the people picker). */
  onGetStarted: () => void
}

/**
 * Marketing-grade landing / onboarding entry for FollowApp. A single scrollable
 * surface: hero → who it's for → how it works → where it connects → trust →
 * live product previews → closing CTA. Executive, credible tone throughout.
 * Motion is limited to the existing `animate-rise` reveal; the ambient hero
 * shader already honours reduced-motion.
 */
export function LandingIntro({ onGetStarted }: LandingIntroProps) {
  const demoRef = useRef<HTMLElement>(null)

  const scrollToDemo = () => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    demoRef.current?.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <div className="mx-auto w-full max-w-md bg-background">
      {/* Brand bar */}
      <header className="flex items-center justify-center gap-2 bg-appbar px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-appbar-foreground">
        <NudgeLogo className="size-[20px]" />
        <span className="font-heading text-lg font-semibold tracking-tight">
          FollowApp
        </span>
      </header>

      {/* ---------------------------------------------------------------- HERO */}
      <section className="relative isolate overflow-hidden px-6 pt-12 pb-14 text-center">
        <ShaderBackdrop
          variant="hero"
          className="-z-10 opacity-90 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]"
        />

        <div className="animate-rise flex justify-center">
          <div className="flex size-[4.25rem] items-center justify-center rounded-[1.5rem] bg-primary text-primary-foreground shadow-card-lg">
            <NudgeLogo className="size-9" />
          </div>
        </div>

        <h1
          className="animate-rise mt-8 text-balance font-serif text-[2.5rem] font-medium leading-[1.05] tracking-tight"
          style={{ animationDelay: '0.08s' }}
        >
          Keep your professional
          <br />
          relationships warm.
        </h1>

        <p
          className="animate-rise mx-auto mt-4 max-w-[21rem] text-pretty leading-relaxed text-muted-foreground"
          style={{ animationDelay: '0.16s' }}
        >
          FollowApp helps professionals decide who to contact, when to reach
          out, and what to say — with full review before anything is sent.
        </p>

        <div
          className="animate-rise mt-8 flex flex-col gap-3"
          style={{ animationDelay: '0.24s' }}
        >
          <button
            type="button"
            onClick={onGetStarted}
            className="group flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-foreground shadow-card transition-all duration-200 active:scale-[0.98]"
          >
            See my follow-up list
            <ArrowRight className="size-4 transition-transform duration-200 group-active:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={scrollToDemo}
            className="flex min-h-13 w-full items-center justify-center gap-2 rounded-full border border-border bg-card font-medium text-foreground shadow-card transition-all duration-200 active:scale-[0.98]"
          >
            <PlayCircle className="size-[18px] text-primary" />
            Watch 2-minute demo
          </button>
        </div>

        <p
          className="animate-rise mt-3 text-xs leading-relaxed text-muted-foreground"
          style={{ animationDelay: '0.3s' }}
        >
          No account needed.
        </p>
      </section>

      {/* -------------------------------------------------------- WHO IT'S FOR */}
      <Section
        eyebrow="Built for operators"
        title="Made for people with a network to protect"
        blurb="FollowApp is built for professionals whose relationships compound over time."
      >
        <ul className="grid grid-cols-2 gap-3">
          {AUDIENCE.map((a) => {
            const Icon = a.icon
            return (
              <li
                key={a.label}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-card"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-[18px]" />
                </span>
                <span className="text-[0.875rem] font-medium leading-tight text-foreground">
                  {a.label}
                </span>
              </li>
            )
          })}
        </ul>
      </Section>

      {/* -------------------------------------------------------- HOW IT WORKS */}
      <Section
        eyebrow="How it works"
        title="From a busy network to timely outreach"
        blurb="Four considered steps — with you in command of the final word."
      >
        <ol className="space-y-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <li
                key={s.title}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" />
                  <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground shadow-card">
                    {i + 1}
                  </span>
                </span>
                <span className="flex flex-col">
                  <span className="text-[0.9375rem] font-semibold leading-snug text-foreground">
                    {s.title}
                  </span>
                  <span className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                    {s.body}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>

        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
          <ShieldCheck className="size-[18px] shrink-0 text-primary" />
          <p className="text-[0.8125rem] font-medium leading-relaxed text-foreground">
            Nothing is auto-sent. Every message waits for your approval.
          </p>
        </div>
      </Section>

      {/* ----------------------------------------------------- WHERE IT CONNECTS */}
      <Section
        eyebrow="Where it connects"
        title="Fits the tools you already run on"
        blurb="FollowApp works alongside your existing stack to keep outreach in one place."
      >
        <ul className="grid grid-cols-2 gap-3">
          {CHANNELS.map((c) => {
            const Icon = c.icon
            return (
              <li
                key={c.label}
                className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-[18px]" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[0.875rem] font-semibold leading-tight text-foreground">
                    {c.label}
                  </span>
                  <span className="mt-0.5 text-[0.75rem] leading-snug text-muted-foreground">
                    {c.note}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </Section>

      {/* -------------------------------------------------------------- TRUST */}
      <Section
        eyebrow="Why professionals trust it"
        title="Discretion, by design"
        blurb="Your strategic network is sensitive. FollowApp treats it that way."
      >
        <ul className="space-y-3">
          {TRUST.map((t) => {
            const Icon = t.icon
            return (
              <li
                key={t.title}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[0.9375rem] font-semibold leading-snug text-foreground">
                    {t.title}
                  </span>
                  <span className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                    {t.body}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </Section>

      {/* --------------------------------------------------------- PRODUCT DEMO */}
      <section ref={demoRef} className="scroll-mt-4 px-6 py-12">
        <SectionHeader
          eyebrow="A look inside"
          title="See trusted follow-up in action"
          blurb="Three moments from a typical FollowApp session."
        />
        <div className="mt-8 space-y-8">
          <DemoFrame label="The ranked follow-up list">
            <RankedListPreview />
          </DemoFrame>
          <DemoFrame label="A draft in your voice — fully editable">
            <DraftPreview />
          </DemoFrame>
          <DemoFrame label="The contact profile">
            <ProfilePreview />
          </DemoFrame>
        </div>
      </section>

      {/* --------------------------------------------------------- CLOSING CTA */}
      <section className="px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="relative isolate overflow-hidden rounded-3xl border border-border bg-card p-7 text-center shadow-card-lg">
          <ShaderBackdrop
            variant="hero"
            className="-z-10 opacity-80 [mask-image:radial-gradient(120%_100%_at_50%_0%,black,transparent_75%)]"
          />
          <h2 className="text-balance font-serif text-2xl font-medium leading-tight tracking-tight">
            Your strategic network, kept warm.
          </h2>
          <p className="mx-auto mt-2.5 max-w-[20rem] text-pretty text-sm leading-relaxed text-muted-foreground">
            Set up your follow-up list in about a minute. You approve every
            message before it goes out.
          </p>
          <button
            type="button"
            onClick={onGetStarted}
            className="group mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-foreground shadow-card transition-all duration-200 active:scale-[0.98]"
          >
            See my follow-up list
            <ArrowRight className="size-4 transition-transform duration-200 group-active:translate-x-0.5" />
          </button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            No account needed.
          </p>
        </div>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Section scaffolding                                                         */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string
  title: string
  blurb: string
}) {
  return (
    <div className="text-center">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </span>
      <h2 className="mt-2 text-balance font-serif text-[1.65rem] font-medium leading-tight tracking-tight">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-[22rem] text-pretty text-sm leading-relaxed text-muted-foreground">
        {blurb}
      </p>
    </div>
  )
}

function Section({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow: string
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="px-6 py-8">
      <SectionHeader eyebrow={eyebrow} title={title} blurb={blurb} />
      <div className="mt-6">{children}</div>
    </section>
  )
}

/* A framed, captioned device-style preview for the demo section. */
function DemoFrame({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <figure>
      <div className="overflow-hidden rounded-3xl border border-border bg-chat-bg p-4 shadow-card-lg">
        {children}
      </div>
      <figcaption className="mt-3 text-center text-[0.8125rem] font-medium text-muted-foreground">
        {label}
      </figcaption>
    </figure>
  )
}

/* -------------------------------------------------------------------------- */
/* Mock UI previews (illustrative, non-interactive)                           */
/* -------------------------------------------------------------------------- */

function MockAvatar({
  initials,
  className,
}: {
  initials: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      {initials}
    </span>
  )
}

function RankedListPreview() {
  return (
    <div className="rounded-2xl bg-card p-3.5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          Follow-up list
        </span>
        <span className="text-[0.6875rem] font-medium text-muted-foreground">
          Ranked by importance
        </span>
      </div>
      <ul className="space-y-2.5">
        {RANKED.map((r) => (
          <li key={r.name} className="flex items-center gap-3">
            <MockAvatar initials={r.initials} className={r.color} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.8125rem] font-medium text-foreground">
                {r.name}
              </span>
              <span className="truncate text-[0.6875rem] text-muted-foreground">
                {r.reason}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold',
                r.tone,
              )}
            >
              {r.tag}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DraftPreview() {
  return (
    <div className="rounded-2xl bg-card p-3.5 shadow-card">
      <div className="mb-3 flex items-center gap-2.5">
        <MockAvatar initials="MC" className="bg-primary" />
        <span className="flex flex-col">
          <span className="text-[0.8125rem] font-medium text-foreground">
            Maya Chen
          </span>
          <span className="text-[0.6875rem] text-muted-foreground">
            Draft ready to review
          </span>
        </span>
      </div>

      <div className="rounded-2xl rounded-tl-md bg-bubble-in px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-bubble-in-foreground">
        Hi Maya — I saw the funding news, congratulations. Would love to catch up
        properly next time I&apos;m in town. How&apos;s the new team settling in?
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {['Warm', 'Brief', 'Formal'].map((t) => (
          <span
            key={t}
            className={cn(
              'rounded-full px-2.5 py-1 text-[0.6875rem] font-medium',
              t === 'Warm'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground',
            )}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card py-2 text-[0.75rem] font-medium text-foreground">
          <PenLine className="size-3.5" />
          Edit
        </span>
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary py-2 text-[0.75rem] font-medium text-primary-foreground">
          <CheckCircle2 className="size-3.5" />
          Approve &amp; send
        </span>
      </div>

      <p className="mt-2.5 text-center text-[0.6875rem] text-muted-foreground">
        Nothing is sent until you approve.
      </p>
    </div>
  )
}

function ProfilePreview() {
  return (
    <div className="rounded-2xl bg-card p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <MockAvatar initials="DO" className="size-12 bg-accent text-base" />
        <span className="flex flex-col">
          <span className="text-[0.9375rem] font-semibold text-foreground">
            David Okafor
          </span>
          <span className="text-[0.75rem] text-muted-foreground">
            VP Partnerships · Stripe
          </span>
        </span>
      </div>
      <dl className="mt-4 space-y-2.5">
        {PROFILE_ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className="text-[0.75rem] text-muted-foreground">{row.label}</dt>
            <dd className="text-[0.8125rem] font-medium text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

const AUDIENCE = [
  { label: 'Founders', icon: Rocket },
  { label: 'Executives', icon: Briefcase },
  { label: 'Investors', icon: TrendingUp },
  { label: 'Partnership leads', icon: Handshake },
  { label: 'Recruiters', icon: UserSearch },
] as const

const STEPS = [
  {
    icon: Radar,
    title: 'Rank contacts by importance',
    body: 'FollowApp surfaces who matters most to your goals and orders your list accordingly.',
  },
  {
    icon: Clock,
    title: 'Suggest the right timing',
    body: 'It flags when a relationship is going cold, so outreach lands when it counts.',
  },
  {
    icon: PenLine,
    title: 'Draft the message in your voice',
    body: 'A considered, ready opener that sounds like you — never a blank page.',
  },
  {
    icon: CheckCircle2,
    title: 'Approve and send',
    body: 'You review and edit every draft. Nothing leaves without your explicit approval.',
  },
] as const

const CHANNELS = [
  { label: 'Email', icon: Mail, note: 'Send and track from your inbox.' },
  { label: 'Contacts', icon: Users, note: 'Bring your address book in.' },
  { label: 'Calendar', icon: Calendar, note: 'Time outreach around meetings.' },
  { label: 'LinkedIn notes', icon: Link2, note: 'Keep relationship context.' },
  { label: 'CRM', icon: Database, note: 'Stay in sync with your pipeline.' },
] as const

const TRUST = [
  {
    icon: Lock,
    title: 'Private by default',
    body: 'Your contacts and notes stay yours. FollowApp keeps your network confidential.',
  },
  {
    icon: ShieldCheck,
    title: 'User-approved sends',
    body: 'Drafts are always editable, and nothing is ever sent automatically on your behalf.',
  },
  {
    icon: SlidersHorizontal,
    title: 'You stay in control',
    body: 'Snooze anyone, skip a suggestion, or adjust cadence whenever you like.',
  },
] as const

const RANKED = [
  {
    name: 'Maya Chen',
    initials: 'MC',
    reason: 'Key investor · cooling off',
    tag: 'High',
    color: 'bg-primary',
    tone: 'bg-health-late/15 text-health-late',
  },
  {
    name: 'David Okafor',
    initials: 'DO',
    reason: 'Partnership lead · due this week',
    tag: 'Timely',
    color: 'bg-accent',
    tone: 'bg-health-warn/15 text-health-warn',
  },
  {
    name: 'Priya Nair',
    initials: 'PN',
    reason: 'Warm intro · keep steady',
    tag: 'Steady',
    color: 'bg-primary/70',
    tone: 'bg-health-good/15 text-health-good',
  },
] as const

const PROFILE_ROWS = [
  { label: 'Last contacted', value: '6 weeks ago' },
  { label: 'Relationship', value: 'Cooling' },
  { label: 'Next nudge', value: 'Suggested today' },
] as const
