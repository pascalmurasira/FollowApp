'use client'

import { useRef, useState } from 'react'
import { X, Camera, ScanLine, Loader2, UserPlus, Smartphone } from 'lucide-react'
import type { NewContactInput } from '@/lib/contacts-store'
import type { Tier } from '@/lib/types'
import { saveToPhone } from '@/lib/card'
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

const TIER_OPTIONS: { value: Tier; label: string; hint: string }[] = [
  { value: 'key', label: 'Key', hint: 'every ~3 weeks' },
  { value: 'network', label: 'Network', hint: 'every ~6 weeks' },
  { value: 'casual', label: 'Casual', hint: 'every ~3 months' },
]

type Stage = 'capture' | 'reading' | 'review'

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
  const [error, setError] = useState<string | null>(null)
  const [savedToPhone, setSavedToPhone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const reset = () => {
    setStage('capture')
    setCard(EMPTY)
    setTier('network')
    setNote('')
    setError(null)
    setSavedToPhone(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const close = () => {
    reset()
    onClose()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setStage('reading')
    try {
      const image = await downscale(file)
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
      setNote(scanned.website ? `Scanned from business card. Web: ${scanned.website}` : '')
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

  const update = (key: keyof ScannedCard, value: string) =>
    setCard((prev) => ({ ...prev, [key]: value }))

  const submit = () => {
    if (!card.name.trim()) return
    const titleAndCompany = [card.title, card.company].filter(Boolean).join(' · ')
    onAdd({
      name: card.name,
      relationship: card.company ? `Connection at ${card.company}` : '',
      title: titleAndCompany || undefined,
      tier,
      phone: card.phone || undefined,
      email: card.email || undefined,
      context: note || undefined,
      interests: [],
    })
    close()
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
          <h2 className="font-serif text-xl font-medium tracking-tight">
            {stage === 'review' ? 'Check the details' : 'Scan a business card'}
          </h2>
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
                onClick={() => fileRef.current?.click()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <Camera className="size-4" />
                Take a photo
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

          {stage === 'review' && (
            <div className="flex flex-col gap-4">
              {error && (
                <p className="rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-[13px] text-muted-foreground text-pretty">
                  {error}
                </p>
              )}

              <Field label="Name" required>
                <input
                  value={card.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Maya Chen"
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </Field>

              <Field label="Role">
                <input
                  value={card.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="Design Lead"
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </Field>

              <Field label="Company">
                <input
                  value={card.company}
                  onChange={(e) => update('company', e.target.value)}
                  placeholder="Linear"
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </Field>

              <Field label="Phone">
                <input
                  value={card.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  inputMode="tel"
                  placeholder="+1 415 555 0142"
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </Field>

              <Field label="Email">
                <input
                  value={card.email}
                  onChange={(e) => update('email', e.target.value)}
                  inputMode="email"
                  placeholder="maya@linear.app"
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </Field>

              <Field label="Priority" hint="Sets your follow-up rhythm">
                <div className="flex gap-2">
                  {TIER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTier(opt.value)}
                      className={cn(
                        'flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 transition-colors',
                        tier === opt.value
                          ? 'border-primary bg-primary/[0.08] text-primary'
                          : 'border-border bg-card text-muted-foreground',
                      )}
                    >
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className="text-[10px] leading-tight">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Where you left off" hint="Helps FollowApp write something real">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Met at the design conf, talked about her move to Linear…"
                  className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-base leading-relaxed outline-none focus-visible:border-primary"
                />
              </Field>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="self-start text-[13px] font-semibold text-primary"
              >
                Retake photo
              </button>
            </div>
          )}
        </div>

        {stage === 'review' && (
          <footer className="flex flex-col gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={submit}
              disabled={!card.name.trim()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              <UserPlus className="size-4" />
              Add to FollowApp
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
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[15px] font-semibold text-foreground transition-colors active:bg-muted disabled:opacity-40"
            >
              <Smartphone className="size-4" />
              {savedToPhone ? 'Opened in Contacts' : 'Also save to phone'}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2 px-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {required && <span className="text-xs text-primary">required</span>}
        {hint && (
          <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
      {children}
    </label>
  )
}
