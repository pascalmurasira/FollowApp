'use client'

import { CalendarDays, QrCode, ScanLine, Users } from 'lucide-react'
import type { ConferenceSession, EncounterEventSummary } from '@/lib/encounters'

export function ConferenceModeCard({
  session,
  summary,
  onManage,
  onScan,
  onShowCard,
  onReview,
}: {
  session: ConferenceSession | null
  summary?: EncounterEventSummary
  onManage: () => void
  onScan: () => void
  onShowCard: () => void
  onReview: () => void
}) {
  if (!session && !summary) {
    return (
      <section className="glass-card flex items-center gap-3 rounded-3xl p-4 lg:col-span-12">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-[var(--ink-strong)]">
          <Users className="size-5" />
        </span>
        <button type="button" onClick={onManage} className="pressable min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold text-[var(--ink-strong)]">
            At a conference?
          </span>
          <span className="mt-0.5 block text-[12px] text-[var(--ink-secondary)]">
            Capture cards fast and review them together later.
          </span>
        </button>
        <button
          type="button"
          onClick={onManage}
          className="primary-action pressable min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold"
        >
          Start
        </button>
      </section>
    )
  }

  const active = session?.active === true
  const eventName = session?.name ?? summary?.event.name ?? 'Recent event'
  const count = summary?.count ?? 0
  return (
    <section className="glass-hero rounded-3xl p-4 lg:col-span-12">
      <div className="flex items-start gap-3">
        <span className="primary-action flex size-11 shrink-0 items-center justify-center rounded-2xl">
          <CalendarDays className="size-5" />
        </span>
        <button type="button" onClick={onManage} className="pressable min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--ink-strong)]">
              {eventName}
            </span>
            {active && (
              <span className="shrink-0 rounded-full bg-[var(--status-on-track-tint)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--status-on-track)]">
                Live
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[12px] text-[var(--ink-secondary)]">
            {count} {count === 1 ? 'person' : 'people'} · {summary?.pending ?? 0} need a clue · {summary?.clearNextSteps ?? 0} clear next steps
          </span>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={active ? onScan : onManage}
          className="primary-action pressable flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-semibold"
        >
          <ScanLine className="size-4" />
          {active ? 'Scan next' : 'New event'}
        </button>
        <button
          type="button"
          onClick={onShowCard}
          className="glass-button pressable flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-semibold text-[var(--ink-strong)]"
        >
          <QrCode className="size-4" />
          My QR
        </button>
        <button
          type="button"
          onClick={onReview}
          disabled={count === 0}
          className="glass-button pressable min-h-11 rounded-full px-2 text-[11px] font-semibold text-[var(--ink-strong)] disabled:opacity-40"
        >
          Review
        </button>
      </div>
    </section>
  )
}
