'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  ChevronDown,
  ScanLine,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import type { NewContactInput } from '@/lib/contacts-store'
import type { Contact, EnrichmentHook, Tier } from '@/lib/types'
import {
  captureImageDataUrl,
  chooseImageDataUrl,
  isNativePermissionDeniedError,
  isNativeUserCancelError,
  openAppSettings,
  saveContactToPhone,
  tapFeedback,
} from '@/lib/native'
import { todayDateInputValue } from '@/lib/contact-dates'
import { isDeliverableEmail } from '@/lib/contact-validation'
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
type ReviewSource = 'scan' | 'manual'

const EMPTY: ScannedCard = {
  name: '',
  title: '',
  company: '',
  phone: '',
  email: '',
  website: '',
}

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  {
    value: 'key',
    label: 'Every 3 weeks',
  },
  {
    value: 'network',
    label: 'Every 6 weeks',
  },
  {
    value: 'casual',
    label: 'Quarterly',
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

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 8
}

export function ScanCardSheet({
  open,
  onClose,
  onAdd,
  onOpenContact,
  onTrySample,
  autoLaunchCamera = false,
  variant = 'standard',
}: {
  open: boolean
  onClose: () => void
  onAdd: (input: NewContactInput) => Contact | void
  onOpenContact?: (contactId: string) => void
  onTrySample?: () => void
  autoLaunchCamera?: boolean
  variant?: 'standard' | 'onboarding'
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
  const [showReviewDetails, setShowReviewDetails] = useState(false)
  const [reviewSource, setReviewSource] = useState<ReviewSource>('scan')
  const [addedContactId, setAddedContactId] = useState<string | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const modalRootRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const cameraFileRef = useRef<HTMLInputElement>(null)
  const photoFileRef = useRef<HTMLInputElement>(null)
  const cameraButtonRef = useRef<HTMLButtonElement>(null)
  const didAutoLaunchRef = useRef(false)
  const scanAbortRef = useRef<AbortController | null>(null)
  const operationRef = useRef(0)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
    if (!open) operationRef.current += 1
  }, [open])

  useEffect(() => {
    setPortalRoot(document.body)
  }, [])

  const reset = () => {
    operationRef.current += 1
    scanAbortRef.current?.abort()
    scanAbortRef.current = null
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
    setShowReviewDetails(false)
    setReviewSource('scan')
    setAddedContactId(null)
    if (cameraFileRef.current) cameraFileRef.current.value = ''
    if (photoFileRef.current) photoFileRef.current.value = ''
  }

  const close = () => {
    reset()
    onClose()
  }

  // A portaled modal must own both visual and keyboard focus. Inerting the app
  // behind it also keeps screen readers from wandering into hidden controls.
  useEffect(() => {
    if (!open || !portalRoot || !modalRootRef.current) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const modalRoot = modalRootRef.current
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== modalRoot,
    )
    const backgroundState = background.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }))
    for (const { element } of backgroundState) {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    }

    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (
        event.shiftKey &&
        (active === dialogRef.current ||
          active === first ||
          !dialogRef.current.contains(active))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (active === dialogRef.current ||
          active === last ||
          !dialogRef.current.contains(active))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      }
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
    // Focus ownership follows the open lifecycle; state changes inside the
    // dialog should not tear down and recreate the accessibility boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, portalRoot])

  // Returning users get a genuine one-tap scan from the home action. Native
  // camera presentation does not require the browser file-picker gesture, while
  // the web path deliberately keeps its explicit second tap for Safari safety.
  useEffect(() => {
    if (!open) {
      didAutoLaunchRef.current = false
      return
    }
    if (
      !autoLaunchCamera ||
      !portalRoot ||
      didAutoLaunchRef.current ||
      !Capacitor.isNativePlatform()
    ) {
      return
    }
    didAutoLaunchRef.current = true
    cameraButtonRef.current?.click()
  }, [autoLaunchCamera, open, portalRoot])

  if (!open || !portalRoot) return null

  const findContext = async (scanned: ScannedCard, operation: number) => {
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
      if (!openRef.current || operationRef.current !== operation) return

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
      setContextStatus(
        res.ok && data.status === 'ok'
          ? notes.length > 0
            ? 'done'
            : 'empty'
          : 'error',
      )
    } catch (err) {
      if (!openRef.current || operationRef.current !== operation) return
      console.error('[v0] Context lookup failed:', err)
      setContextStatus('error')
    }
  }

  const readCardImage = async (image: string, operation: number) => {
    if (!openRef.current || operationRef.current !== operation) return
    setError(null)
    setReviewSource('scan')
    setStage('reading')
    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      })
      const data = (await res.json()) as Partial<ScannedCard> & { status?: string }
      if (!openRef.current || operationRef.current !== operation) return

      if (data.status !== 'ok') {
        // Rate-limited or failed: drop into manual review, never a dead end.
        setError("Couldn't read that one — add the details by hand.")
        setCard(EMPTY)
        setReviewSource('manual')
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
      // Public enrichment is optional detail, not part of the critical path.
      // It starts only if the user expands More details and explicitly asks.
      setContextStatus('idle')
    } catch (err) {
      if (!openRef.current || operationRef.current !== operation) return
      console.error('[v0] Card capture failed:', err)
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Reading took too long. Add the essentials now, or rescan.'
          : 'Something went wrong reading the photo — add the details by hand.',
      )
      setCard(EMPTY)
      setReviewSource('manual')
      setStage('review')
      setContextStatus('empty')
    } finally {
      window.clearTimeout(timeout)
      if (scanAbortRef.current === controller) scanAbortRef.current = null
    }
  }

  const handleNativeCamera = async () => {
    const operation = ++operationRef.current
    const startedAt = performance.now()
    setError(null)
    setCameraHelp(null)
    const native = Capacitor.isNativePlatform()
    if (!native) {
      // Browser/iOS Safari requires the file picker to be opened directly from
      // the user's tap. If we await the native-camera checks first, the browser
      // can treat it as no longer user-initiated and silently block it.
      cameraFileRef.current?.click()
      return
    }

    setIsOpeningCamera(true)
    try {
      // Camera presentation owns the hot path. Avoid a competing haptics bridge
      // call here; the physical camera transition is already clear feedback.
      const image = await captureImageDataUrl()
      if (!openRef.current || operationRef.current !== operation) return
      if (!image) {
        throw new Error('Camera returned no photo.')
      }
      // Native adapters already return a bounded JPEG. Change the visible state
      // before any upload work so users never remain stuck on “Opening camera”.
      setStage('reading')
      console.info('[followapp:scan]', {
        // Includes framing/shutter time; native logs cover controller launch.
        event: 'camera_capture_round_trip',
        elapsedMs: Math.round(performance.now() - startedAt),
      })
      await readCardImage(image, operation)
    } catch (err) {
      if (!openRef.current || operationRef.current !== operation) return
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
      if (openRef.current && operationRef.current === operation) {
        setIsOpeningCamera(false)
      }
    }
  }

  const handleChoosePhoto = async () => {
    const operation = ++operationRef.current
    setError(null)
    setCameraHelp(null)
    const native = Capacitor.isNativePlatform()
    if (!native) {
      photoFileRef.current?.click()
      return
    }

    await tapFeedback()
    try {
      const image = await chooseImageDataUrl()
      if (!openRef.current || operationRef.current !== operation) return
      if (!image) {
        photoFileRef.current?.click()
        return
      }
      await readCardImage(await normalizeDataUrl(image), operation)
    } catch (err) {
      if (!openRef.current || operationRef.current !== operation) return
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
    setReviewSource('manual')
    setStage('review')
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const operation = ++operationRef.current
    const input = e.currentTarget
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await readCardImage(await downscale(file), operation)
    } finally {
      input.value = ''
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
    ].filter(Boolean)
    const added = onAdd({
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
    setAddedContactId(added?.id ?? null)
    setStage('added')
  }

  const finishAdded = () => {
    const contactId = addedContactId
    close()
    if (contactId) onOpenContact?.(contactId)
  }

  const hasDeliveryChannel =
    looksLikePhone(card.phone) || isDeliverableEmail(card.email)

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-card-sheet-title"
        aria-describedby="scan-card-sheet-announcement"
        tabIndex={-1}
        className="relative isolate flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] text-[var(--ink-body)] shadow-xl"
        style={{ background: 'var(--field-bg)' }}
      >
        <p
          id="scan-card-sheet-announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {stage === 'reading'
            ? 'Reading the business card and preparing a follow-up.'
            : stage === 'review'
              ? 'Card details are ready for review.'
              : stage === 'added'
                ? `${hasDeliveryChannel ? 'Follow-up' : 'Draft'} for ${card.name || 'this contact'} is ready.`
                : 'Choose how to add a business card.'}
        </p>
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div>
            <h2
              id="scan-card-sheet-title"
              className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
            >
              {stage === 'review'
                ? reviewSource === 'manual'
                  ? 'Add contact details'
                  : 'Check the essentials'
                : stage === 'added'
                  ? hasDeliveryChannel
                    ? 'Follow-up ready'
                    : 'Draft ready'
                  : variant === 'onboarding'
                    ? 'Turn a card into a follow-up'
                    : 'Scan a business card'}
            </h2>
            {stage === 'review' && (
              <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
                {reviewSource === 'manual'
                  ? 'Enter what you know — you can fill in the rest later'
                  : 'Correct anything uncertain. Everything else can wait.'}
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
          ref={cameraFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFile}
          className="sr-only"
        />
        <input
          ref={photoFileRef}
          type="file"
          accept="image/*"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFile}
          className="sr-only"
        />

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {stage === 'capture' && (
            <div className="flex flex-col items-center gap-4 py-1 text-center">
              <div className="glass-hero flex w-full items-center gap-4 rounded-3xl p-4 text-left">
                <div className="primary-action flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-card">
                  <ScanLine className="size-6" />
                </div>
                <div className="min-w-0">
                  <p className="font-heading text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink-strong)]">
                    Point, snap, done.
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-secondary)] text-pretty">
                    We capture the details and prepare a follow-up. You approve
                    everything first.
                  </p>
                </div>
              </div>

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
                    ref={cameraButtonRef}
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
                    {isOpeningCamera ? 'Opening camera…' : 'Scan a card'}
                  </button>
                  <button
                    type="button"
                    onClick={handleChoosePhoto}
                    className="glass-button pressable min-h-11 w-full rounded-full text-sm font-semibold text-[var(--ink-strong)]"
                  >
                    Choose a photo
                  </button>
                </div>
              )}

              <div className="flex w-full flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={handleManualEntry}
                  className="pressable min-h-11 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-secondary)]"
                >
                  Enter manually
                </button>
                {onTrySample && (
                  <button
                    type="button"
                    onClick={onTrySample}
                    className="pressable min-h-11 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-secondary)]"
                  >
                    Try with a sample
                  </button>
                )}
                {!cameraHelp && (
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setShowScanDetails((value) => !value)}
                      aria-expanded={showScanDetails}
                      className="pressable mx-auto flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[12px] font-semibold text-[var(--ink-tertiary)]"
                    >
                      <ShieldCheck className="size-3.5" />
                      Your privacy
                    </button>
                    {showScanDetails && (
                      <p className="rounded-2xl border border-[var(--hairline)] bg-white/20 px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-secondary)] text-pretty">
                        Camera opens only when you tap. The card photo is securely
                        sent to the scanning service to extract its details. No
                        contact is added until you review and approve it.
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
                Creating the contact…
              </p>
              <p className="text-[12px] text-[var(--ink-secondary)]">
                Reading the details and preparing the first follow-up.
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
                  {hasDeliveryChannel ? 'Your follow-up to' : 'Your draft for'}{' '}
                  {card.name.trim().split(' ')[0]} is ready
                </p>
                <p className="mt-1 text-pretty text-sm text-[var(--ink-secondary)]">
                  {hasDeliveryChannel
                    ? 'We used the card details to prepare an editable message.'
                    : 'Add a phone or email next, or copy the draft anywhere.'}
                </p>
              </div>
              <button
                type="button"
                onClick={finishAdded}
                className="primary-action pressable mt-2 flex min-h-12 w-full items-center justify-center rounded-full px-4 text-[15px] font-semibold"
              >
                Open the draft
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
                manual={reviewSource === 'manual'}
              />

              <button
                type="button"
                onClick={() => setShowReviewDetails((value) => !value)}
                aria-expanded={showReviewDetails}
                className="glass-button pressable flex min-h-11 w-full items-center justify-between rounded-2xl px-4 text-left text-[13px] font-semibold text-[var(--ink-secondary)]"
              >
                <span>Add context, cadence or save to phone</span>
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform',
                    showReviewDetails && 'rotate-180',
                  )}
                />
              </button>

              {showReviewDetails && (
                <>
                  <ContextNotesCard
                    status={contextStatus}
                    notes={contextNotes}
                    manualNote={note}
                    onManualNoteChange={setNote}
                    onToggle={toggleContext}
                    onLookup={() =>
                      void findContext(card, operationRef.current)
                    }
                    manualEntry={reviewSource === 'manual'}
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
                        Leave blank for a new contact. They will be ready to
                        follow up now.
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

                    <button
                      type="button"
                      onClick={async () => {
                        if (!card.name.trim()) return
                        try {
                          const saved = await saveContactToPhone({
                            n: card.name,
                            t: card.title || undefined,
                            co: card.company || undefined,
                            p: card.phone || undefined,
                            e: card.email || undefined,
                          })
                          setSavedToPhone(saved)
                        } catch (err) {
                          console.error('[v0] Save to Contacts failed:', err)
                        }
                      }}
                      disabled={!card.name.trim()}
                      className="pressable mt-3 flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[var(--ink-secondary)] disabled:opacity-40"
                    >
                      <Smartphone className="size-3.5" />
                      {savedToPhone ? 'Opened Contacts' : 'Save to phone'}
                    </button>
                  </section>
                </>
              )}

              <div className="flex items-center justify-start">
                <button
                  type="button"
                  onClick={handleNativeCamera}
                  className="pressable flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[var(--ink-secondary)]"
                >
                  <RotateCcw className="size-3.5" />
                  {reviewSource === 'manual' ? 'Scan instead' : 'Rescan'}
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
              <span>{hasDeliveryChannel ? 'Create follow-up' : 'Create draft'}</span>
            </button>
          </footer>
        )}
      </div>
    </div>,
    portalRoot,
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
  manual,
}: {
  card: ScannedCard
  onUpdate: (key: keyof ScannedCard, value: string) => void
  manual: boolean
}) {
  return (
    <section className="glass-hero overflow-hidden rounded-3xl px-4 py-0">
      <EditableSummaryRow
        label="Full name"
        value={card.name}
        placeholder="Full name (required)"
        sure={Boolean(card.name.trim())}
        showConfidence={!manual}
        autoComplete="name"
        required
        onChange={(value) => onUpdate('name', value)}
      />
      <EditableSummaryRow
        label="Role or title"
        value={card.title}
        placeholder="Role or job title"
        sure={Boolean(card.title.trim())}
        showConfidence={!manual && Boolean(card.title.trim())}
        autoComplete="organization-title"
        onChange={(value) => onUpdate('title', value)}
      />
      <EditableSummaryRow
        label="Company"
        value={card.company}
        placeholder="Company or organization"
        sure={Boolean(card.company.trim())}
        showConfidence={!manual && Boolean(card.company.trim())}
        autoComplete="organization"
        onChange={(value) => onUpdate('company', value)}
      />
      <EditableSummaryRow
        label="Mobile"
        value={card.phone}
        placeholder="Phone number"
        sure={looksLikePhone(card.phone)}
        showConfidence={!manual && Boolean(card.phone.trim())}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        onChange={(value) => onUpdate('phone', value)}
      />
      <EditableSummaryRow
        label="Email"
        value={card.email}
        placeholder="Email address"
        sure={isDeliverableEmail(card.email)}
        showConfidence={!manual && Boolean(card.email.trim())}
        type="email"
        inputMode="email"
        autoComplete="email"
        onChange={(value) => onUpdate('email', value)}
      />
    </section>
  )
}

function EditableSummaryRow({
  label,
  value,
  placeholder,
  sure,
  showConfidence,
  type = 'text',
  inputMode,
  autoComplete,
  required = false,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  sure: boolean
  showConfidence: boolean
  type?: 'text' | 'tel' | 'email'
  inputMode?: 'text' | 'tel' | 'email'
  autoComplete?: string
  required?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label
      className={cn(
        'grid gap-3 border-b border-[var(--hairline)] py-3 last:border-b-0',
        showConfidence ? 'grid-cols-[1fr_auto]' : 'grid-cols-1',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--ink-tertiary)]">
          {label}
        </span>
        <input
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1 h-7 w-full min-w-0 bg-transparent font-heading text-[15px] font-semibold tracking-[-0.012em] text-[var(--ink-strong)] outline-none placeholder:text-[var(--ink-tertiary)]/45"
        />
      </span>
      {showConfidence && <ConfidenceBadge sure={sure} />}
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
  onLookup,
  manualEntry,
}: {
  status: ContextStatus
  notes: ContextNote[]
  manualNote: string
  onManualNoteChange: (value: string) => void
  onToggle: (id: string) => void
  onLookup: () => void
  manualEntry: boolean
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

      {status === 'idle' && (
        <button
          type="button"
          onClick={onLookup}
          className="pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--hairline)] bg-white/20 px-4 text-[13px] font-semibold text-[var(--ink-secondary)]"
        >
          <Search className="size-4" />
          Find optional public context
        </button>
      )}

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
                : manualEntry
                  ? 'Add anything that will help you remember this person and follow up naturally.'
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
