'use client'

import { useRef, useState } from 'react'
import {
  X,
  Camera,
  ScanLine,
  Loader2,
  UserPlus,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'
import type { NewContactInput } from '@/lib/contacts-store'
import type { Tier } from '@/lib/types'
import { saveToPhone } from '@/lib/card'
import { captureImageDataUrl, tapFeedback } from '@/lib/native'
import { cn } from '@/lib/utils'

interface ScannedCard {
  name: string
  title: string
  company: string
  phone: string
  email: string
  website: string
}

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
  const [note, setNote] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedToPhone, setSavedToPhone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const reset = () => {
    setStage('capture')
    setCard(EMPTY)
    setTier('network')
    setNote('')
    setPreviewImage(null)
    setError(null)
    setSavedToPhone(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const close = () => {
    reset()
    onClose()
  }

  const readCardImage = async (image: string) => {
    setError(null)
    setPreviewImage(image)
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
      // Pre-seed the context note with details that don't have their own field.
      setNote(scanned.website ? `Website: ${scanned.website}` : '')
      if (!scanned.name && !scanned.company) {
        setError("Couldn't read much — check the details below.")
      }
      setStage('review')
    } catch (err) {
      console.error('[v0] Card capture failed:', err)
      setError("Something went wrong reading the photo — add the details by hand.")
      setCard(EMPTY)
      setStage('review')
    }
  }

  const handleNativeCamera = async () => {
    setError(null)
    await tapFeedback()
    try {
      const image = await captureImageDataUrl()
      if (!image) {
        fileRef.current?.click()
        return
      }
      await readCardImage(await normalizeDataUrl(image))
    } catch (err) {
      const error = err as { message?: string }
      const cancelled =
        error?.message?.toLowerCase().includes('cancel') ||
        error?.message?.toLowerCase().includes('user denied')
      if (!cancelled) {
        console.error('[v0] Native card capture failed:', err)
        setError('Camera was not available — choose a photo or enter the details by hand.')
        setStage('capture')
      }
    }
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

  const submit = () => {
    if (!card.name.trim()) return
    const titleAndCompany = [card.title, card.company].filter(Boolean).join(' · ')
    const relationship =
      card.company.trim() || card.title.trim()
        ? `Met ${card.company ? `at ${card.company}` : 'through work'}`
        : 'New connection'
    onAdd({
      name: card.name,
      relationship,
      title: titleAndCompany || undefined,
      tier,
      phone: card.phone || undefined,
      email: card.email || undefined,
      context: note || undefined,
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

      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-serif text-xl font-medium tracking-tight">
              {stage === 'review' ? 'Confirm contact' : 'Scan a business card'}
            </h2>
            {stage === 'review' && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Read from card · check anything uncertain
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
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

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            {stage === 'capture' && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary">
                <ScanLine className="size-9" />
              </div>
              <div className="max-w-[18rem]">
                <p className="text-pretty text-[15px] font-medium text-foreground">
                  Point your camera at a business card
                </p>
                <p className="mt-1 text-pretty text-[13px] leading-relaxed text-muted-foreground">
                  FollowApp reads the name, role, company, and contact details for
                  you — then drafts a first message.
                </p>
              </div>
              <button
                type="button"
                onClick={handleNativeCamera}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <Camera className="size-4" />
                Take a photo
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="min-h-11 w-full text-sm font-semibold text-primary transition-colors active:text-primary/75"
              >
                Choose from photos instead
              </button>
            </div>
          )}

          {stage === 'reading' && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-[14px] font-medium text-foreground">
                Reading the card…
              </p>
              <p className="text-[12px] text-muted-foreground">
              Pulling out the details
              </p>
            </div>
          )}

          {stage === 'added' && (
            <div className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary">
                <UserPlus className="size-7" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {card.name.trim()} is in FollowApp
                </p>
                <p className="mt-1 text-pretty text-sm text-muted-foreground">
                  We’ll use the card details to draft a warmer first follow-up.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground"
              >
                Done
              </button>
              <button
                type="button"
                onClick={reset}
                className="min-h-11 text-sm font-semibold text-primary"
              >
                Scan another card
              </button>
            </div>
          )}

          {stage === 'review' && (
            <div className="flex flex-col gap-4">
              {error && (
                <p className="rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-[13px] text-muted-foreground text-pretty">
                  {error}
                </p>
              )}

              <CapturedCardPreview card={card} image={previewImage} />

              <div className="overflow-hidden rounded-3xl border border-border bg-card/80 shadow-card">
                <ParsedField
                  label="Name"
                  value={card.name}
                  placeholder="Daniel Okafor"
                  confidence={card.name.trim() ? 'sure' : 'check'}
                  onChange={(value) => update('name', value)}
                />
                <ParsedField
                  label="Role · company"
                  value={[card.title, card.company].filter(Boolean).join(', ')}
                  placeholder="VP Partnerships, Northbeam"
                  confidence={card.title.trim() || card.company.trim() ? 'sure' : 'check'}
                  onChange={(value) => {
                    const [title, ...companyParts] = value.split(',')
                    update('title', title?.trim() ?? '')
                    update('company', companyParts.join(',').trim())
                  }}
                />
                <ParsedField
                  label="Mobile"
                  value={card.phone}
                  placeholder="+1 (415) 555-0182"
                  confidence={looksLikePhone(card.phone) ? 'sure' : 'check'}
                  inputMode="tel"
                  onChange={(value) => update('phone', value)}
                />
                <ParsedField
                  label="Email"
                  value={card.email}
                  placeholder="d.okafor@northbeam.com"
                  confidence={looksLikeEmail(card.email) ? 'sure' : 'check'}
                  inputMode="email"
                  onChange={(value) => update('email', value)}
                />
              </div>

              <section className="rounded-3xl border border-border bg-card/75 p-4 shadow-card">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Where you met
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="SaaS Connect, SF — intro by Grace Lin"
                    className="mt-2 w-full resize-none rounded-2xl border border-border bg-background/80 px-4 py-3 text-[15px] font-medium leading-relaxed outline-none focus-visible:border-primary"
                  />
                </label>

                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Stay in touch
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {TIER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTier(opt.value)}
                        className={cn(
                          'min-h-11 rounded-2xl border px-2 text-xs font-semibold transition-all active:scale-[0.98]',
                          tier === opt.value
                            ? 'border-primary bg-primary text-primary-foreground shadow-card'
                            : 'border-border bg-background/80 text-muted-foreground',
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
                  className="flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-primary"
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
                  className="flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-muted-foreground disabled:opacity-40"
                >
                  <Smartphone className="size-3.5" />
                  {savedToPhone ? 'Opened Contacts' : 'Save to phone'}
                </button>
              </div>
            </div>
          )}
        </div>

        {stage === 'review' && (
          <footer className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={submit}
              disabled={!card.name.trim()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              <UserPlus className="size-4" />
              Save · {TIER_OPTIONS.find((opt) => opt.value === tier)?.cta}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function CapturedCardPreview({
  card,
  image,
}: {
  card: ScannedCard
  image: string | null
}) {
  const roleLine = [card.title, card.company].filter(Boolean).join(' · ')
  return (
    <div className="flex justify-center px-4 py-2">
      <div className="relative w-full max-w-[17.5rem] rotate-[-2deg] overflow-hidden rounded-2xl border border-border bg-[#f2eee6] p-4 text-left shadow-card-lg">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-[0.16] blur-[1px]"
          />
        )}
        <div className="relative">
          <p className="font-heading text-base font-semibold leading-tight text-foreground">
            {card.name || 'Name from card'}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {roleLine || 'Role · Company'}
          </p>
          <div className="mt-4 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
            <p>{card.phone || '+1 (415) 555-0182'}</p>
            <p>{card.email || 'email@company.com'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ParsedField({
  label,
  value,
  placeholder,
  confidence,
  inputMode,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  confidence: 'sure' | 'check'
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  onChange: (value: string) => void
}) {
  const needsCheck = confidence === 'check'
  return (
    <label className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          className="mt-1 h-7 w-full min-w-0 bg-transparent font-heading text-[15px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/45"
        />
      </span>
      <span
        className={cn(
          'mt-1 flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold',
          needsCheck
            ? 'border border-amber-300 bg-amber-50 text-amber-700'
            : 'bg-primary/10 text-primary',
        )}
      >
        {needsCheck ? (
          <>
            <AlertCircle className="size-3.5" />
            Check
          </>
        ) : (
          <CheckCircle2 className="size-4" />
        )}
      </span>
    </label>
  )
}
