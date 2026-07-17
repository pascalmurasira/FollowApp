'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import jsQR from 'jsqr'
import {
  X,
  ScanLine,
  UserPlus,
  CameraOff,
  ImageIcon,
  Loader2,
  RotateCcw,
  Settings,
  AlertCircle,
} from 'lucide-react'
import type { NewContactInput } from '@/lib/contacts-store'
import type { Tier } from '@/lib/types'
import type { CardData } from '@/lib/card'
import { readCardFromScan } from '@/lib/card'
import {
  cameraPermissionState,
  isNativePermissionDeniedError,
  isNativeRuntime,
  openAppSettings,
  requestCameraPermission,
} from '@/lib/native'
import { cn } from '@/lib/utils'
import { trackProductEvent } from '@/lib/product-analytics'
import { NativeContactSaveButton } from '@/components/native-contact-save-button'

type Stage = 'starting' | 'scanning' | 'result' | 'blocked' | 'error'

const CAMERA_START_TIMEOUT_MS = 10_000

const TIER_OPTIONS: { value: Tier; label: string; hint: string }[] = [
  { value: 'key', label: 'Key', hint: 'every ~3 weeks' },
  { value: 'network', label: 'Network', hint: 'every ~6 weeks' },
  { value: 'casual', label: 'Casual', hint: 'every ~3 months' },
]

export function QrScanSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (input: NewContactInput) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const modalRootRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const openRef = useRef(open)
  const cameraAttemptRef = useRef(0)
  const decodeAttemptRef = useRef(0)
  // True while the sheet wants the camera running. Guards against an async
  // getUserMedia resolving after the sheet was already closed (camera-light leak).
  const wantCameraRef = useRef(false)
  // Throttle the "not a FollowApp card" hint so a stray QR in frame doesn't
  // spam state on every animation frame.
  const lastRejectRef = useRef(0)

  const [stage, setStage] = useState<Stage>('starting')
  const [card, setCard] = useState<CardData | null>(null)
  const [tier, setTier] = useState<Tier>('network')
  const [hint, setHint] = useState<string | null>(null)
  const [nativeContactSaved, setNativeContactSaved] = useState(false)
  const [native, setNative] = useState(false)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setPortalRoot(document.body)
  }, [])

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const stopCamera = useCallback(() => {
    wantCameraRef.current = false
    cameraAttemptRef.current += 1
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
  }, [])

  const close = useCallback(() => {
    decodeAttemptRef.current += 1
    stopCamera()
    onCloseRef.current()
  }, [stopCamera])

  // Returns true if the scanned code was a FollowApp card (and was consumed),
  // false if it wasn't — letting the scan loop know whether to keep going.
  const handleHit = useCallback(
    (raw: string, source: 'camera' | 'photo' = 'camera'): boolean => {
      const data = readCardFromScan(raw)
      if (!data) {
        // A QR that isn't a FollowApp card — nudge (throttled) and keep scanning.
        const now = Date.now()
        if (now - lastRejectRef.current > 1500) {
          lastRejectRef.current = now
          setHint("That code isn't a FollowApp card. Try another.")
        }
        return false
      }
      stopCamera()
      setHint(null)
      setCard(data)
      setTier('network')
      setNativeContactSaved(false)
      setStage('result')
      trackProductEvent('qr_scan_result', { source, valid: true })
      return true
    },
    [stopCamera],
  )

  // Live camera scan loop.
  const startCamera = useCallback(async () => {
    // Retrying or a Strict Mode effect replay invalidates every older permission,
    // stream, and animation-frame continuation before opening a new camera.
    stopCamera()
    const attempt = ++cameraAttemptRef.current
    const isActive = () =>
      openRef.current &&
      wantCameraRef.current &&
      cameraAttemptRef.current === attempt

    setHint(null)
    setStage('starting')
    wantCameraRef.current = true
    let startTimeout: ReturnType<typeof setTimeout> | undefined
    try {
      const inNativeApp = await isNativeRuntime()
      if (!isActive()) return
      setNative(inNativeApp)
      if (inNativeApp) {
        let permission = await cameraPermissionState()
        if (!isActive()) return
        if (permission === 'prompt' || permission === 'prompt-with-rationale') {
          permission = await requestCameraPermission()
          if (!isActive()) return
        }
        if (permission !== 'granted' && permission !== 'limited') {
          wantCameraRef.current = false
          setStage('blocked')
          trackProductEvent('qr_camera_permission', { outcome: 'blocked' })
          return
        }
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera capture is unavailable on this device.')
      }

      let timedOut = false
      const streamPromise = navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      const stream = await Promise.race([
        streamPromise.then((opened) => {
          if (timedOut || !isActive()) {
            opened.getTracks().forEach((track) => track.stop())
          }
          return opened
        }),
        new Promise<never>((_, reject) => {
          startTimeout = setTimeout(() => {
            timedOut = true
            reject(new Error('Camera took too long to start.'))
          }, CAMERA_START_TIMEOUT_MS)
        }),
      ])
      // The sheet may have been closed while getUserMedia was resolving —
      // if so, immediately release the camera instead of leaving it on.
      if (!isActive()) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        return
      }
      video.srcObject = stream
      await video.play()
      if (!isActive() || streamRef.current !== stream) {
        stream.getTracks().forEach((track) => track.stop())
        if (streamRef.current === stream) streamRef.current = null
        return
      }
      setStage('scanning')
      trackProductEvent('qr_camera_visible', { native: inNativeApp })

      const canvas = (canvasRef.current ??= document.createElement('canvas'))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      let lastScanAt = 0

      const tick = (timestamp: number) => {
        if (!isActive() || streamRef.current !== stream || !ctx) return
        // QR decoding allocates an ImageData buffer and runs on the main thread.
        // Eight attempts per second at a bounded size is responsive without
        // making a high-resolution camera feed freeze the rest of the sheet.
        if (
          timestamp - lastScanAt >= 125 &&
          video.readyState === video.HAVE_ENOUGH_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          lastScanAt = timestamp
          const scale = Math.min(
            1,
            960 / Math.max(video.videoWidth, video.videoHeight),
          )
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(img.data, img.width, img.height, {
            inversionAttempts: 'dontInvert',
          })
          // Only stop looping once we've consumed a valid FollowApp card;
          // a non-card QR keeps the camera live so the user can try again.
          if (code?.data && handleHit(code.data)) return
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      if (!isActive()) return
      wantCameraRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      console.error('[v0] Camera unavailable:', err)
      const denied =
        isNativePermissionDeniedError(err) ||
        (err instanceof DOMException &&
          (err.name === 'NotAllowedError' || err.name === 'SecurityError'))
      setStage(denied ? 'blocked' : 'error')
      trackProductEvent('qr_camera_failed', {
        reason: denied ? 'permission' : 'start',
      })
    } finally {
      if (startTimeout) clearTimeout(startTimeout)
    }
  }, [handleHit, stopCamera])

  // Start/stop with the sheet lifecycle.
  useEffect(() => {
    if (!open || !portalRoot) return
    setStage('starting')
    setCard(null)
    void startCamera()
    return () => {
      decodeAttemptRef.current += 1
      stopCamera()
    }
  }, [open, portalRoot, startCamera, stopCamera])

  // Match the business-card and My QR sheets: one accessible dialog owns focus,
  // the app behind it is inert, Escape closes, and focus returns to the opener.
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

    const focusFrame = window.requestAnimationFrame(() =>
      dialogRef.current?.focus(),
    )
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
  }, [close, open, portalRoot])

  if (!open || !portalRoot) return null

  // Fallback: decode a QR from a chosen photo when the live camera is blocked.
  const decodeFromFile = async (file: File | undefined) => {
    if (!file) return
    const attempt = ++decodeAttemptRef.current
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file)
      if (!openRef.current || decodeAttemptRef.current !== attempt) return
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(img.data, img.width, img.height)
      if (!openRef.current || decodeAttemptRef.current !== attempt) return
      if (code?.data) {
        if (!handleHit(code.data, 'photo')) {
          trackProductEvent('qr_scan_result', { source: 'photo', valid: false })
        }
      } else {
        setHint("Couldn't find a QR code in that photo.")
        trackProductEvent('qr_scan_result', { source: 'photo', valid: false })
      }
    } catch (err) {
      if (!openRef.current || decodeAttemptRef.current !== attempt) return
      console.error('[v0] QR file decode failed:', err)
      setHint("Couldn't read that photo.")
    } finally {
      bitmap?.close?.()
    }
  }

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    try {
      await decodeFromFile(input.files?.[0])
    } finally {
      // Let the user retry the same image after a failed decode.
      input.value = ''
    }
  }

  const addToFollowApp = () => {
    if (!card) return
    const titleAndCompany = [card.t, card.co].filter(Boolean).join(' · ')
    onAdd({
      name: card.n,
      relationship: card.co ? `Connection at ${card.co}` : '',
      title: titleAndCompany || undefined,
      tier,
      phone: card.p || undefined,
      email: card.e || undefined,
      context: 'Added from a self-provided FollowApp card.',
      interests: [],
    })
    trackProductEvent('qr_contact_saved', {
      native_contact: nativeContactSaved,
    })
    close()
  }

  const roleLine = card ? [card.t, card.co].filter(Boolean).join(' · ') : ''

  const announcement =
    stage === 'starting'
      ? 'Starting the QR scanner.'
      : stage === 'scanning'
        ? 'Camera ready. Point it at a FollowApp QR code.'
        : stage === 'result'
          ? 'FollowApp card found. Review how often to stay in touch.'
          : stage === 'blocked'
            ? 'Camera access is blocked. Settings and photo options are available.'
            : 'The camera could not start. Retry and photo options are available.'

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scan-sheet-title"
        aria-describedby="qr-scan-sheet-announcement"
        tabIndex={-1}
        className="app-field relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] shadow-xl outline-none"
      >
        <p
          id="qr-scan-sheet-announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {announcement}
        </p>
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <h2
            id="qr-scan-sheet-title"
            className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
          >
            {stage === 'result' ? 'Save this contact' : 'Scan a FollowApp card'}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="glass-button pressable flex size-11 items-center justify-center rounded-full text-[var(--ink-secondary)]"
          >
            <X className="size-5" />
          </button>
        </header>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => void handlePhotoChange(event)}
          className="sr-only"
        />

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {(stage === 'starting' || stage === 'scanning') && (
            <div className="flex flex-col items-center gap-4">
              <div className="glass-hero relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="size-full object-cover"
                />
                {/* Reticle */}
                <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-primary/80" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {stage === 'starting' ? (
                    <span className="glass-button flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold">
                      <Loader2 className="size-4 animate-spin" />
                      Starting camera…
                    </span>
                  ) : (
                    <ScanLine className="size-8 text-primary/70" />
                  )}
                </div>
              </div>
              <p className="text-pretty text-center text-[13px] leading-relaxed text-muted-foreground">
                Point your camera at someone&apos;s FollowApp QR code to save
                them instantly.
              </p>
              {hint && (
                <p className="text-center text-[13px] font-medium text-destructive">
                  {hint}
                </p>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="glass-button pressable flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-strong)]"
              >
                <ImageIcon className="size-4" />
                Scan from a photo instead
              </button>
            </div>
          )}

          {stage === 'blocked' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="glass-card flex size-16 items-center justify-center rounded-2xl text-[var(--ink-secondary)]">
                <CameraOff className="size-7" />
              </div>
              <p className="max-w-[18rem] text-pretty text-[14px] leading-relaxed text-muted-foreground">
                FollowApp needs camera access to scan a QR code. You can enable
                it in Settings, retry, or choose a photo instead.
              </p>
              <div className="flex w-full gap-2">
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="glass-button pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
                >
                  <RotateCcw className="size-4" />
                  Retry
                </button>
                {native && (
                  <button
                    type="button"
                    onClick={() => void openAppSettings()}
                    className="glass-button pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
                  >
                    <Settings className="size-4" />
                    Settings
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="primary-action pressable flex min-h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold"
              >
                <ImageIcon className="size-4" />
                Choose a photo
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="glass-card flex size-16 items-center justify-center rounded-2xl text-[var(--ink-secondary)]">
                <AlertCircle className="size-7" />
              </div>
              <div>
                <p className="font-heading text-lg font-semibold text-[var(--ink-strong)]">
                  Camera couldn&apos;t start
                </p>
                <p className="mt-1 max-w-[18rem] text-pretty text-sm text-[var(--ink-secondary)]">
                  Try again now, or scan the QR from a photo.
                </p>
              </div>
              <div className="flex w-full gap-2">
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="primary-action pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
                >
                  <RotateCcw className="size-4" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="glass-button pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
                >
                  <ImageIcon className="size-4" />
                  Photo
                </button>
              </div>
            </div>
          )}

          {stage === 'result' && card && (
            <div className="flex flex-col gap-5">
              <div className="glass-card rounded-2xl p-5 text-center">
                <p className="font-heading text-2xl font-semibold tracking-tight text-[var(--ink-strong)]">
                  {card.n}
                </p>
                {roleLine && (
                  <p className="mt-0.5 text-[14px] text-muted-foreground">{roleLine}</p>
                )}
                {(card.p || card.e) && (
                  <div className="mt-3 space-y-0.5 text-[13px] text-muted-foreground">
                    {card.p && <p>{card.p}</p>}
                    {card.e && <p>{card.e}</p>}
                  </div>
                )}
              </div>
              <p className="-mt-2 text-pretty text-center text-[11.5px] leading-relaxed text-[var(--ink-tertiary)]">
                Shared card details are self-provided. Confirm important details
                with the person before relying on them.
              </p>

              <div>
                <p className="mb-2 px-1 text-sm font-medium text-foreground">
                  How often do you want to stay in touch?
                </p>
                <div className="flex gap-2">
                  {TIER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTier(opt.value)}
                      className={cn(
                        'pressable flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 transition-colors',
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
              </div>
            </div>
          )}
        </div>

        {stage === 'result' && card && (
          <footer className="relative z-[1] flex flex-col gap-2 border-t border-[var(--hairline)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
            <button
              type="button"
              onClick={addToFollowApp}
              className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold"
            >
              <UserPlus className="size-4" />
              Save contact to FollowApp
            </button>
            <NativeContactSaveButton
              card={card}
              source="qr"
              onOutcome={(outcome) => setNativeContactSaved(outcome === 'saved')}
            />
          </footer>
        )}
      </div>
    </div>,
    portalRoot,
  )
}
