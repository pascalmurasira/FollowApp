'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import {
  X,
  ScanLine,
  UserPlus,
  Smartphone,
  CameraOff,
  ImageIcon,
} from 'lucide-react'
import type { NewContactInput } from '@/lib/contacts-store'
import type { Tier } from '@/lib/types'
import type { CardData } from '@/lib/card'
import { readCardFromScan, saveToPhone } from '@/lib/card'
import { cn } from '@/lib/utils'

type Stage = 'scanning' | 'result' | 'denied'

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
  // True while the sheet wants the camera running. Guards against an async
  // getUserMedia resolving after the sheet was already closed (camera-light leak).
  const wantCameraRef = useRef(false)
  // Throttle the "not a FollowApp card" hint so a stray QR in frame doesn't
  // spam state on every animation frame.
  const lastRejectRef = useRef(0)

  const [stage, setStage] = useState<Stage>('scanning')
  const [card, setCard] = useState<CardData | null>(null)
  const [tier, setTier] = useState<Tier>('network')
  const [hint, setHint] = useState<string | null>(null)
  const [savedToPhone, setSavedToPhone] = useState(false)

  const stopCamera = useCallback(() => {
    wantCameraRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Returns true if the scanned code was a FollowApp card (and was consumed),
  // false if it wasn't — letting the scan loop know whether to keep going.
  const handleHit = useCallback(
    (raw: string): boolean => {
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
      setSavedToPhone(false)
      setStage('result')
      return true
    },
    [stopCamera],
  )

  // Live camera scan loop.
  const startCamera = useCallback(async () => {
    setHint(null)
    wantCameraRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      // The sheet may have been closed while getUserMedia was resolving —
      // if so, immediately release the camera instead of leaving it on.
      if (!wantCameraRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        return
      }
      video.srcObject = stream
      await video.play()

      const canvas = (canvasRef.current ??= document.createElement('canvas'))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      const tick = () => {
        if (!streamRef.current || !ctx) return
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
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
      console.error('[v0] Camera unavailable:', err)
      setStage('denied')
    }
  }, [handleHit])

  // Start/stop with the sheet lifecycle.
  useEffect(() => {
    if (!open) return
    setStage('scanning')
    setCard(null)
    startCamera()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const close = () => {
    stopCamera()
    onClose()
  }

  // Fallback: decode a QR from a chosen photo when the live camera is blocked.
  const decodeFromFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close?.()
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(img.data, img.width, img.height)
      if (code?.data) {
        handleHit(code.data)
      } else {
        setHint("Couldn't find a QR code in that photo.")
      }
    } catch (err) {
      console.error('[v0] QR file decode failed:', err)
      setHint("Couldn't read that photo.")
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
      context: 'Added from their FollowApp card.',
      interests: [],
    })
    close()
  }

  const roleLine = card ? [card.t, card.co].filter(Boolean).join(' · ') : ''

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
          <h2 className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]">
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
          capture="environment"
          onChange={(e) => decodeFromFile(e.target.files?.[0])}
          className="sr-only"
        />

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {stage === 'scanning' && (
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
                  <ScanLine className="size-8 text-primary/70" />
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

          {stage === 'denied' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="glass-card flex size-16 items-center justify-center rounded-2xl text-[var(--ink-secondary)]">
                <CameraOff className="size-7" />
              </div>
              <p className="max-w-[18rem] text-pretty text-[14px] leading-relaxed text-muted-foreground">
                FollowApp needs camera access to scan a QR code. Allow it in your
                browser settings, or scan from a photo instead.
              </p>
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
            <button
              type="button"
              onClick={() => {
                saveToPhone(card)
                setSavedToPhone(true)
              }}
              className="glass-button pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-[var(--ink-strong)]"
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
