'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Camera,
  Loader2,
  Smartphone,
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
  ArrowRight,
  QrCode,
  Lightbulb,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import type { NewContactInput } from '@/lib/contacts-store'
import type {
  Contact,
  EnrichmentHook,
  NextStepKind,
  Tier,
} from '@/lib/types'
import {
  captureImageDataUrl,
  chooseImageDataUrl,
  isNativePermissionDeniedError,
  isNativeUserCancelError,
  openAppSettings,
  tapFeedback,
} from '@/lib/native'
import { NativeContactSaveButton } from '@/components/native-contact-save-button'
import { todayDateInputValue, toDateInputValue } from '@/lib/contact-dates'
import { isDeliverableEmail } from '@/lib/contact-validation'
import { getDeviceId } from '@/lib/device-id'
import {
  beginCameraLaunch,
  cancelCameraLaunch,
  createCameraLaunchState,
  finishCameraLaunch,
  isCameraLaunchActive,
  SCAN_CARD_CLIENT_TIMEOUT_MS,
  SCAN_REVIEW_FIELD_KEYS,
  countScanReviewCorrections,
  normalizeScanReviewFields,
  scanFieldNeedsReview,
  scanQualityNotice,
  scanReadingStatus,
  type ScanCardField,
  type ScanImageQuality,
} from '@/lib/camera-launch'
import { trackProductEvent } from '@/lib/product-analytics'
import {
  parseBusinessCardLines,
  preliminaryBusinessCardFieldCount,
  nativeRecognitionWithin,
  reconcileBusinessCardExtractions,
  recognizeNativeBusinessCard,
} from '@/lib/native-card-ocr'
import { cn } from '@/lib/utils'
import {
  createEncounterCapture,
  NEXT_STEP_OPTIONS,
  type ConferenceSession,
} from '@/lib/encounters'
import { ENCOUNTER_LIMITS } from '@/lib/persistence-limits'
import { runViewTransition } from '@/lib/view-transition'

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

interface ScanReviewMeta {
  needsReview: ScanCardField[]
  imageQuality: ScanImageQuality
  qualityNote: string
}

const EMPTY: ScannedCard = {
  name: '',
  title: '',
  company: '',
  phone: '',
  email: '',
  website: '',
}

const EMPTY_REVIEW_META: ScanReviewMeta = {
  needsReview: [],
  imageQuality: 'unknown',
  qualityNote: '',
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

function dueDateFromToday(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return toDateInputValue(date)
}

export function ScanCardSheet({
  open,
  onClose,
  onAdd,
  onOpenContact,
  onTrySample,
  onShowCard,
  onFinishCapture,
  autoLaunchCamera = false,
  initialImageDataUrl = null,
  onInitialImageConsumed,
  variant = 'standard',
  conferenceSession = null,
  stayAfterSave = false,
}: {
  open: boolean
  onClose: () => void
  onAdd: (input: NewContactInput) => Contact | void
  onOpenContact?: (contactId: string) => void
  onTrySample?: () => void
  onShowCard?: () => void
  onFinishCapture?: (contactId: string) => void
  autoLaunchCamera?: boolean
  initialImageDataUrl?: string | null
  onInitialImageConsumed?: () => void
  variant?: 'standard' | 'onboarding'
  conferenceSession?: ConferenceSession | null
  stayAfterSave?: boolean
}) {
  const [stage, setStage] = useState<Stage>('capture')
  const [card, setCard] = useState<ScannedCard>(EMPTY)
  const [tier, setTier] = useState<Tier>('network')
  const [lastContactedAt, setLastContactedAt] = useState('')
  const [note, setNote] = useState('')
  const [memorySeed, setMemorySeed] = useState('')
  const [nextStepKind, setNextStepKind] = useState<NextStepKind | undefined>()
  const [nextStepDueOn, setNextStepDueOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedToPhone, setSavedToPhone] = useState(false)
  const [contextStatus, setContextStatus] = useState<ContextStatus>('idle')
  const [contextNotes, setContextNotes] = useState<ContextNote[]>([])
  const [cameraHelp, setCameraHelp] = useState<CameraPermissionHelp>(null)
  const [isOpeningCamera, setIsOpeningCamera] = useState(false)
  const [showScanDetails, setShowScanDetails] = useState(false)
  const [showReviewDetails, setShowReviewDetails] = useState(false)
  const [reviewSource, setReviewSource] = useState<ReviewSource>('scan')
  const [reviewMeta, setReviewMeta] = useState<ScanReviewMeta>(EMPTY_REVIEW_META)
  const [readingElapsedMs, setReadingElapsedMs] = useState(0)
  const [cloudScanPending, setCloudScanPending] = useState(false)
  const [addedContactId, setAddedContactId] = useState<string | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const modalRootRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const cameraFileRef = useRef<HTMLInputElement>(null)
  const photoFileRef = useRef<HTMLInputElement>(null)
  const cameraButtonRef = useRef<HTMLButtonElement>(null)
  const didAutoLaunchRef = useRef(false)
  const consumedInitialImageRef = useRef<string | null>(null)
  const cameraLaunchRef = useRef(createCameraLaunchState())
  const originalScanRef = useRef<ScannedCard | null>(null)
  const editedScanFieldsRef = useRef(new Set<keyof ScannedCard>())
  const didTrackOpenRef = useRef(false)
  const scanAbortRef = useRef<AbortController | null>(null)
  const operationRef = useRef(0)
  const submitGuardRef = useRef(false)
  const openRef = useRef(open)
  const conferenceMode = conferenceSession?.active === true
  useEffect(() => {
    openRef.current = open
    if (!open) {
      operationRef.current += 1
      cancelCameraLaunch(cameraLaunchRef.current)
      setIsOpeningCamera(false)
      consumedInitialImageRef.current = null
    }
  }, [open])

  useEffect(() => {
    setPortalRoot(document.body)
  }, [])

  useEffect(() => {
    if (!open) {
      didTrackOpenRef.current = false
      return
    }
    if (didTrackOpenRef.current) return
    didTrackOpenRef.current = true
    trackProductEvent('scan_open', {
      entry_point: variant,
      auto_launch: autoLaunchCamera,
      native: Capacitor.isNativePlatform(),
    })
  }, [autoLaunchCamera, open, variant])

  useEffect(() => {
    if (stage !== 'reading') {
      setReadingElapsedMs(0)
      return
    }
    const startedAt = performance.now()
    const updateElapsed = () => setReadingElapsedMs(performance.now() - startedAt)
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 500)
    return () => window.clearInterval(timer)
  }, [stage])

  const reset = () => {
    operationRef.current += 1
    cancelCameraLaunch(cameraLaunchRef.current)
    scanAbortRef.current?.abort()
    scanAbortRef.current = null
    setStage('capture')
    setCard(EMPTY)
    setTier('network')
    setLastContactedAt('')
    setNote('')
    setMemorySeed('')
    setNextStepKind(undefined)
    setNextStepDueOn('')
    setError(null)
    setSavedToPhone(false)
    setContextStatus('idle')
    setContextNotes([])
    setCameraHelp(null)
    setIsOpeningCamera(false)
    setShowScanDetails(false)
    setShowReviewDetails(false)
    setReviewSource('scan')
    setReviewMeta(EMPTY_REVIEW_META)
    setReadingElapsedMs(0)
    setCloudScanPending(false)
    setAddedContactId(null)
    submitGuardRef.current = false
    originalScanRef.current = null
    editedScanFieldsRef.current.clear()
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
    const hasUnconsumedInitialImage = Boolean(
      initialImageDataUrl &&
        consumedInitialImageRef.current !== initialImageDataUrl,
    )
    if (
      (!autoLaunchCamera && !hasUnconsumedInitialImage) ||
      !portalRoot ||
      !Capacitor.isNativePlatform()
    ) {
      return
    }
    // A Lock Screen image can arrive after this sheet has already attempted a
    // live scan. Let that new image override the one-shot gate, then retry as
    // soon as any camera controller already in flight has finished.
    if (isOpeningCamera) return
    if (didAutoLaunchRef.current && !hasUnconsumedInitialImage) return
    const cameraButton = cameraButtonRef.current
    if (!cameraButton) return
    didAutoLaunchRef.current = true
    cameraButton.click()
  }, [
    autoLaunchCamera,
    initialImageDataUrl,
    isOpeningCamera,
    open,
    portalRoot,
  ])

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

  const readCardImage = async (
    image: string,
    operation: number,
    captureSource: 'native_camera' | 'camera_file' | 'photo_library',
  ) => {
    if (!openRef.current || operationRef.current !== operation) return
    const scanStartedAt = performance.now()
    setError(null)
    setSavedToPhone(false)
    setReviewSource('scan')
    setReviewMeta(EMPTY_REVIEW_META)
    setCloudScanPending(false)
    setNote('')
    originalScanRef.current = null
    editedScanFieldsRef.current.clear()
    setStage('reading')
    trackProductEvent('capture', {
      source: captureSource,
      approximate_kb: Math.round((image.length * 0.75) / 1024),
    })

    // Start local and cloud recognition together. Event Mode previously waited
    // indefinitely for the native bridge and could accept a heuristic preview
    // without the stronger extraction ever running.
    const nativeRecognition = recognizeNativeBusinessCard(image).catch(() => null)

    // Native Vision is a fast preview, not a source of certainty. It runs in
    // parallel with the cloud extraction and lets users start reviewing while
    // the richer result is still in flight. Older builds return null here.
    let preliminaryCard: ScannedCard | null = null
    let preliminaryConfidence: number | undefined
    let cloudFinished = false
    let cloudSucceeded = false
    const preliminaryStartedAt = performance.now()
    void nativeRecognition.then((recognition) => {
      if (
        !recognition ||
        cloudSucceeded ||
        !openRef.current ||
        operationRef.current !== operation
      ) {
        return
      }
      const preview = parseBusinessCardLines(recognition.lines)
      const fieldCount = preliminaryBusinessCardFieldCount(preview)
      if (fieldCount === 0) return
      preliminaryCard = preview
      preliminaryConfidence = recognition.averageConfidence
      const editedFields = new Set(editedScanFieldsRef.current)
      setCard((current) => {
        const merged = { ...preview }
        for (const field of editedFields) merged[field] = current[field]
        originalScanRef.current = preview
        return merged
      })
      setReviewMeta({
        needsReview: SCAN_REVIEW_FIELD_KEYS.filter((field) =>
          preview[field].trim() && !editedFields.has(field),
        ),
        imageQuality: 'unknown',
        qualityNote: '',
      })
      setReviewSource('scan')
      setContextStatus('idle')
      setCloudScanPending(!cloudFinished)
      setError(
        cloudFinished
          ? 'Quick scan ready. The full check was unavailable, so review the highlighted details.'
          : null,
      )
      setStage('review')
      trackProductEvent('ocr_preliminary', {
        outcome: 'success',
        latency_ms: Math.round(performance.now() - preliminaryStartedAt),
        filled_field_count: fieldCount,
        average_confidence: recognition.averageConfidence,
      })
    })

    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller
    let clientTimedOut = false
    const timeout = window.setTimeout(() => {
      clientTimedOut = true
      controller.abort()
    }, SCAN_CARD_CLIENT_TIMEOUT_MS)
    try {
      const deviceId = getDeviceId()
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(deviceId ? { 'X-FollowApp-Device-Id': deviceId } : {}),
        },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      })
      const data = (await res.json()) as Partial<ScannedCard> & {
        status?: string
        needsReview?: unknown
        imageQuality?: ScanImageQuality
        qualityNote?: string
      }
      if (!openRef.current || operationRef.current !== operation) return

      if (data.status !== 'ok') {
        cloudFinished = true
        setCloudScanPending(false)
        if (preliminaryCard) {
          setError(
            'Quick scan ready. The full check was unavailable, so review the highlighted details.',
          )
        } else {
          // Rate-limited or failed: drop into manual review, never a dead end.
          setError(
            data.status === 'timeout'
              ? 'This card took too long to read. Add the essentials now, or rescan.'
              : "Couldn't read that one — add the details by hand.",
          )
          setCard(EMPTY)
          setReviewMeta(EMPTY_REVIEW_META)
          setReviewSource('manual')
          setContextStatus('empty')
        }
        setStage('review')
        trackProductEvent('ocr_result', {
          outcome: data.status ?? 'unavailable',
          latency_ms: Math.round(performance.now() - scanStartedAt),
          source: captureSource,
        })
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
      // If the network happened to win the race, give fast on-device Vision a
      // short grace period so a cloud blank cannot erase its phone/email. This
      // remains bounded: a stuck native bridge can never strand the scan.
      if (!preliminaryCard) {
        const lateRecognition = await nativeRecognitionWithin(
          nativeRecognition,
          1_500,
        )
        if (!openRef.current || operationRef.current !== operation) return
        if (lateRecognition) {
          const latePreview = parseBusinessCardLines(lateRecognition.lines)
          if (preliminaryBusinessCardFieldCount(latePreview) > 0) {
            preliminaryCard = latePreview
            preliminaryConfidence = lateRecognition.averageConfidence
          }
        }
      }
      const modelNeedsReview = normalizeScanReviewFields(data.needsReview)
      const reconciled = reconcileBusinessCardExtractions(
        scanned,
        preliminaryCard,
        preliminaryConfidence,
      )
      const needsReview = [
        ...new Set([...modelNeedsReview, ...reconciled.reviewFields]),
      ]
      const imageQuality: ScanImageQuality =
        data.imageQuality === 'clear' ||
        data.imageQuality === 'usable' ||
        data.imageQuality === 'poor'
          ? data.imageQuality
          : 'unknown'
      cloudFinished = true
      cloudSucceeded = true
      setCloudScanPending(false)
      const editedFields = new Set(editedScanFieldsRef.current)
      setCard((current) => {
        const merged = { ...reconciled.card }
        const baseline = { ...reconciled.card }
        if (preliminaryCard) {
          for (const field of editedFields) {
            merged[field] = current[field]
            baseline[field] = preliminaryCard[field]
          }
        }
        originalScanRef.current = baseline
        return merged
      })
      setReviewMeta({
        needsReview: needsReview.filter((field) => !editedFields.has(field)),
        imageQuality,
        qualityNote: data.qualityNote?.trim().slice(0, 160) ?? '',
      })
      if (!reconciled.card.name && !reconciled.card.company) {
        setError("Couldn't read much — check the details below.")
      } else {
        setError(null)
      }
      setStage('review')
      // Public enrichment is optional detail, not part of the critical path.
      // It starts only if the user expands More details and explicitly asks.
      setContextStatus('idle')
      trackProductEvent('ocr_result', {
        outcome: 'success',
        latency_ms: Math.round(performance.now() - scanStartedAt),
        source: captureSource,
        image_quality: imageQuality,
        filled_field_count: SCAN_REVIEW_FIELD_KEYS.filter((field) =>
          reconciled.card[field].trim(),
        ).length,
        review_field_count: needsReview.length,
      })
    } catch (err) {
      if (!openRef.current || operationRef.current !== operation) return
      cloudFinished = true
      setCloudScanPending(false)
      console.error('[v0] Card capture failed:', err)
      if (preliminaryCard) {
        setError(
          'Quick scan ready. The full check was unavailable, so review the highlighted details.',
        )
      } else {
        setError(
          clientTimedOut
            ? 'Reading took too long. Add the essentials now, or rescan.'
            : 'Something went wrong reading the photo — add the details by hand.',
        )
        setCard(EMPTY)
        setReviewMeta(EMPTY_REVIEW_META)
        setReviewSource('manual')
        setContextStatus('empty')
      }
      setStage('review')
      trackProductEvent('ocr_result', {
        outcome: clientTimedOut ? 'client_timeout' : 'error',
        latency_ms: Math.round(performance.now() - scanStartedAt),
        source: captureSource,
      })
    } finally {
      window.clearTimeout(timeout)
      if (scanAbortRef.current === controller) scanAbortRef.current = null
    }
  }

  const handleNativeCamera = async () => {
    const native = Capacitor.isNativePlatform()
    if (!native) {
      // Browser/iOS Safari requires the file picker to be opened directly from
      // the user's tap. If we await the native-camera checks first, the browser
      // can treat it as no longer user-initiated and silently block it.
      trackProductEvent('camera_visible', {
        source: 'browser_file_camera',
        outcome: 'requested',
      })
      cameraFileRef.current?.click()
      return
    }

    // Effects and taps can arrive in the same render frame. React state is not
    // a synchronous mutex, so keep a ref-backed gate around the entire native
    // call. One user action must never create two competing camera controllers.
    const cameraAttempt = beginCameraLaunch(cameraLaunchRef.current)
    if (cameraAttempt === null) return
    // Do not invalidate the current scan merely because the replacement camera
    // opened. If the user cancels, its cloud verifier must remain able to
    // finish instead of leaving "Checking the photo" stranded forever.
    let operation = operationRef.current
    const stageAtLaunch = stage
    const startedAt = performance.now()
    if (stageAtLaunch !== 'review') setError(null)
    setCameraHelp(null)
    setIsOpeningCamera(true)
    try {
      const lockedCapture =
        initialImageDataUrl &&
        consumedInitialImageRef.current !== initialImageDataUrl
          ? initialImageDataUrl
          : null

      if (lockedCapture) {
        // The Lock Screen capture extension has already taken the photo. Mark
        // it consumed before decoding so a parent rerender cannot replay it.
        consumedInitialImageRef.current = lockedCapture
        onInitialImageConsumed?.()
        trackProductEvent('camera_visible', {
          source: 'locked_camera_capture',
          outcome: 'handoff',
        })
        const normalizedImage = await normalizeDataUrl(lockedCapture)
        if (!openRef.current || operationRef.current !== operation) return
        operation = ++operationRef.current
        setStage('reading')
        await readCardImage(
          normalizedImage,
          operation,
          'native_camera',
        )
        return
      }

      // Keep the physical-camera transition as the only native presentation
      // on this tap. A live VisionKit scanner previously ran first and could
      // stay pending indefinitely, preventing the maintained Capacitor camera
      // from ever opening. On-device Vision OCR still runs immediately after
      // the captured still reaches readCardImage().
      const capture = captureImageDataUrl()
      trackProductEvent('camera_visible', {
        source: 'native_camera',
        outcome: 'bridge_handoff',
      })
      const image = await capture
      if (!openRef.current || operationRef.current !== operation) return
      if (!image) throw new Error('Camera returned no photo.')
      operation = ++operationRef.current

      // Native adapters already return a bounded JPEG. Change the visible state
      // before any upload work so users never remain stuck on “Opening camera”.
      setStage('reading')
      console.info('[followapp:scan]', {
        // Includes framing/shutter time; native logs cover controller launch.
        event: 'camera_capture_round_trip',
        elapsedMs: Math.round(performance.now() - startedAt),
      })
      trackProductEvent('camera_permission_outcome', {
        outcome: 'granted',
      })
      await readCardImage(image, operation, 'native_camera')
    } catch (err) {
      if (!openRef.current || operationRef.current !== operation) return
      if (isNativePermissionDeniedError(err)) {
        trackProductEvent('camera_permission_outcome', {
          outcome: 'denied',
        })
        setCameraHelp('blocked')
        if (stageAtLaunch !== 'review') setStage('capture')
      } else if (isNativeUserCancelError(err)) {
        trackProductEvent('camera_permission_outcome', {
          outcome: 'cancelled',
        })
      } else {
        trackProductEvent('camera_permission_outcome', {
          outcome: 'unavailable',
        })
        console.error('[v0] Native card capture failed:', err)
        setError('Camera did not open. Try again, or choose a photo instead.')
        setCameraHelp('unavailable')
        if (stageAtLaunch !== 'review') setStage('capture')
      }
    } finally {
      // Camera ownership is independent from scan/upload operations. Clearing
      // the spinner against the generic operation token caused the old UI to
      // remain stuck whenever another action changed that token mid-launch.
      if (finishCameraLaunch(cameraLaunchRef.current, cameraAttempt)) {
        if (openRef.current) setIsOpeningCamera(false)
      }
    }
  }

  const handleChoosePhoto = async () => {
    if (isCameraLaunchActive(cameraLaunchRef.current)) return
    // Like Rescan, opening Photos is not itself a replacement. Keep the
    // current verifier alive unless the user actually returns an image.
    let operation = operationRef.current
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
      const normalizedImage = await normalizeDataUrl(image)
      if (!openRef.current || operationRef.current !== operation) return
      operation = ++operationRef.current
      setCameraHelp(null)
      await readCardImage(
        normalizedImage,
        operation,
        'photo_library',
      )
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
    if (isCameraLaunchActive(cameraLaunchRef.current)) return
    await tapFeedback()
    setError(null)
    setCameraHelp(null)
    setCard(EMPTY)
    setReviewMeta(EMPTY_REVIEW_META)
    setCloudScanPending(false)
    originalScanRef.current = null
    editedScanFieldsRef.current.clear()
    setNote('')
    setContextStatus('empty')
    setReviewSource('manual')
    setStage('review')
  }

  const handleCancelReading = () => {
    operationRef.current += 1
    scanAbortRef.current?.abort()
    scanAbortRef.current = null
    setCard(EMPTY)
    setReviewMeta(EMPTY_REVIEW_META)
    setCloudScanPending(false)
    originalScanRef.current = null
    editedScanFieldsRef.current.clear()
    setNote('')
    setError('Enter the essentials below. You can rescan at any time.')
    setContextStatus('empty')
    setReviewSource('manual')
    setStage('review')
    trackProductEvent('ocr_result', {
      outcome: 'user_cancelled',
      latency_ms: Math.round(readingElapsedMs),
    })
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = e.target.files?.[0]
    if (!file) return
    let operation = operationRef.current
    try {
      const image = await downscale(file)
      if (!openRef.current || operationRef.current !== operation) return
      operation = ++operationRef.current
      await readCardImage(
        image,
        operation,
        input === cameraFileRef.current ? 'camera_file' : 'photo_library',
      )
    } catch (fileError) {
      if (!openRef.current || operationRef.current !== operation) return
      console.error('[v0] Selected card photo could not be decoded:', fileError)
      setError('That photo could not be read. Choose another one or enter the details by hand.')
    } finally {
      input.value = ''
    }
  }

  const update = (key: keyof ScannedCard, value: string) => {
    editedScanFieldsRef.current.add(key)
    setCard((prev) => ({ ...prev, [key]: value }))
    // A previously saved native contact contains the pre-edit values. Let the
    // user explicitly save the corrected version and keep funnel data honest.
    setSavedToPhone(false)
    setReviewMeta((previous) => ({
      ...previous,
      needsReview: previous.needsReview.filter((field) => field !== key),
    }))
  }

  const toggleContext = (id: string) => {
    setContextNotes((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, accepted: !item.accepted } : item,
      ),
    )
  }

  const submit = () => {
    if (!card.name.trim() || submitGuardRef.current) return
    submitGuardRef.current = true
    // A user can save the fast native preview while the cloud verifier is
    // still running. The save is authoritative: invalidate that continuation
    // so it cannot pull the UI back from "captured" into review.
    operationRef.current += 1
    scanAbortRef.current?.abort()
    scanAbortRef.current = null
    setCloudScanPending(false)
    const titleAndCompany = [card.title, card.company].filter(Boolean).join(' · ')
    const relationship =
      conferenceMode && conferenceSession
        ? `Met at ${conferenceSession.name}`
        : card.company.trim() || card.title.trim()
        ? `Met ${card.company ? `at ${card.company}` : 'through work'}`
        : 'New connection'
    const acceptedNotes = contextNotes.filter((item) => item.accepted)
    const contextParts = [
      note.trim(),
      card.website.trim() ? `Website on card: ${card.website.trim()}` : '',
      ...acceptedNotes
        .filter((item) => item.id !== 'card-website')
        .map((item) => `${item.text} (${item.source})`),
    ].filter(Boolean)
    const encounter = createEncounterCapture({
      captureMethod: reviewSource === 'manual' ? 'manual' : 'card-scan',
      session: conferenceSession,
      memorySeed,
      nextStepKind,
      dueOn: nextStepDueOn,
    })
    let added: Contact | void
    try {
      added = onAdd({
        name: card.name,
        relationship,
        title: titleAndCompany || undefined,
        tier,
        lastContactedAt: lastContactedAt || null,
        phone: card.phone || undefined,
        email: card.email || undefined,
        context: contextParts.join('\n') || undefined,
        interests: [],
        encounters: [encounter],
      })
    } catch (saveError) {
      console.error('[v0] Captured contact could not be saved:', saveError)
      submitGuardRef.current = false
      setError('The card is still here, but it could not be saved. Please try again.')
      return
    }
    const contactId = added?.id ?? null
    const correctionCount = countScanReviewCorrections(
      originalScanRef.current,
      card,
    )
    if (
      contactId &&
      onOpenContact &&
      !conferenceMode &&
      !stayAfterSave
    ) {
      trackProductEvent('draft_open', {
        source: reviewSource,
        correction_count: correctionCount,
        saved_to_contacts: savedToPhone,
        has_delivery_channel: hasDeliveryChannel,
      })
      close()
      onOpenContact(contactId)
      return
    }
    const showAddedState = () => {
      setAddedContactId(contactId)
      setStage('added')
    }
    if (conferenceMode) runViewTransition(showAddedState)
    else showAddedState()
  }

  const finishAdded = () => {
    const contactId = addedContactId
    trackProductEvent('draft_open', {
      source: reviewSource,
      correction_count: countScanReviewCorrections(originalScanRef.current, card),
      saved_to_contacts: savedToPhone,
      has_delivery_channel: hasDeliveryChannel,
    })
    close()
    if (contactId) onOpenContact?.(contactId)
  }

  const finishCapture = () => {
    const contactId = addedContactId
    close()
    if (contactId) onFinishCapture?.(contactId)
  }

  const scanAnother = () => {
    reset()
    // Keep this directly inside the tap handler. Browser camera inputs and the
    // native bridge both require a live user gesture for reliable relaunch.
    void handleNativeCamera()
  }

  const showOwnCard = () => {
    close()
    onShowCard?.()
  }

  const hasDeliveryChannel =
    looksLikePhone(card.phone) || isDeliverableEmail(card.email)
  const fieldsNeedingReview = SCAN_REVIEW_FIELD_KEYS.filter((field) =>
    scanFieldNeedsReview(field, card[field], reviewMeta.needsReview),
  )
  const reviewQualityNotice =
    reviewSource === 'scan'
      ? scanQualityNotice(
          reviewMeta.imageQuality,
          fieldsNeedingReview.length,
          reviewMeta.qualityNote,
        )
      : null
  const readingStatus = scanReadingStatus(readingElapsedMs)
  const selectedCadence =
    TIER_OPTIONS.find((option) => option.value === tier)?.label ??
    'Every 6 weeks'

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
        aria-labelledby="scan-card-sheet-title"
        aria-describedby="scan-card-sheet-announcement"
        tabIndex={-1}
        className="relative isolate flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] text-[var(--ink-body)] shadow-xl outline-none"
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
                ? conferenceMode
                  ? `${card.name || 'This person'} is saved in your conference inbox.`
                  : `${hasDeliveryChannel ? 'Follow-up' : 'Draft'} for ${card.name || 'this contact'} is ready.`
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
                ? conferenceMode
                  ? `Remember ${card.name.trim().split(' ')[0] || 'this meeting'}`
                  : reviewSource === 'manual'
                    ? 'Add contact details'
                    : 'Check the essentials'
                : stage === 'added'
                  ? conferenceMode
                    ? 'Person captured'
                    : hasDeliveryChannel
                    ? 'Follow-up ready'
                    : 'Draft ready'
                  : variant === 'onboarding'
                    ? 'Turn a card into a follow-up'
                    : 'Scan a business card'}
            </h2>
            {stage === 'review' && (
              <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
                {conferenceMode
                  ? 'One human detail and any promise. Then capture the next person.'
                  : reviewSource === 'manual'
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
                    Fill the frame, hold steady, and avoid glare. You review
                    every detail before anything is saved.
                  </p>
                </div>
              </div>

              {cameraHelp ? (
                <CameraPermissionCard
                  kind={cameraHelp}
                  busy={isOpeningCamera}
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
                    disabled={isOpeningCamera}
                    className="glass-button pressable min-h-11 w-full rounded-full text-sm font-semibold text-[var(--ink-strong)] disabled:opacity-50"
                  >
                    Choose a photo
                  </button>
                </div>
              )}

              <div className="flex w-full flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={handleManualEntry}
                  disabled={isOpeningCamera}
                  className="pressable min-h-11 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-secondary)] disabled:opacity-50"
                >
                  Enter manually
                </button>
                {onTrySample && (
                  <button
                    type="button"
                    onClick={onTrySample}
                    disabled={isOpeningCamera}
                    className="pressable min-h-11 rounded-full px-4 text-[13px] font-semibold text-[var(--ink-secondary)] disabled:opacity-50"
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
                {readingStatus.title}
              </p>
              <p className="text-[12px] text-[var(--ink-secondary)]">
                {readingStatus.detail}
              </p>
              {readingStatus.canEnterManually && (
                <button
                  type="button"
                  onClick={handleCancelReading}
                  className="glass-button pressable mt-2 min-h-11 rounded-full px-5 text-[13px] font-semibold text-[var(--ink-strong)]"
                >
                  Enter details instead
                </button>
              )}
            </div>
          )}

          {stage === 'added' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--status-on-track-tint)] text-[var(--status-on-track)]">
                <Check className="size-7" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-lg font-semibold text-[var(--ink-strong)]">
                  {conferenceMode
                    ? `${card.name.trim().split(' ')[0]} is in your conference inbox`
                    : `${hasDeliveryChannel ? 'Your follow-up to' : 'Your draft for'} ${card.name.trim().split(' ')[0]} is ready`}
                </p>
                <p className="mt-1 text-pretty text-sm text-[var(--ink-secondary)]">
                  {conferenceMode
                    ? memorySeed || nextStepKind
                      ? 'Your clue and next step are saved. Keep meeting people.'
                      : 'Saved now. Add context later when the rush is over.'
                    : hasDeliveryChannel
                    ? 'We used the card details to prepare an editable message.'
                    : 'Add a phone or email next, or copy the draft anywhere.'}
                </p>
              </div>
              {conferenceMode ? (
                <div className="w-full">
                  <div
                    data-transition-element="captured-person"
                    className="mb-4 rounded-3xl bg-card p-4 text-left shadow-sm ring-1 ring-black/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--avatar-ghost-bg)] text-sm font-bold text-[var(--avatar-ghost-fg)]">
                        {card.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase() || '?'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold text-[var(--ink-strong)]">
                          {card.name}
                        </p>
                        <p className="truncate text-[13px] text-[var(--ink-secondary)]">
                          {[card.title, card.company].filter(Boolean).join(' · ') ||
                            `Met at ${conferenceSession?.name ?? 'this event'}`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 border-t border-border/70 pt-3 text-[13px]">
                      {memorySeed.trim() && (
                        <p className="flex items-start gap-2 text-[var(--ink-body)]">
                          <Lightbulb className="mt-0.5 size-4 shrink-0 text-[var(--status-due-soon)]" />
                          <span>{memorySeed.trim()}</span>
                        </p>
                      )}
                      {nextStepKind && (
                        <p className="flex items-start gap-2 font-medium text-[var(--ink-strong)]">
                          <Check className="mt-0.5 size-4 shrink-0 text-[var(--status-on-track)]" />
                          <span>
                            {NEXT_STEP_OPTIONS.find(
                              (option) => option.kind === nextStepKind,
                            )?.label ?? 'Follow up'}
                            {nextStepDueOn
                              ? ` · ${new Intl.DateTimeFormat(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                }).format(new Date(`${nextStepDueOn}T12:00:00`))}`
                              : ''}
                          </span>
                        </p>
                      )}
                      {!memorySeed.trim() && !nextStepKind && (
                        <p className="text-[var(--ink-secondary)]">
                          Safely captured. Add a memory in the event review later.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={scanAnother}
                    className="primary-action pressable flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
                  >
                    <ScanLine className="size-4" />
                    Scan next
                  </button>
                  {onShowCard && (
                    <button
                      type="button"
                      onClick={showOwnCard}
                      className="glass-button pressable flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)]"
                    >
                      <QrCode className="size-4" />
                      My QR
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={finishCapture}
                    className="pressable col-span-2 min-h-11 rounded-full px-4 text-sm font-semibold text-[var(--ink-secondary)]"
                  >
                    Done for now
                  </button>
                  </div>
                </div>
              ) : (
                <>
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
                  {onShowCard && (
                    <button
                      type="button"
                      onClick={showOwnCard}
                      className="pressable min-h-11 rounded-full px-4 text-sm font-semibold text-[var(--ink-secondary)]"
                    >
                      Show my QR instead
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {stage === 'review' && (
            <div className="flex flex-col gap-4">
              {error && (
                <p className="rounded-xl border border-[var(--hairline)] bg-white/20 px-3 py-2.5 text-[13px] text-[var(--ink-secondary)] text-pretty">
                  {error}
                </p>
              )}

              {cameraHelp && (
                <div className="flex items-center gap-2 rounded-2xl border border-[var(--hairline)] bg-white/20 p-2.5">
                  {cameraHelp === 'blocked' && (
                    <button
                      type="button"
                      onClick={handleOpenSettings}
                      className="glass-button pressable flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold text-[var(--ink-strong)]"
                    >
                      <Settings className="size-4" />
                      Open Settings
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleChoosePhoto}
                    className="glass-button pressable min-h-10 flex-1 rounded-full px-3 text-[13px] font-semibold text-[var(--ink-strong)]"
                  >
                    Choose a photo
                  </button>
                </div>
              )}

              {cloudScanPending && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-2xl border border-[var(--hairline)] bg-white/20 px-3.5 py-3 text-left text-[13px] leading-relaxed text-[var(--ink-secondary)]"
                >
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[var(--ink-strong)]" />
                  <span>
                    Quick preview ready. Checking the photo for a more complete
                    result…
                  </span>
                </div>
              )}

              {reviewQualityNotice && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--status-check-border)] bg-[var(--status-check-tint)] px-3.5 py-3 text-left text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--status-due-soon)]" />
                  <span>{reviewQualityNotice}</span>
                </div>
              )}

              <ParsedSummary
                card={card}
                onUpdate={update}
                manual={reviewSource === 'manual'}
                needsReview={reviewMeta.needsReview}
                transitionToCapturedPerson={conferenceMode}
              />

              {conferenceMode && (
                <section className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-black/[0.04]">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--avatar-ghost-bg)] text-[var(--avatar-ghost-fg)]">
                      <Lightbulb className="size-5" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--ink-strong)]">
                        1. What will bring this person back?
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                        A topic, personal detail or the moment you connected.
                      </p>
                    </div>
                  </div>
                  <textarea
                    aria-label="Memory clue from this meeting"
                    value={memorySeed}
                    onChange={(event) => setMemorySeed(event.target.value)}
                    maxLength={ENCOUNTER_LIMITS.memorySeed}
                    rows={2}
                    placeholder="Met after the food-tech panel; expanding into Rwanda."
                    className="mt-3 w-full resize-none rounded-2xl border border-border bg-secondary/45 px-3 py-2.5 text-base leading-relaxed text-[var(--ink-body)] outline-none placeholder:text-[var(--ink-tertiary)] focus-visible:border-[var(--action-bg)]"
                  />
                  <p className="mt-4 text-[13px] font-semibold text-[var(--ink-strong)]">
                    2. Did you promise anything?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {NEXT_STEP_OPTIONS.map((option) => (
                      <button
                        key={option.kind}
                        type="button"
                        onClick={() =>
                          setNextStepKind((current) =>
                            current === option.kind ? undefined : option.kind,
                          )
                        }
                        aria-pressed={nextStepKind === option.kind}
                        className={cn(
                          'pressable min-h-10 rounded-full border px-3 text-[12px] font-semibold',
                          nextStepKind === option.kind
                            ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)]'
                            : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                        )}
                      >
                        {option.shortLabel}
                      </button>
                    ))}
                  </div>
                  {nextStepKind && (
                    <div className="mt-3">
                      <span className="text-[12px] font-medium text-[var(--ink-secondary)]">
                        When should this happen?
                      </span>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[
                          ['Today', dueDateFromToday(0)],
                          ['Tomorrow', dueDateFromToday(1)],
                          ['Next week', dueDateFromToday(7)],
                        ].map(([label, value]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setNextStepDueOn(value)}
                            aria-pressed={nextStepDueOn === value}
                            className={cn(
                              'pressable min-h-10 rounded-xl border px-1.5 text-[11px] font-semibold',
                              nextStepDueOn === value
                                ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)]'
                                : 'border-border bg-secondary/50 text-[var(--ink-secondary)]',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="relative mt-2">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-tertiary)]" />
                        <input
                          type="date"
                          value={nextStepDueOn}
                          onInput={(event) =>
                            setNextStepDueOn(event.currentTarget.value)
                          }
                          className="h-11 w-full rounded-2xl border border-border bg-secondary/45 pl-10 pr-4 text-base text-[var(--ink-body)] outline-none"
                        />
                      </div>
                    </div>
                  )}
                </section>
              )}

              {!conferenceMode && <section className="glass-card rounded-3xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-tertiary)]">
                      Stay in touch
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
                      {selectedCadence}
                      {lastContactedAt
                        ? ' from the last-met date'
                        : ' · first message ready now'}
                    </p>
                  </div>
                </div>
                <div
                  className="mt-3 grid grid-cols-3 gap-2"
                  role="group"
                  aria-label="Follow-up cadence"
                >
                  {TIER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTier(option.value)}
                      aria-pressed={tier === option.value}
                      className={cn(
                        'pressable min-h-11 rounded-2xl border px-2 text-xs font-semibold transition-all',
                        tier === option.value
                          ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)] shadow-card'
                          : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>}

              {(!conferenceMode || showReviewDetails) && <section className="glass-card rounded-3xl p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/30 text-[var(--ink-secondary)]">
                    <Smartphone className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[var(--ink-strong)]">
                      Save to iPhone Contacts
                    </p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                      Optional · saves the details you reviewed above.
                    </p>
                  </div>
                </div>
                <NativeContactSaveButton
                  card={{
                    n: card.name,
                    t: card.title || undefined,
                    co: card.company || undefined,
                    p: card.phone || undefined,
                    e: card.email || undefined,
                    w: card.website || undefined,
                  }}
                  source="business_card"
                  idleLabel="Save to iPhone Contacts"
                  className="mt-3 min-h-11 text-[13px]"
                  disabled={!card.name.trim()}
                  onOutcome={(outcome) =>
                    setSavedToPhone(outcome === 'saved')
                  }
                />
              </section>}

              <button
                type="button"
                onClick={() => setShowReviewDetails((value) => !value)}
                aria-expanded={showReviewDetails}
                className="glass-button pressable flex min-h-11 w-full items-center justify-between rounded-2xl px-4 text-left text-[13px] font-semibold text-[var(--ink-secondary)]"
              >
                <span>{conferenceMode ? 'More options' : 'Add context or last-met date'}</span>
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
                          onInput={(event) =>
                            setLastContactedAt(event.currentTarget.value)
                          }
                          className="h-11 w-full rounded-2xl border border-[var(--hairline)] bg-white/25 pl-10 pr-4 text-base text-[var(--ink-body)] outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                        />
                      </div>
                      <span className="mt-1.5 block text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                        Leave blank for a new contact. They will be ready to
                        follow up now.
                      </span>
                    </label>
                  </section>
                </>
              )}

              <div className="flex items-center justify-start">
                <button
                  type="button"
                  onClick={handleNativeCamera}
                  disabled={isOpeningCamera}
                  className="pressable flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[var(--ink-secondary)] disabled:opacity-50"
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
            <p className="mb-2 text-center text-[12px] leading-relaxed text-[var(--ink-secondary)]">
              {conferenceMode
                ? `Saved to ${conferenceSession?.name ?? 'this event'}. You can change every detail later.`
                : 'Saves to FollowApp and opens an editable first message.'}
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={!card.name.trim()}
              className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-40"
            >
              <span>{conferenceMode ? 'Save memory' : 'Review message'}</span>
              <ArrowRight className="size-4" />
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
  busy,
  onRetryCamera,
  onOpenSettings,
  onChoosePhoto,
}: {
  kind: Exclude<CameraPermissionHelp, null>
  busy: boolean
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
          disabled={busy}
          className="primary-action pressable flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-button)] px-4 text-sm font-semibold disabled:opacity-50"
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
          disabled={busy}
          className="glass-button pressable flex min-h-11 items-center justify-center rounded-[var(--r-button)] px-4 text-sm font-semibold text-[var(--ink-strong)] disabled:opacity-50"
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
  needsReview,
  transitionToCapturedPerson,
}: {
  card: ScannedCard
  onUpdate: (key: keyof ScannedCard, value: string) => void
  manual: boolean
  needsReview: readonly ScanCardField[]
  transitionToCapturedPerson: boolean
}) {
  return (
    <section
      data-transition-element={
        transitionToCapturedPerson ? 'captured-person' : undefined
      }
      className="glass-hero overflow-hidden rounded-3xl px-4 py-0"
    >
      <EditableSummaryRow
        label="Full name"
        value={card.name}
        placeholder="Full name (required)"
        needsReview={
          !manual && scanFieldNeedsReview('name', card.name, needsReview)
        }
        autoComplete="name"
        required
        onChange={(value) => onUpdate('name', value)}
      />
      <EditableSummaryRow
        label="Role or title"
        value={card.title}
        placeholder="Role or job title"
        needsReview={
          !manual && scanFieldNeedsReview('title', card.title, needsReview)
        }
        autoComplete="organization-title"
        onChange={(value) => onUpdate('title', value)}
      />
      <EditableSummaryRow
        label="Company"
        value={card.company}
        placeholder="Company or organization"
        needsReview={
          !manual && scanFieldNeedsReview('company', card.company, needsReview)
        }
        autoComplete="organization"
        onChange={(value) => onUpdate('company', value)}
      />
      <EditableSummaryRow
        label="Mobile"
        value={card.phone}
        placeholder="Phone number"
        needsReview={
          !manual && scanFieldNeedsReview('phone', card.phone, needsReview)
        }
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        onChange={(value) => onUpdate('phone', value)}
      />
      <EditableSummaryRow
        label="Email"
        value={card.email}
        placeholder="Email address"
        needsReview={
          !manual && scanFieldNeedsReview('email', card.email, needsReview)
        }
        type="email"
        inputMode="email"
        autoComplete="email"
        onChange={(value) => onUpdate('email', value)}
      />
      <EditableSummaryRow
        label="Website"
        value={card.website}
        placeholder="Website or domain"
        needsReview={
          !manual && scanFieldNeedsReview('website', card.website, needsReview)
        }
        type="url"
        inputMode="url"
        autoComplete="url"
        onChange={(value) => onUpdate('website', value)}
      />
    </section>
  )
}

function EditableSummaryRow({
  label,
  value,
  placeholder,
  needsReview,
  type = 'text',
  inputMode,
  autoComplete,
  required = false,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  needsReview: boolean
  type?: 'text' | 'tel' | 'email' | 'url'
  inputMode?: 'text' | 'tel' | 'email' | 'url'
  autoComplete?: string
  required?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label
      className={cn(
        'grid gap-3 border-b border-[var(--hairline)] py-3 last:border-b-0',
        needsReview ? 'grid-cols-[1fr_auto]' : 'grid-cols-1',
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
      {needsReview && <ReviewBadge />}
    </label>
  )
}

function ReviewBadge() {
  return (
    <span
      className="mt-1 flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-[var(--status-check-tint)] px-2.5 text-[11.5px] font-semibold text-[var(--status-due-soon)]"
      style={{ borderColor: 'var(--status-check-border)' }}
    >
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
