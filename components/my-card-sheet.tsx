'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  QrCode,
  RotateCcw,
  Share2,
  X,
} from 'lucide-react'
import type { Profile } from '@/lib/types'
import {
  isShareableProfile,
  loadLocalProfile,
  loadProfile,
  retryPendingProfileSync,
  saveProfile,
} from '@/lib/profile'
import { cardFitsReliableQr, cardUrl } from '@/lib/card'
import { getDeviceId } from '@/lib/device-id'
import { isNativeUserCancelError } from '@/lib/native'
import { trackProductEvent } from '@/lib/product-analytics'
import {
  shareContentWithOutcome,
  type ShareOutcome,
} from '@/lib/share-outcome'

type QrStatus = 'idle' | 'loading' | 'ready' | 'error' | 'too-large'

function initials(name: string) {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'Y'
  )
}

/** Has the user filled in anything beyond a name? Drives the empty hint. */
function hasCardDetails(profile: Profile) {
  return Boolean(
    profile.title || profile.company || profile.phone || profile.email,
  )
}

function qrFileName(name: string): string {
  const safeName = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${safeName || 'my'}-followapp-card.png`
}

async function qrDataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error('Could not prepare the QR image.')
  return new File([await response.blob()], qrFileName(name), {
    type: 'image/png',
  })
}

function isShareCancellation(error: unknown): boolean {
  if (isNativeUserCancelError(error)) return true
  if (!error || typeof error !== 'object') return false
  return (error as { name?: unknown }).name === 'AbortError'
}

export function MyCardSheet({
  open,
  onClose,
  onCardReady,
}: {
  open: boolean
  onClose: () => void
  onCardReady?: () => void
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Profile>({ name: '' })
  const [editing, setEditing] = useState(false)
  const [extraDetailsOpen, setExtraDetailsOpen] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [cardSizeError, setCardSizeError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<QrStatus>('idle')
  const [qrAttempt, setQrAttempt] = useState(0)
  const [sharing, setSharing] = useState(false)
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const modalRootRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const draftDirtyRef = useRef(false)
  const sharedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCloseRef = useRef(onClose)
  const onCardReadyRef = useRef(onCardReady)

  useEffect(() => {
    onCloseRef.current = onClose
    onCardReadyRef.current = onCardReady
  }, [onCardReady, onClose])

  useEffect(() => {
    setPortalRoot(document.body)
    return () => {
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current)
    }
  }, [])

  const close = () => onCloseRef.current()

  // Show a locally-cached card immediately, then reconcile it with the server.
  // A placeholder profile is never placed in `profile`, so it cannot be
  // encoded or shared during the network request.
  useEffect(() => {
    if (!open) return

    const deviceId = getDeviceId()
    const local = loadLocalProfile(deviceId)
    trackProductEvent('qr_card_opened', { has_existing_card: Boolean(local) })
    let cancelled = false
    draftDirtyRef.current = false
    setProfile(local)
    setDraft(local ?? { name: '' })
    setEditing(!local)
    setExtraDetailsOpen(Boolean(local?.title || local?.company))
    setLoadingProfile(!local)
    setSaving(false)
    setValidationError(null)
    setCardSizeError(null)
    setSaveNotice(null)
    setShareError(null)
    setShareOutcome(null)
    if (local) onCardReadyRef.current?.()

    void loadProfile(deviceId).then((loaded) => {
      if (cancelled) return
      setLoadingProfile(false)
      if (!isShareableProfile(loaded)) {
        if (!local && !draftDirtyRef.current) setEditing(true)
        return
      }

      if (!draftDirtyRef.current) {
        setProfile(loaded)
        setDraft(loaded)
        setEditing(false)
      }
      onCardReadyRef.current?.()
    })

    return () => {
      cancelled = true
    }
  }, [open])

  // A local-first card remains usable offline. When connectivity returns while
  // this sheet is still open, repair its cloud copy immediately instead of
  // waiting for the user to close and reopen the surface.
  useEffect(() => {
    if (!open) return
    let active = true
    const retry = async () => {
      const deviceId = getDeviceId()
      if (!deviceId) return
      setSaveNotice('Card ready. Syncing in the background…')
      try {
        await retryPendingProfileSync(deviceId)
        if (active) setSaveNotice(null)
      } catch (error) {
        console.warn('[v0] Card sync retry failed:', error)
        if (active) {
          setSaveNotice('Saved on this device. Cloud sync will retry automatically.')
        }
      }
    }
    const onOnline = () => void retry()
    window.addEventListener('online', onOnline)
    return () => {
      active = false
      window.removeEventListener('online', onOnline)
    }
  }, [open])

  // Generate only from a real identity. A standard four-module quiet zone is
  // deliberately retained so phone cameras can acquire the code quickly.
  useEffect(() => {
    if (!open || !isShareableProfile(profile)) {
      setQr(null)
      setQrStatus('idle')
      return
    }
    if (!cardFitsReliableQr(profile)) {
      setQr(null)
      setQrStatus('too-large')
      return
    }

    let cancelled = false
    setQr(null)
    setQrStatus('loading')
    void QRCode.toDataURL(cardUrl(profile), {
      width: 480,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1830', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (cancelled) return
        setQr(dataUrl)
        setQrStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[v0] QR generation failed:', error)
        setQrStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [open, profile, qrAttempt])

  // A portaled dialog owns visual and keyboard focus while it is open.
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
    // Focus ownership follows the open lifecycle, not transient sheet state.
  }, [open, portalRoot])

  useEffect(() => {
    if (!open || !editing) return
    const frame = window.requestAnimationFrame(() => nameInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [editing, open])

  if (!open || !portalRoot) return null

  const updateDraft = (next: Profile) => {
    draftDirtyRef.current = true
    setDraft(next)
    setValidationError(null)
    setCardSizeError(null)
  }

  const persist = () => {
    const name = draft.name.trim()
    if (!name || name.toLocaleLowerCase() === 'you') {
      setValidationError('Add your name before creating a shareable card.')
      nameInputRef.current?.focus()
      return
    }

    const next: Profile = {
      name,
      photoUrl: profile?.photoUrl ?? draft.photoUrl,
      title: draft.title?.trim() || undefined,
      company: draft.company?.trim() || undefined,
      phone: draft.phone?.trim() || undefined,
      email: draft.email?.trim() || undefined,
    }
    if (!cardFitsReliableQr(next)) {
      setCardSizeError(
        'This is too much text for a fast, reliable QR scan. Shorten the name or optional details.',
      )
      return
    }
    setSaving(true)
    setSaveNotice('Card ready. Syncing in the background…')
    setProfile(next)
    setDraft(next)
    setEditing(false)
    onCardReadyRef.current?.()
    trackProductEvent('qr_card_ready', {
      has_phone: Boolean(next.phone),
      has_email: Boolean(next.email),
      has_role: Boolean(next.title || next.company),
    })

    // saveProfile caches synchronously before its network request. Release the
    // UI immediately so a slow connection can never block showing or sharing
    // the QR; the cache carries a pending-sync marker for automatic retry.
    const cloudSave = saveProfile(getDeviceId(), next)
    setSaving(false)
    void cloudSave
      .then(() => setSaveNotice(null))
      .catch((error) => {
        console.error('[v0] Card cloud sync failed:', error)
        setSaveNotice('Saved on this device. Cloud sync will retry automatically.')
      })
  }

  const markShared = (outcome: ShareOutcome) => {
    setShareOutcome(outcome)
    if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current)
    sharedTimerRef.current = setTimeout(() => setShareOutcome(null), 2000)
  }

  const share = async () => {
    if (!isShareableProfile(profile)) return

    setSharing(true)
    setShareError(null)
    const url = cardUrl(profile)
    const shareData = {
      title: `${profile.name} · FollowApp card`,
      text: 'Here is my FollowApp digital card.',
      url,
    }

    try {
      // Share the actual QR image where Web Share Level 2 is available. Native
      // and older browsers still receive the universally useful card link.
      if (
        qr &&
        typeof File !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        navigator.share &&
        navigator.canShare
      ) {
        try {
          const file = await qrDataUrlToFile(qr, profile.name)
          const fileShare: ShareData = { ...shareData, files: [file] }
          if (navigator.canShare(fileShare)) {
            await navigator.share(fileShare)
            markShared('shared')
            trackProductEvent('qr_card_shared', { method: 'image' })
            return
          }
        } catch (error) {
          if (isShareCancellation(error)) return
          console.warn('[v0] QR image share unavailable; sharing link:', error)
        }
      }

      const outcome = await shareContentWithOutcome(shareData)
      markShared(outcome)
      trackProductEvent('qr_card_shared', { method: outcome })
    } catch (error) {
      if (!isShareCancellation(error)) {
        console.error('[v0] Card share failed:', error)
        setShareError('Could not share this card. Please try again.')
      }
    } finally {
      setSharing(false)
    }
  }

  const roleLine = profile
    ? [profile.title, profile.company].filter(Boolean).join(' · ')
    : ''
  const announcement = editing
    ? 'Enter your details to create a shareable digital card.'
    : qrStatus === 'ready'
      ? 'Your QR code is ready to scan.'
      : qrStatus === 'too-large'
        ? 'Your card is too detailed for a reliable QR scan. Edit the optional fields.'
        : qrStatus === 'error'
        ? 'Your QR code could not be created. Retry is available.'
        : 'Preparing your QR code.'

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
        aria-labelledby="my-card-sheet-title"
        aria-describedby="my-card-sheet-announcement"
        tabIndex={-1}
        className="app-field relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] shadow-xl outline-none"
      >
        <p
          id="my-card-sheet-announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {announcement}
        </p>
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <div>
            <h2
              id="my-card-sheet-title"
              className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
            >
              {editing ? (profile ? 'Edit your card' : 'Create your card') : 'Your card'}
            </h2>
            {!editing && (
              <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
                Let someone scan it — no app required
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

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {editing ? (
            <div className="flex flex-col gap-4">
              <p className="text-pretty text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                Start with your name. Everything else is optional and can be
                changed later.
              </p>
              <Field label="Name">
                <input
                  ref={nameInputRef}
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="Your name"
                  autoComplete="name"
                  maxLength={200}
                  aria-required="true"
                  aria-invalid={Boolean(validationError)}
                  aria-describedby={validationError ? 'card-name-error' : undefined}
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>
              {validationError && (
                <p
                  id="card-name-error"
                  role="alert"
                  className="-mt-2 text-[13px] text-destructive"
                >
                  {validationError}
                </p>
              )}
              <Field label="Phone">
                <input
                  value={draft.phone ?? ''}
                  onChange={(event) =>
                    updateDraft({ ...draft, phone: event.target.value })
                  }
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={100}
                  placeholder="+1 415 555 0142"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>
              <Field label="Email">
                <input
                  value={draft.email ?? ''}
                  onChange={(event) =>
                    updateDraft({ ...draft, email: event.target.value })
                  }
                  inputMode="email"
                  autoComplete="email"
                  maxLength={320}
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>

              <button
                type="button"
                onClick={() => setExtraDetailsOpen((open) => !open)}
                aria-expanded={extraDetailsOpen}
                className="glass-button pressable flex min-h-12 items-center justify-between rounded-2xl px-4 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-[var(--ink-strong)]">
                    Add role and company
                  </span>
                  <span className="block text-[12px] text-[var(--ink-secondary)]">
                    Optional professional context
                  </span>
                </span>
                <ChevronDown
                  className={`size-5 text-[var(--ink-tertiary)] transition-transform ${
                    extraDetailsOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {extraDetailsOpen && (
                <div className="flex flex-col gap-4 rounded-2xl border border-[var(--hairline)] bg-white/10 p-3.5">
                  <Field label="Role">
                    <input
                      value={draft.title ?? ''}
                      onChange={(event) =>
                        updateDraft({ ...draft, title: event.target.value })
                      }
                      placeholder="Design Lead"
                      autoComplete="organization-title"
                      maxLength={300}
                      className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                    />
                  </Field>
                  <Field label="Company">
                    <input
                      value={draft.company ?? ''}
                      onChange={(event) =>
                        updateDraft({ ...draft, company: event.target.value })
                      }
                      placeholder="Linear"
                      autoComplete="organization"
                      maxLength={300}
                      className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                    />
                  </Field>
                </div>
              )}
              {cardSizeError && (
                <p role="alert" className="text-[13px] leading-relaxed text-destructive">
                  {cardSizeError}
                </p>
              )}
            </div>
          ) : profile ? (
            <div className="flex flex-col items-center">
              <div className="primary-action w-full rounded-3xl p-6">
                <div className="flex items-center gap-4">
                  {profile.photoUrl ? (
                    <Image
                      src={profile.photoUrl}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized
                      className="size-16 rounded-full object-cover ring-2 ring-primary-foreground/20"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary-foreground/15 font-serif text-2xl font-medium">
                      {initials(profile.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-heading text-2xl font-semibold leading-tight">
                      {profile.name}
                    </p>
                    {roleLine && (
                      <p className="truncate text-[14px] text-primary-foreground/80">
                        {roleLine}
                      </p>
                    )}
                  </div>
                </div>

                {(profile.phone || profile.email) && (
                  <div className="mt-4 space-y-1 border-t border-primary-foreground/15 pt-4 text-[13px] text-primary-foreground/85">
                    {profile.phone && <p className="truncate">{profile.phone}</p>}
                    {profile.email && <p className="truncate">{profile.email}</p>}
                  </div>
                )}

                <div className="glass-card mt-5 flex flex-col items-center gap-2 rounded-2xl bg-white/90 p-4">
                  {qrStatus === 'ready' && qr ? (
                    <Image
                      src={qr}
                      alt={`QR code linking to ${profile.name}'s FollowApp card`}
                      width={192}
                      height={192}
                      unoptimized
                      className="size-48"
                    />
                  ) : qrStatus === 'error' || qrStatus === 'too-large' ? (
                    <div className="flex min-h-48 w-full flex-col items-center justify-center gap-3 text-center text-[var(--ink-secondary)]">
                      <AlertCircle className="size-6" aria-hidden />
                      <p className="max-w-56 text-[13px] leading-relaxed">
                        {qrStatus === 'too-large'
                          ? 'Edit and shorten the name or details for a reliable QR scan.'
                          : 'Could not create your QR code.'}
                      </p>
                      {qrStatus === 'error' && (
                        <button
                          type="button"
                          onClick={() => setQrAttempt((attempt) => attempt + 1)}
                          className="glass-button pressable flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-strong)]"
                        >
                          <RotateCcw className="size-4" />
                          Try again
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex size-48 items-center justify-center" aria-hidden>
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <QrCode className="size-3.5" />
                    Scan with FollowApp or any camera
                  </p>
                </div>
              </div>

              {!hasCardDetails(profile) && (
                <p className="mt-4 text-pretty text-center text-[13px] leading-relaxed text-muted-foreground">
                  Add your role, company, and contact details so a scan saves the
                  full picture.
                </p>
              )}
              <p className="mt-4 text-pretty text-center text-[11.5px] leading-relaxed text-[var(--ink-tertiary)]">
                Anyone who scans this QR or receives its link can view and save
                the details shown on this card. Shared copies do not expire
                automatically, so share only the fields you want to make public.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Loader2 className="size-7 animate-spin text-[var(--ink-strong)]" />
              <p className="text-[14px] font-medium text-[var(--ink-strong)]">
                Getting your card…
              </p>
            </div>
          )}

          {(saveNotice || shareError || (loadingProfile && profile)) && (
            <p
              role="status"
              className="mt-4 text-pretty text-center text-[12px] leading-relaxed text-[var(--ink-secondary)]"
            >
              {shareError ??
                saveNotice ??
                (loadingProfile ? 'Checking for newer card details…' : null)}
            </p>
          )}
        </div>

        <footer className="relative z-[1] flex gap-2 border-t border-[var(--hairline)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          {editing ? (
            <button
              type="button"
              onClick={persist}
              disabled={saving}
              className="primary-action pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {saving ? 'Saving…' : profile ? 'Save changes' : 'Create my card'}
            </button>
          ) : profile ? (
            <>
              <button
                type="button"
                onClick={() => {
                  // Protect this explicit edit from a profile GET that was
                  // already in flight when the user opened the form.
                  draftDirtyRef.current = true
                  setDraft(profile)
                  setExtraDetailsOpen(Boolean(profile.title || profile.company))
                  setValidationError(null)
                  setEditing(true)
                }}
                disabled={saving}
                className="glass-button pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-[var(--ink-strong)] disabled:opacity-60"
              >
                <Pencil className="size-4" />
                Edit
              </button>
              <button
                type="button"
                onClick={share}
                disabled={sharing}
                className="primary-action pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-60"
              >
                {sharing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : shareOutcome ? (
                  <Check className="size-4" />
                ) : (
                  <Share2 className="size-4" />
                )}
                {sharing
                  ? 'Preparing…'
                  : shareOutcome === 'copied'
                    ? 'Link copied'
                    : shareOutcome === 'shared'
                      ? 'Shared'
                      : 'Share'}
              </button>
            </>
          ) : null}
        </footer>
      </div>
    </div>,
    portalRoot,
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-1 text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
