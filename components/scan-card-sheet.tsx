'use client'

import { useRef, useState } from 'react'
import {
  X,
  Camera,
  Loader2,
  UserPlus,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Plus,
  Check,
  CalendarDays,
  Search,
  ShieldCheck,
  Settings,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import type { NewContactInput } from '@/lib/contacts-store'
import type { EnrichmentHook, Tier } from '@/lib/types'
import { saveToPhone } from '@/lib/card'
import {
  captureImageDataUrl,
  chooseImageDataUrl,
  isNativePermissionDeniedError,
  isNativeUserCancelError,
  openAppSettings,
  tapFeedback,
} from '@/lib/native'
import { todayDateInputValue } from '@/lib/contact-dates'
import { cn } from '@/lib/utils'

interface ScannedCard {
  name: string
  title: string
  company: string
  phone: string
  email: string
  website: string
}

interface ContextNote {
  id: string
  text: string
  source: string
  accepted: boolean
}

type ContextStatus = 'idle' | 'loading' | 'done' | 'empty' | 'error'
type CameraPermissionHelp = null | 'blocked' | 'unavailable'

const EMPTY: ScannedCard = {
  name: '',
  title: '',
  company: '',
  phone: '',
  email: '',
  website: '',
}

const TIER_OPTIONS: { value: Tier; label: string; hint: string; cta: string }[] = [
  {
    value: 'key',
    label: 'Every 2 weeks',
    hint: 'high-value contact',
    cta: 'first follow-up tomorrow',
  },
  {
    value: 'network',
    label: 'Monthly',
    hint: 'regular relationship',
    cta: 'first follow-up tomorrow',
  },
  {
    value: 'casual',
    label: 'Quarterly',
    hint: 'light keep-warm',
    cta: 'first follow-up tomorrow',
  },
]

type Stage = 'capture' | 'reading' | 'review' | 'added'

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatFollowUpPhrase(date: Date): string {
  const tomorrow = addDays(new Date(), 1)
  if (date.toDateString() === tomorrow.toDateString()) return 'tomorrow'
  return formatDateShort(date)
}

/**
 * Downscale a captured photo to a JPEG data URL no wider/taller than `max`,
 * keeping the upload small and fast (and under the API's size cap).
 */
async function downscale(file: File, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return canvas.toDataURL('image/jpeg', 0.85)
}

async function normalizeDataUrl(dataUrl: string, max = 1600): Promise<string> {
  const image = new Image()
  image.decoding = 'async'
  image.src = dataUrl
  await image.decode()

  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
  const w = Math.max(1, Math.round(image.naturalWidth * scale))
  const h = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(image, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 8
}

export function ScanCardSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (input: NewContactInput) => void
}) {
  const [stage, setStage] = useState<Stage>('capture')
  const [card, setCard] = useState<ScannedCard>(EMPTY)
  const [tier, setTier] = useState<Tier>('network')
  const [lastContactedAt, setLastContactedAt] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedToPhone, setSavedToPhone] = useState(false)
  const [contextStatus, setContextStatus] = useState<ContextStatus>('idle')
  const [contextNotes, setContextNotes] = useState<ContextNote[]>([])
  const [cameraHelp, setCameraHelp] = useState<CameraPermissionHelp>(null)
  const [isOpeningCamera, setIsOpeningCamera] = useState(false)
  const [showScanDetails, setShowScanDetails] = useState(false)
  const [followUpDate, setFollowUpDate] = useState<Date>(() =>
    addDays(new Date(), 1),
  )
  const [showDateRoller, setShowDateRoller] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const reset = () => {
    setStage('capture')
    setCard(EMPTY)
    setTier('network')
    setLastContactedAt('')
    setNote('')
    setError(null)
    setSavedToPhone(false)
    setContextStatus('idle')
    setContextNotes([])
    setCameraHelp(null)
    setIsOpeningCamera(false)
    setShowScanDetails(false)
    setFollowUpDate(addDays(new Date(), 1))
    setShowDateRoller(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const close = () => {
    reset()
    onClose()
  }

  const findContext = async (scanned: ScannedCard) => {
    if (!scanned.name.trim()) {
      setContextStatus('empty')
      return
    }

    setContextStatus('loading')
    setContextNotes([])
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scanned.name,
          title: [scanned.title, scanned.company].filter(Boolean).join(' · '),
          company: scanned.company,
          relationship: scanned.company
            ? `Met through ${scanned.company}`
            : 'New connection from a business card',
        }),
      })
      const data = (await res.json()) as {
        hooks?: EnrichmentHook[]
        status?: 'ok' | 'unavailable'
      }

      const hooks = data.status === 'ok' ? data.hooks ?? [] : []
      const notes: ContextNote[] = hooks.map((hook, index) => ({
        id: `${hook.kind}-${index}`,
        text: hook.text,
        source: hook.source ?? 'public source',
        accepted: false,
      }))

      if (scanned.website) {
        notes.push({
          id: 'card-website',
          text: `Website on card: ${scanned.website}`,
          source: 'business card',
          accepted: false,
        })
      }

      setContextNotes(notes)
      setContextStatus(notes.length > 0 ? 'done' : 'empty')
    } catch (err) {
      console.error('[v0] Context lookup failed:', err)
      setContextStatus('error')
    }
  }

  const readCardImage = async (image: string) => {
    setError(null)
    setStage('reading')
    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      })
      const data = (await res.json()) as Partial<ScannedCard> & { status?: string }

      if (data.status !== 'ok') {
        // Rate-limited or failed: drop into manual review, never a dead end.
        setError("Couldn't read that one — add the details by hand.")
        setCard(EMPTY)
        setStage('review')
        setContextStatus('empty')
        return
      }

      const scanned: ScannedCard = {
        name: data.name ?? '',
        title: data.title ?? '',
        company: data.company ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        website: data.website ?? '',
      }
      setCard(scanned)
      setNote('')
      if (!scanned.name && !scanned.company) {
        setError("Couldn't read much — check the details below.")
      }
      setStage('review')
      void findContext(scanned)
    } catch (err) {
      console.error('[v0] Card capture failed:', err)
      setError("Something went wrong reading the photo — add the details by hand.")
      setCard(EMPTY)
      setStage('review')
      setContextStatus('empty')
    }
  }

  const handleNativeCamera = async () => {
    setError(null)
    setCameraHelp(null)
    const native = Capacitor.isNativePlatform()
    if (!native) {
      // Browser/iOS Safari requires the file picker to be opened directly from
      // the user's tap. If we await the native-camera checks first, the browser
      // can treat it as no longer user-initiated and silently block it.
      fileRef.current?.click()
      return
    }

    setIsOpeningCamera(true)
    void tapFeedback()
    try {
      const image = await captureImageDataUrl()
      if (!image) {
        fileRef.current?.click()
        return
      }
      await readCardImage(await normalizeDataUrl(image))
    } catch (err) {
      if (isNativePermissionDeniedError(err)) {
        setCameraHelp('blocked')
        setStage('capture')
      } else if (!isNativeUserCancelError(err)) {
        console.error('[v0] Native card capture failed:', err)
        setError('Camera did not open. Try again, or choose a photo instead.')
        setCameraHelp('unavailable')
        setStage('capture')
      }
    } finally {
      setIsOpeningCamera(false)
    }
  }

  const handleChoosePhoto = async () => {
    setError(null)
    setCameraHelp(null)
    const native = Capacitor.isNativePlatform()
    if (!native) {
      fileRef.current?.click()
      return
    }

    await tapFeedback()
    try {
      const image = await chooseImageDataUrl()
      if (!image) {
        fileRef.current?.click()
        return
      }
      await readCardImage(await normalizeDataUrl(image))
    } catch (err) {
      const error = err as { message?: string }
      const message = error?.message?.toLowerCase() ?? ''
      const cancelled =
        message.includes('cancel') ||
        message.includes('user denied') ||
        message.includes('user cancelled')
      if (!cancelled) {
        console.error('[v0] Native photo choose failed:', err)
        setError('Could not open Photos. You can still enter the details by hand.')
        setStage('capture')
      }
    }
  }

  const handleOpenSettings = async () => {
    await tapFeedback()
    await openAppSettings()
  }

  const handleManualEntry = async () => {
    await tapFeedback()
    setError(null)
    setCameraHelp(null)
    setCard(EMPTY)
    setNote('')
    setContextStatus('empty')
    setStage('review')
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await readCardImage(await downscale(file))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const update = (key: keyof ScannedCard, value: string) =>
    setCard((prev) => ({ ...prev, [key]: value }))

  const toggleContext = (id: string) => {
    setContextNotes((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, accepted: !item.accepted } : item,
      ),
    )
  }

  const submit = () => {
    if (!card.name.trim()) return
    const titleAndCompany = [card.title, card.company].filter(Boolean).join(' · ')
    const relationship =
      card.company.trim() || card.title.trim()
        ? `Met ${card.company ? `at ${card.company}` : 'through work'}`
        : 'New connection'
    const acceptedNotes = contextNotes.filter((item) => item.accepted)
    const contextParts = [
      note.trim(),
      ...acceptedNotes.map((item) => `${item.text} (${item.source})`),
      `First follow-up: ${formatDateShort(followUpDate)}`,
    ].filter(Boolean)
    onAdd({
      name: card.name,
      relationship,
      title: titleAndCompany || undefined,
      tier,
      lastContactedAt: lastContactedAt || null,
      phone: card.phone || undefined,
      email: card.email || undefined,
      context: contextParts.join('\n') || undefined,
      interests: [],
    })
    setStage('added')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div className="app-field relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] shadow-xl">
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div>
            <h2 className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]">
              {stage === 'review' ? 'Confirm contact' : 'Scan a business card'}
            </h2>
            {stage === 'review' && (
              <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
                Parsed from card · check anything uncertain
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="glass-button pressable flex size-11 items-center justify-center rounded-full text-[var(--ink-secondary)]"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* Hidden file input — opens the camera on iOS via capture="environment". */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="sr-only"
        />

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {stage === 'capture' && (
            <div className="flex flex-col items-center gap-5 py-2 text-center">
              <div className="glass-hero w-full p-4">
                <div className="relative mx-auto flex h-[170px] max-w-[18rem] items-center justify-center overflow-hidden rounded-[14px] bg-[oklch(0.24_0.03_255)] text-white shadow-inner">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,oklch(0_0_0_/_0.42))]" />
                  <div className="absolute left-8 top-8 size-8 border-l-2 border-t-2 border-white/75" />
                  <div className="absolute right-8 top-8 size-8 border-r-2 border-t-2 border-white/75" />
                  <div className="absolute bottom-8 left-8 size-8 border-b-2 border-l-2 border-white/75" />
                  <div className="absolute bottom-8 right-8 size-8 border-b-2 border-r-2 border-white/75" />
                  <div className="absolute h-px w-4/5 animate-[nudge-sheen_2.6s_ease-in-out_infinite] bg-white/55 shadow-[0_0_18px_white]" />
                  <div className="relative h-20 w-36 rotate-[-4deg] rounded-xl bg-white/90 p-3 text-left text-slate-700 shadow-2xl">
                    <div className="h-2 w-20 rounded-full bg-slate-700/80" />
                    <div className="mt-3 h-1.5 w-24 rounded-full bg-slate-400" />
                    <div className="mt-1.5 h-1.5 w-16 rounded-full bg-slate-300" />
                  </div>
                </div>
                <p className="mt-3 text-[14px] font-semibold text-[var(--ink-strong)]">
                  Align the card inside the frame
                </p>
              </div>

              <p className="max-w-[18rem] text-pretty text-[15px] font-semibold leading-relaxed text-[var(--ink-strong)]">
                We’ll read the card. You approve before saving.
              </p>

              {cameraHelp ? (
                <CameraPermissionCard
                  kind={cameraHelp}
                  onRetryCamera={handleNativeCamera}
                  onOpenSettings={handleOpenSettings}
                  onChoosePhoto={handleChoosePhoto}
                />
              ) : error ? (
                <p className="w-full rounded-xl border border-[var(--hairline)] bg-white/30 px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink-secondary)] text-pretty">
                  {error}
                </p>
              ) : null}

              {cameraHelp !== 'blocked' && cameraHelp !== 'unavailable' && (
                <div className="flex w-full flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleNativeCamera}
                    disabled={isOpeningCamera}
                    aria-busy={isOpeningCamera}
                    className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold"
                  >
                    {isOpeningCamera ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                    {isOpeningCamera ? 'Opening camera…' : 'Open camera'}
                  </button>
                  <button
                    type="button"
                    onClick={handleChoosePhoto}
                    className="glass-button pressable min-h-11 w-full rounded-full text-sm font-semibold text-[var(--ink-strong)]"
                  >
                    Choose photo
                  </button>
                </div>
              )}

              <div className="flex w-full flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualEntry}
                  className="pressable min-h-11 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-secondary)]"
                >
                  Enter manually
                </button>
                {!cameraHelp && (
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setShowScanDetails((value) => !value)}
                      aria-expanded={showScanDetails}
                      className="pressable mx-auto flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[12px] font-semibold text-[var(--ink-tertiary)]"
                    >
                      <ShieldCheck className="size-3.5" />
                      Why we ask
                    </button>
                    {showScanDetails && (
                      <p className="rounded-2xl border border-[var(--hairline)] bg-white/20 px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-secondary)] text-pretty">
                        Camera opens only when you tap. The card is read so you
                        can approve every field before anything is saved.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {stage === 'reading' && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Loader2 className="size-7 animate-spin text-[var(--ink-strong)]" />
              <p className="text-[14px] font-medium text-[var(--ink-strong)]">
                Reading the card…
              </p>
              <p className="text-[12px] text-[var(--ink-secondary)]">
                Pulling out the details. This can take a moment.
              </p>
            </div>
          )}

          {stage === 'added' && (
            <div className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
                <UserPlus className="size-7" />
              </div>
              <div>
                <p className="text-lg font-semibold text-[var(--ink-strong)]">
                  {card.name.trim()} is in FollowApp
                </p>
                <p className="mt-1 text-pretty text-sm text-[var(--ink-secondary)]">
                  We’ll use the card details to draft a warmer first follow-up.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="primary-action pressable mt-2 flex min-h-12 w-full items-center justify-center rounded-full px-4 text-[15px] font-semibold"
              >
                Done — view follow-ups
              </button>
              <button
                type="button"
                onClick={reset}
                className="glass-button pressable min-h-11 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)]"
              >
                Scan another card
              </button>
            </div>
          )}

          {stage === 'review' && (
            <div className="flex flex-col gap-4">
              {error && (
                <p className="rounded-xl border border-[var(--hairline)] bg-white/20 px-3 py-2.5 text-[13px] text-[var(--ink-secondary)] text-pretty">
                  {error}
                </p>
              )}

              <ParsedSummary
                card={card}
                onUpdate={update}
              />

              <ContextNotesCard
                status={contextStatus}
                notes={contextNotes}
                manualNote={note}
                onManualNoteChange={setNote}
                onToggle={toggleContext}
              />

              <section className="glass-card rounded-3xl p-4">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-tertiary)]">
                    Last spoke or met
                  </span>
                  <div className="relative mt-2">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-tertiary)]" />
                    <input
                      type="date"
                      value={lastContactedAt}
                      max={todayDateInputValue()}
                      onChange={(event) => setLastContactedAt(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-[var(--hairline)] bg-white/25 pl-10 pr-4 text-base text-[var(--ink-body)] outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                    />
                  </div>
                  <span className="mt-1.5 block text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                    Leave blank if this is a brand-new contact. They will show
                    as due now.
                  </span>
                </label>

                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-tertiary)]">
                    Stay in touch
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {TIER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTier(opt.value)}
                        className={cn(
                          'pressable min-h-11 rounded-2xl border px-2 text-xs font-semibold transition-all',
                          tier === opt.value
                            ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)] shadow-card'
                            : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleNativeCamera}
                  className="pressable flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[var(--ink-secondary)]"
                >
                  <RotateCcw className="size-3.5" />
                  Rescan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!card.name.trim()) return
                    saveToPhone({
                      n: card.name,
                      t: card.title || undefined,
                      co: card.company || undefined,
                      p: card.phone || undefined,
                      e: card.email || undefined,
                    })
                    setSavedToPhone(true)
                  }}
                  disabled={!card.name.trim()}
                  className="pressable flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[var(--ink-secondary)] disabled:opacity-40"
                >
                  <Smartphone className="size-3.5" />
                  {savedToPhone ? 'Opened Contacts' : 'Save to phone'}
                </button>
              </div>
            </div>
          )}
        </div>

        {stage === 'review' && (
          <footer className="relative z-[1] border-t border-[var(--hairline)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
            <button
              type="button"
              onClick={submit}
              disabled={!card.name.trim()}
              className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-40"
            >
              <Check className="size-4" />
              <span>
                Save with {contextNotes.filter((item) => item.accepted).length}{' '}
                context{' '}
                {contextNotes.filter((item) => item.accepted).length === 1
                  ? 'note'
                  : 'notes'}{' '}
                · follow up{' '}
                <span
                  role="button"
                  tabIndex={0}
                  className="underline decoration-white/50 underline-offset-2"
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowDateRoller(true)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      setShowDateRoller(true)
                    }
                  }}
                >
                  {formatFollowUpPhrase(followUpDate)}
                </span>
              </span>
            </button>
          </footer>
        )}

        {showDateRoller && (
          <FollowUpDateRoller
            value={followUpDate}
            tier={tier}
            onSelect={setFollowUpDate}
            onClose={() => setShowDateRoller(false)}
          />
        )}
      </div>
    </div>
  )
}

function CameraPermissionCard({
  kind,
  onRetryCamera,
  onOpenSettings,
  onChoosePhoto,
}: {
  kind: Exclude<CameraPermissionHelp, null>
  onRetryCamera: () => void
  onOpenSettings: () => void
  onChoosePhoto: () => void
}) {
  const blocked = kind === 'blocked'
  const unavailable = kind === 'unavailable'
  return (
    <section className="glass-card w-full rounded-3xl p-4 text-left">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
          {blocked ? (
            <Settings className="size-5" />
          ) : unavailable ? (
            <Camera className="size-5" />
          ) : (
            <ShieldCheck className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[16px] font-semibold leading-tight text-[var(--ink-strong)]">
            {blocked
              ? 'Camera is off'
              : 'Camera did not open'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-secondary)] text-pretty">
            {blocked
              ? 'Turn it on once, or choose a saved card photo.'
              : 'Try again, or choose a saved card photo.'}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={blocked ? onOpenSettings : onRetryCamera}
          className="primary-action pressable flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-button)] px-4 text-sm font-semibold"
        >
          {blocked ? (
            <Settings className="size-4" />
          ) : (
            <Camera className="size-4" />
          )}
          {blocked ? 'Turn on camera' : 'Try camera again'}
        </button>
        <button
          type="button"
          onClick={onChoosePhoto}
          className="glass-button pressable flex min-h-11 items-center justify-center rounded-[var(--r-button)] px-4 text-sm font-semibold text-[var(--ink-strong)]"
        >
          Choose photo
        </button>
      </div>
    </section>
  )
}

function ParsedSummary({
  card,
  onUpdate,
}: {
  card: ScannedCard
  onUpdate: (key: keyof ScannedCard, value: string) => void
}) {
  const nameRole = [
    card.name,
    [card.title, card.company].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' · ')
  const contactLine = [card.phone, card.email].filter(Boolean).join(' · ')
  const nameRoleSure = card.name.trim() && (card.title.trim() || card.company.trim())
  const contactSure =
    (!card.phone.trim() || looksLikePhone(card.phone)) &&
    (!card.email.trim() || looksLikeEmail(card.email)) &&
    (card.phone.trim() || card.email.trim())

  return (
    <section className="glass-hero overflow-hidden rounded-3xl px-4 py-0">
      <EditableSummaryRow
        label="Name · Role"
        value={nameRole}
        placeholder="Daniel Okafor · VP Partnerships, Northbeam"
        sure={!!nameRoleSure}
        onChange={(value) => {
          const [name, roleCompany = ''] = value.split(' · ')
          const [title, ...companyParts] = roleCompany.split(',')
          onUpdate('name', name?.trim() ?? '')
          onUpdate('title', title?.trim() ?? '')
          onUpdate('company', companyParts.join(',').trim())
        }}
      />
      <EditableSummaryRow
        label="Mobile · Email"
        value={contactLine}
        placeholder="+1 (415) 555-0182 · d.okafor@northbeam.com"
        sure={!!contactSure}
        onChange={(value) => {
          const parts = value.split(' · ')
          const phone = parts.find((part) => /[+\d().\-\s]{7,}/.test(part)) ?? ''
          const email = parts.find((part) => part.includes('@')) ?? ''
          onUpdate('phone', phone.trim())
          onUpdate('email', email.trim())
        }}
      />
    </section>
  )
}

function EditableSummaryRow({
  label,
  value,
  placeholder,
  sure,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  sure: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--hairline)] py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--ink-tertiary)]">
          {label}
        </span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1 h-7 w-full min-w-0 bg-transparent font-heading text-[15px] font-semibold tracking-[-0.012em] text-[var(--ink-strong)] outline-none placeholder:text-[var(--ink-tertiary)]/45"
        />
      </span>
      <ConfidenceBadge sure={sure} />
    </label>
  )
}

function ConfidenceBadge({ sure }: { sure: boolean }) {
  if (sure) {
    return (
      <span className="mt-1 flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
        <CheckCircle2 className="size-4" />
      </span>
    )
  }

  return (
    <span className="mt-1 flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-[var(--status-check-tint)] px-2.5 text-[11.5px] font-semibold text-[var(--status-due-soon)]" style={{ borderColor: 'var(--status-check-border)' }}>
      <AlertCircle className="size-3.5" />
      Check
    </span>
  )
}

function ContextNotesCard({
  status,
  notes,
  manualNote,
  onManualNoteChange,
  onToggle,
}: {
  status: ContextStatus
  notes: ContextNote[]
  manualNote: string
  onManualNoteChange: (value: string) => void
  onToggle: (id: string) => void
}) {
  const showManual = status === 'empty' || status === 'error'
  return (
    <section className="glass-card rounded-3xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
          Found context · tap to save with contact
        </p>
        {status === 'loading' && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-tertiary)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--ink-tertiary)]" />
            searching
          </span>
        )}
      </div>

      {status === 'loading' && (
        <div className="mt-3 space-y-2">
          <div className="min-h-11 animate-pulse rounded-[11px] border border-dashed border-[var(--hairline)] bg-white/20" />
          <div className="min-h-11 animate-pulse rounded-[11px] border border-dashed border-[var(--hairline)] bg-white/15 [animation-delay:-0.45s]" />
          <p className="text-[11.5px] leading-relaxed text-[var(--ink-secondary)]">
            Public sources only. You can keep reviewing the card while this runs.
          </p>
        </div>
      )}

      {status === 'done' && notes.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {notes.map((note) => (
            <ContextChip key={note.id} note={note} onToggle={onToggle} />
          ))}
          <p className="text-[11.5px] leading-relaxed text-[var(--ink-secondary)]">
            Only selected notes are saved with this contact.
          </p>
        </div>
      )}

      {showManual && (
        <div className="mt-3">
          <div className="flex items-start gap-2 rounded-2xl border border-[var(--hairline)] bg-white/20 px-3 py-3 text-[13px] leading-relaxed text-[var(--ink-secondary)]">
            <Search className="mt-0.5 size-4 shrink-0" />
            <span>
              {status === 'error'
                ? "Context lookup isn't available right now. Your own note is enough."
                : 'No public context found — small companies often have none. Your memory is the best source right now.'}
            </span>
          </div>
          <label className="mt-3 block">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
              What will you want to remember
            </span>
            <textarea
              value={manualNote}
              onChange={(event) => onManualNoteChange(event.target.value)}
              rows={3}
              placeholder="Makes small-batch preserves, wants a retail intro…"
              className="mt-2 w-full resize-none rounded-[11px] border border-[oklch(0.28_0.05_255_/_0.35)] bg-white/35 px-3 py-3 text-[14.5px] leading-relaxed text-[var(--ink-body)] outline-none focus-visible:border-[var(--action-bg)]"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {['Where we met', 'Who introduced us', 'What I promised'].map(
              (prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() =>
                    onManualNoteChange(
                      manualNote
                        ? `${manualNote}\n${prompt}: `
                        : `${prompt}: `,
                    )
                  }
                  className="glass-button pressable min-h-11 rounded-[var(--r-chip)] px-3 text-xs font-medium text-[var(--ink-secondary)]"
                >
                  + {prompt}
                </button>
              ),
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-secondary)]">
            Whatever you write here shapes the first draft — one line is plenty.
          </p>
        </div>
      )}
    </section>
  )
}

function ContextChip({
  note,
  onToggle,
}: {
  note: ContextNote
  onToggle: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(note.id)}
      aria-pressed={note.accepted}
      className={cn(
        'pressable flex min-h-11 items-center gap-2.5 rounded-[11px] border px-3 py-2.5 text-left text-[13.5px] font-medium leading-snug',
        note.accepted
          ? 'border-[oklch(0.28_0.05_255_/_0.5)] bg-[oklch(0.28_0.05_255_/_0.12)] text-[var(--ink-strong)]'
          : 'border-[oklch(0.28_0.05_255_/_0.25)] bg-[oklch(0.28_0.05_255_/_0.06)] text-[var(--ink-body)]',
      )}
    >
      {note.accepted ? (
        <Check className="size-4 shrink-0" />
      ) : (
        <Plus className="size-4 shrink-0" />
      )}
      <span className="flex-1">
        {note.text}{' '}
        <span className="text-[var(--ink-tertiary)]">· {note.source}</span>
      </span>
    </button>
  )
}

function FollowUpDateRoller({
  value,
  tier,
  onSelect,
  onClose,
}: {
  value: Date
  tier: Tier
  onSelect: (date: Date) => void
  onClose: () => void
}) {
  const options = [
    { label: 'Today', date: new Date(), hint: 'tonight is tight' },
    { label: 'Tomorrow', date: addDays(new Date(), 1), hint: 'suggested' },
    { label: 'Thursday', date: addDays(new Date(), 3), hint: '2 others due · fine' },
    { label: 'Next Mon', date: addDays(new Date(), 7), hint: 'after the weekend' },
    { label: 'In 2 weeks', date: addDays(new Date(), 14), hint: 'momentum fades' },
  ]
  const cadence =
    tier === 'key'
      ? 'then every 2 weeks from this date'
      : tier === 'casual'
        ? 'then quarterly from this date'
        : 'then monthly from this date'

  return (
    <div className="absolute inset-0 z-30 flex items-end">
      <button
        type="button"
        aria-label="Close date picker"
        onClick={onClose}
        className="absolute inset-0 bg-[oklch(0.2_0.03_255_/_0.25)] backdrop-blur-[2px]"
      />
      <section className="relative z-[1] w-full rounded-t-[24px] border border-b-0 border-white/65 bg-[linear-gradient(170deg,oklch(1_0_0_/_0.72),oklch(1_0_0_/_0.5))] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-20px_50px_-20px_oklch(0.2_0.03_255_/_0.4)] backdrop-blur-[30px] animate-rise">
        <div className="mx-auto h-1 w-9 rounded-full bg-[oklch(0.5_0.02_252_/_0.2)]" />
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h3 className="font-heading text-lg font-bold tracking-[-0.02em] text-[var(--ink-strong)]">
            First follow-up
          </h3>
          <p className="text-right text-xs text-[var(--ink-secondary)]">
            {cadence}
          </p>
        </div>

        <div className="relative mt-4 h-[250px] overflow-hidden">
          <div className="absolute left-0 right-0 top-[100px] h-[50px] rounded-[13px] border border-[oklch(0.28_0.05_255_/_0.25)] bg-[oklch(0.28_0.05_255_/_0.08)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[70px] bg-gradient-to-b from-white/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[70px] bg-gradient-to-t from-white/70 to-transparent" />
          <div className="flex flex-col">
            {options.map((option, index) => {
              const selected = option.date.toDateString() === value.toDateString()
              const distance = Math.abs(index - 2)
              return (
                <button
                  key={`${option.label}-${option.date.toDateString()}`}
                  type="button"
                  onClick={() => onSelect(option.date)}
                  className={cn(
                    'grid h-[50px] grid-cols-[92px_1fr_auto] items-center gap-3 px-3 text-left transition-transform',
                    selected
                      ? 'scale-100 opacity-100'
                      : distance > 1
                        ? 'scale-[0.92] opacity-35'
                        : 'scale-[0.96] opacity-60',
                  )}
                >
                  <span className="font-heading text-[15px] font-semibold tracking-[-0.014em] text-[var(--ink-strong)]">
                    {option.label}
                  </span>
                  <span className="tnum text-[15px] text-[var(--ink-secondary)]">
                    {formatDateShort(option.date).replace(/^[A-Za-z]+,?\s?/, '')}
                  </span>
                  <span
                    className={cn(
                      'text-right text-[11.5px] font-medium',
                      option.hint === 'suggested'
                        ? 'text-[var(--status-on-track)]'
                        : option.hint === 'momentum fades'
                          ? 'text-[var(--status-due-soon)]'
                          : 'text-[var(--ink-secondary)]',
                    )}
                  >
                    {option.hint}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="primary-action pressable mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[var(--r-button-lg)] text-[15px] font-semibold"
        >
          <CalendarDays className="size-4" />
          Set · first follow-up {formatDateShort(value)}
        </button>
      </section>
    </div>
  )
}
