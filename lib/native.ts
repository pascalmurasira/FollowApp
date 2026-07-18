import type { CardData } from './card'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { isNativeMethodUnavailableError } from './native-bridge.ts'

function isNativeRuntimeNow(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export async function isNativeRuntime(): Promise<boolean> {
  return isNativeRuntimeNow()
}

export async function copyText(text: string): Promise<void> {
  if (await isNativeRuntime()) {
    const { Clipboard } = await import('@capacitor/clipboard')
    await Clipboard.write({ string: text })
    return
  }

  await navigator.clipboard.writeText(text)
}

export async function shareContent(input: {
  title: string
  text: string
  url?: string
}): Promise<void> {
  if (await isNativeRuntime()) {
    const { Share } = await import('@capacitor/share')
    await Share.share(input)
    return
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share(input)
    return
  }

  await copyText([input.text, input.url].filter(Boolean).join('\n\n'))
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isNativeRuntimeNow()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
    return
  }

  // This branch must execute before the first await. Desktop browsers otherwise
  // treat the handoff as an unsolicited popup after the user-activation window
  // has expired and silently block WhatsApp Web.
  window.open(url, '_blank', 'noopener,noreferrer')
}

export type NativePermissionState =
  | 'granted'
  | 'limited'
  | 'denied'
  | 'prompt'
  | 'prompt-with-rationale'

function nativeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

export function isNativeUserCancelError(error: unknown): boolean {
  return /cancel(?:led|ed|)?/i.test(nativeErrorMessage(error))
}

export function isNativePermissionDeniedError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code.toUpperCase()
      : ''
  if (
    code === 'CONTACT_PERMISSION_DENIED' ||
    code === 'PERMISSION_DENIED' ||
    code === 'AUTHORIZATION_DENIED'
  ) {
    return true
  }
  return /(denied|not authorized|not authorised|permission|privacy|restricted|access)/i.test(
    nativeErrorMessage(error),
  )
}

export async function cameraPermissionState(): Promise<NativePermissionState> {
  if (!(await isNativeRuntime())) return 'granted'
  const { Camera } = await import('@capacitor/camera')
  const status = await Camera.checkPermissions()
  return status.camera
}

export async function requestCameraPermission(): Promise<NativePermissionState> {
  if (!(await isNativeRuntime())) return 'granted'
  const { Camera } = await import('@capacitor/camera')
  const status = await Camera.requestPermissions({ permissions: ['camera'] })
  return status.camera
}

export async function openAppSettings(): Promise<void> {
  if (!(await isNativeRuntime())) return
  try {
    await (await followAppNativePlugin()).openSettings()
    return
  } catch (error) {
    console.warn('[v0] Native settings bridge unavailable, using URL fallback:', error)
  }

  // iOS only reveals a Camera toggle after camera access has actually been
  // requested/denied. This fallback opens the app-specific settings page;
  // callers should only use it for a confirmed denied/restricted permission
  // state.
  window.location.href = 'app-settings:'
  try {
    const { Browser } = await import('@capacitor/browser')
    window.setTimeout(() => {
      void Browser.open({ url: 'app-settings:' }).catch(() => {
        // The location change above is the primary path. If both fail, the
        // user still has the photo/manual fallbacks in the scan sheet.
      })
    }, 250)
  } catch {
    // no-op
  }
}

export async function captureImageDataUrl(): Promise<string | null> {
  if (!(await isNativeRuntime())) return null

  // Keep one authoritative camera implementation per tap. The custom
  // prewarmed UIImagePickerController path could report itself as presented
  // without ever becoming visible, leaving this promise and the scan sheet
  // pending indefinitely. Capacitor Camera owns permission, presentation,
  // cancellation, and result delivery as one maintained lifecycle.
  const { Camera, CameraDirection, EncodingType } = await import(
    '@capacitor/camera'
  )
  const photo = await Camera.takePhoto({
    quality: 82,
    targetWidth: 1600,
    targetHeight: 1600,
    correctOrientation: true,
    encodingType: EncodingType.JPEG,
    saveToGallery: false,
    cameraDirection: CameraDirection.Rear,
    editable: 'no',
    presentationStyle: 'fullscreen',
  })
  return mediaResultToDataUrl(photo.webPath, photo.uri, photo.thumbnail)
}

interface FollowAppNativePlugin {
  addListener(
    eventName: 'followUpReminderTapped',
    listener: (event: { contactId?: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>
  addListener(
    eventName: 'systemEntryPointOpened',
    listener: (event: NativeSystemEntryPoint) => void,
  ): Promise<{ remove: () => Promise<void> }>
  addListener(
    eventName: 'exchangeDockAction',
    listener: (event: NativeExchangeDockAction) => void,
  ): Promise<{ remove: () => Promise<void> }>
  openSettings(): Promise<void>
  saveContact(
    card: CardData & {
      existingIdentifier?: string
      requestId?: string
    },
  ): Promise<{ saved?: boolean; identifier?: string }>
  notificationStatus(): Promise<{
    status?: 'granted' | 'denied' | 'prompt' | 'unsupported'
  }>
  requestNotificationPermission(): Promise<{
    status?: 'granted' | 'denied' | 'prompt' | 'unsupported'
  }>
  scheduleFollowUpReminder(input: {
    id: string
    contactId: string
    title: string
    body: string
    date: string
  }): Promise<{ scheduled?: boolean }>
  cancelFollowUpReminder(input: { id: string }): Promise<void>
  cancelAllFollowUpReminders(): Promise<void>
  consumeFollowUpReminderTap(): Promise<{ contactId?: string }>
  recognizeBusinessCard(input: { image: string }): Promise<{
    lines?: string[]
    text?: string
    averageConfidence?: number
  }>
  nativeScannerAvailability(): Promise<NativeScannerAvailability>
  scanBusinessCard(): Promise<NativeBusinessCardScan>
  consumeLockedCameraCapture(): Promise<NativeLockedCameraCapture>
  consumeSystemEntryPoint(): Promise<Partial<NativeSystemEntryPoint>>
  beginQRPresentation(input: {
    presentationId: string
  }): Promise<{ active?: boolean; presentationId?: string }>
  endQRPresentation(input: {
    presentationId: string
  }): Promise<{ active?: boolean; presentationId?: string }>
  presentExchangeDock(): Promise<{ presented?: boolean }>
  dismissExchangeDock(): Promise<{ dismissed?: boolean }>
  liveActivityStatus(): Promise<NativeLiveActivityStatus>
  startEventLiveActivity(
    input: NativeEventLiveActivityInput,
  ): Promise<{ started?: boolean; id?: string; reason?: string }>
  updateEventLiveActivity(
    input: Omit<NativeEventLiveActivityInput, 'eventName'>,
  ): Promise<{ updated?: boolean; id?: string; reason?: string }>
  endEventLiveActivity(
    input: Omit<NativeEventLiveActivityInput, 'eventName'>,
  ): Promise<{ ended?: number }>
}

export interface NativeScannerAvailability {
  supported?: boolean
  available?: boolean
  permission?: 'granted' | 'denied' | 'prompt' | 'unsupported'
}

export interface NativeBusinessCardScan {
  available?: boolean
  cancelled?: boolean
  reason?: 'unsupported' | 'unavailable' | 'permission-denied' | string
  lines?: string[]
  text?: string
  qrPayloads?: string[]
  elapsedMilliseconds?: number
}

export interface NativeLockedCameraCapture {
  available?: boolean
  image?: string
  source?: 'locked-camera'
}

export type NativeSystemRoute = 'scan' | 'my-qr' | 'event'

export interface NativeSystemEntryPoint {
  route: NativeSystemRoute
  url: string
}

export interface NativeExchangeDockAction {
  action: 'scan' | 'my-qr'
  url: string
}

export interface NativeEventLiveActivityInput {
  eventId: string
  eventName: string
  captured: number
  promises: number
}

export interface NativeLiveActivityStatus {
  supported?: boolean
  enabled?: boolean
  activities?: Array<{ id?: string; eventId?: string; eventName?: string }>
}

let followAppNativePluginInstance: FollowAppNativePlugin | null = null

function followAppNativePlugin(): FollowAppNativePlugin {
  if (!followAppNativePluginInstance) {
    followAppNativePluginInstance =
      registerPlugin<FollowAppNativePlugin>('FollowAppNative')
  }
  return followAppNativePluginInstance
}

export async function nativeScannerAvailability(): Promise<NativeScannerAvailability> {
  if (!(await isNativeRuntime())) {
    return { supported: false, available: false, permission: 'unsupported' }
  }
  try {
    return await (await followAppNativePlugin()).nativeScannerAvailability()
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) {
      return { supported: false, available: false, permission: 'unsupported' }
    }
    throw error
  }
}

/**
 * Opens VisionKit's live text/QR scanner. `available: false` is an intentional
 * signal to use the existing Capacitor camera path; cancellation is distinct.
 */
export async function scanBusinessCardNatively(): Promise<NativeBusinessCardScan> {
  if (!(await isNativeRuntime())) return { available: false, reason: 'unsupported' }
  try {
    const result = await (await followAppNativePlugin()).scanBusinessCard()
    return {
      available: result.available === true,
      cancelled: result.cancelled === true,
      ...(typeof result.reason === 'string'
        ? { reason: result.reason.slice(0, 100) }
        : {}),
      ...(Array.isArray(result.lines)
        ? {
            lines: result.lines
              .filter((line): line is string => typeof line === 'string')
              .map((line) => line.trim().slice(0, 220))
              .filter(Boolean)
              .slice(0, 80),
          }
        : {}),
      ...(typeof result.text === 'string'
        ? { text: result.text.slice(0, 12_000) }
        : {}),
      ...(Array.isArray(result.qrPayloads)
        ? {
            qrPayloads: result.qrPayloads
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim().slice(0, 8_000))
              .filter(Boolean)
              .slice(0, 10),
          }
        : {}),
      ...(typeof result.elapsedMilliseconds === 'number'
        ? {
            elapsedMilliseconds: Math.max(
              0,
              Math.min(120_000, Math.round(result.elapsedMilliseconds)),
            ),
          }
        : {}),
    }
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) {
      return { available: false, reason: 'unsupported' }
    }
    throw error
  }
}

/** Consume the newest image captured by the iOS locked-camera extension. */
export async function consumeLockedCameraCapture(): Promise<string | null> {
  if (!(await isNativeRuntime())) return null
  try {
    const result = await (
      await followAppNativePlugin()
    ).consumeLockedCameraCapture()
    const image = result.image
    return typeof image === 'string' &&
      image.startsWith('data:image/jpeg;base64,') &&
      image.length <= 45_000_000
      ? image
      : null
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return null
    throw error
  }
}

function normalizeSystemEntryPoint(
  value: Partial<NativeSystemEntryPoint>,
): NativeSystemEntryPoint | null {
  if (
    value.route !== 'scan' &&
    value.route !== 'my-qr' &&
    value.route !== 'event'
  ) {
    return null
  }
  const expectedUrl = `followapp://${value.route}`
  return { route: value.route, url: expectedUrl }
}

export async function consumeNativeSystemEntryPoint(): Promise<NativeSystemEntryPoint | null> {
  if (!(await isNativeRuntime())) return null
  try {
    return normalizeSystemEntryPoint(
      await (await followAppNativePlugin()).consumeSystemEntryPoint(),
    )
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return null
    throw error
  }
}

export async function listenForNativeSystemEntryPoints(
  listener: (entryPoint: NativeSystemEntryPoint) => void,
): Promise<() => void> {
  if (!(await isNativeRuntime())) return () => {}
  try {
    const handle = await (
      await followAppNativePlugin()
    ).addListener('systemEntryPointOpened', (value) => {
      const entryPoint = normalizeSystemEntryPoint(value)
      if (entryPoint) listener(entryPoint)
    })
    return () => void handle.remove()
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return () => {}
    throw error
  }
}

export interface NativeQRPresentationDriver {
  begin(presentationId: string): Promise<boolean>
  end(presentationId: string): Promise<void>
}

/**
 * Reference-counts QR owners and serializes their native bridge calls.
 *
 * React can clean up one presentation while another is already opening. A
 * bare begin/end pair lets the older completion restore brightness underneath
 * the newer QR. The lease set makes duplicate/stale ends harmless, while the
 * operation queue also protects older app binaries that do not understand the
 * presentation identifier yet.
 */
export function createNativeQRPresentationCoordinator(
  driver: NativeQRPresentationDriver,
) {
  const leases = new Set<string>()
  let nativeSessionId: string | null = null
  let operationQueue: Promise<void> = Promise.resolve()

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation, operation)
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const begin = (presentationId: string): Promise<boolean> =>
    enqueue(async () => {
      if (leases.has(presentationId)) return nativeSessionId !== null
      if (leases.size > 0) {
        leases.add(presentationId)
        return true
      }

      const active = await driver.begin(presentationId)
      if (active) {
        leases.add(presentationId)
        nativeSessionId = presentationId
      }
      return active
    })

  const end = (presentationId: string): Promise<void> =>
    enqueue(async () => {
      if (!leases.delete(presentationId) || leases.size > 0) return
      const sessionId = nativeSessionId
      nativeSessionId = null
      if (sessionId) await driver.end(sessionId)
    })

  return { begin, end }
}

const nativeQRPresentationCoordinator = createNativeQRPresentationCoordinator({
  async begin(presentationId) {
    if (!(await isNativeRuntime())) return false
    try {
      const result = await (
        await followAppNativePlugin()
      ).beginQRPresentation({ presentationId })
      return result.active === true
    } catch (error) {
      if (isNativeMethodUnavailableError(error)) return false
      throw error
    }
  },
  async end(presentationId) {
    if (!(await isNativeRuntime())) return
    try {
      await (
        await followAppNativePlugin()
      ).endQRPresentation({ presentationId })
    } catch (error) {
      if (!isNativeMethodUnavailableError(error)) throw error
    }
  },
})

export function beginNativeQRPresentation(
  presentationId: string,
): Promise<boolean> {
  return nativeQRPresentationCoordinator.begin(presentationId)
}

export function endNativeQRPresentation(
  presentationId: string,
): Promise<void> {
  return nativeQRPresentationCoordinator.end(presentationId)
}

export async function presentNativeExchangeDock(): Promise<boolean> {
  if (!(await isNativeRuntime())) return false
  try {
    const result = await (await followAppNativePlugin()).presentExchangeDock()
    return result.presented === true
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return false
    throw error
  }
}

export async function dismissNativeExchangeDock(): Promise<void> {
  if (!(await isNativeRuntime())) return
  try {
    await (await followAppNativePlugin()).dismissExchangeDock()
  } catch (error) {
    if (!isNativeMethodUnavailableError(error)) throw error
  }
}

export async function listenForNativeExchangeDockActions(
  listener: (action: NativeExchangeDockAction) => void,
): Promise<() => void> {
  if (!(await isNativeRuntime())) return () => {}
  try {
    const handle = await (
      await followAppNativePlugin()
    ).addListener('exchangeDockAction', (value) => {
      if (value.action === 'scan' || value.action === 'my-qr') {
        listener({ action: value.action, url: `followapp://${value.action}` })
      }
    })
    return () => void handle.remove()
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return () => {}
    throw error
  }
}

export async function nativeLiveActivityStatus(): Promise<NativeLiveActivityStatus> {
  if (!(await isNativeRuntime())) return { supported: false, enabled: false }
  try {
    return await (await followAppNativePlugin()).liveActivityStatus()
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) {
      return { supported: false, enabled: false }
    }
    throw error
  }
}

export async function startNativeEventLiveActivity(
  input: NativeEventLiveActivityInput,
): Promise<boolean> {
  if (!(await isNativeRuntime())) return false
  try {
    const result = await (
      await followAppNativePlugin()
    ).startEventLiveActivity(input)
    return result.started === true
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return false
    throw error
  }
}

export async function updateNativeEventLiveActivity(
  input: Omit<NativeEventLiveActivityInput, 'eventName'>,
): Promise<boolean> {
  if (!(await isNativeRuntime())) return false
  try {
    const result = await (
      await followAppNativePlugin()
    ).updateEventLiveActivity(input)
    return result.updated === true
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return false
    throw error
  }
}

export async function endNativeEventLiveActivity(
  input: Omit<NativeEventLiveActivityInput, 'eventName'>,
): Promise<number> {
  if (!(await isNativeRuntime())) return 0
  try {
    const result = await (
      await followAppNativePlugin()
    ).endEventLiveActivity(input)
    return Math.max(0, result.ended ?? 0)
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return 0
    throw error
  }
}

export async function chooseImageDataUrl(): Promise<string | null> {
  if (!(await isNativeRuntime())) return null

  const { Camera, CameraResultType, CameraSource, MediaTypeSelection } =
    await import('@capacitor/camera')

  try {
    const result = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      limit: 1,
      correctOrientation: true,
      quality: 82,
    })
    const photo = result.results[0]
    if (!photo) return null
    return mediaResultToDataUrl(photo.webPath, photo.uri, photo.thumbnail)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel/i.test(message)) throw error
    console.warn('[v0] Native chooseFromGallery failed, trying legacy getPhoto:', error)
  }

  const photo = await Camera.getPhoto({
    quality: 82,
    width: 1600,
    height: 1600,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
    promptLabelHeader: 'Choose business card',
    promptLabelPhoto: 'Choose photo',
  })

  return photo.dataUrl ?? null
}

async function mediaResultToDataUrl(
  webPath?: string,
  uri?: string,
  thumbnail?: string,
): Promise<string | null> {
  const { Capacitor } = await import('@capacitor/core')
  const candidates = [webPath, uri ? Capacitor.convertFileSrc(uri) : undefined]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const response = await fetch(candidate)
      if (!response.ok) continue
      return blobToDataUrl(await response.blob())
    } catch {
      // Fall through to the next WebView-safe representation.
    }
  }
  return thumbnail ? base64ToJpegDataUrl(thumbnail) : null
}

export interface PhoneContactSaveResult {
  outcome: 'saved' | 'cancelled' | 'exported'
  identifier?: string
}

export async function saveContactToPhone(
  card: CardData,
  options: { existingIdentifier?: string; requestId?: string } = {},
): Promise<PhoneContactSaveResult> {
  if (await isNativeRuntime()) {
    try {
      // This promise intentionally has no wall-clock watchdog. The native
      // operation includes Apple-owned UI where someone may spend as long as
      // they need reviewing or editing the contact before choosing Done or
      // Cancel. Timing it out can report failure while a later save is still
      // possible, which risks both lost saves and duplicates on retry.
      const result = await followAppNativePlugin().saveContact({
        ...card,
        ...options,
      })
      return {
        outcome: result.saved ? 'saved' : 'cancelled',
        ...(result.identifier ? { identifier: result.identifier } : {}),
      }
    } catch (error) {
      if (
        isNativeUserCancelError(error) ||
        !isNativeMethodUnavailableError(error)
      ) {
        throw error
      }
      console.warn(
        '[v0] Native contact bridge unavailable, using vCard fallback:',
        error,
      )
    }
  }
  const { saveToPhone } = await import('./card')
  saveToPhone(card)
  // A browser download/open is not proof that the person completed the import.
  // Keep this distinct from the native editor's confirmed saved result.
  return { outcome: 'exported' }
}

export type ReminderPermission =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'

async function reminderBridgeResult(
  action: (plugin: FollowAppNativePlugin) => Promise<{ status?: ReminderPermission }>,
): Promise<ReminderPermission> {
  if (!(await isNativeRuntime())) return 'unsupported'
  try {
    const result = await action(await followAppNativePlugin())
    return result.status ?? 'unsupported'
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return 'unsupported'
    throw error
  }
}

export function reminderPermissionStatus(): Promise<ReminderPermission> {
  return reminderBridgeResult((plugin) => plugin.notificationStatus())
}

export function requestReminderPermission(): Promise<ReminderPermission> {
  return reminderBridgeResult((plugin) => plugin.requestNotificationPermission())
}

export async function scheduleFollowUpReminder(input: {
  id: string
  contactId: string
  title: string
  body: string
  date: string
}): Promise<boolean> {
  if (!(await isNativeRuntime())) return false
  try {
    const result = await (
      await followAppNativePlugin()
    ).scheduleFollowUpReminder(input)
    return result.scheduled ?? false
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return false
    throw error
  }
}

export async function cancelFollowUpReminder(id: string): Promise<void> {
  if (!(await isNativeRuntime())) return
  try {
    await (await followAppNativePlugin()).cancelFollowUpReminder({ id })
  } catch (error) {
    if (!isNativeMethodUnavailableError(error)) throw error
  }
}

/** Remove every FollowApp follow-up from both pending and delivered lists. */
export async function cancelAllFollowUpReminders(): Promise<void> {
  if (!(await isNativeRuntime())) return
  try {
    await (await followAppNativePlugin()).cancelAllFollowUpReminders()
  } catch (error) {
    if (!isNativeMethodUnavailableError(error)) throw error
  }
}

/** Consume, at most once, the contact selected from a reminder notification. */
export async function consumeFollowUpReminderTap(): Promise<string | null> {
  if (!(await isNativeRuntime())) return null
  try {
    const result = await (
      await followAppNativePlugin()
    ).consumeFollowUpReminderTap()
    const contactId = result.contactId?.trim()
    return contactId ? contactId.slice(0, 200) : null
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return null
    throw error
  }
}

/** Wake the web layer immediately when a foreground notification is tapped. */
export async function listenForFollowUpReminderTaps(
  listener: () => void,
): Promise<() => void> {
  if (!(await isNativeRuntime())) return () => {}
  try {
    const handle = await (
      await followAppNativePlugin()
    ).addListener('followUpReminderTapped', listener)
    return () => void handle.remove()
  } catch (error) {
    if (isNativeMethodUnavailableError(error)) return () => {}
    throw error
  }
}


function base64ToJpegDataUrl(value: string): string {
  if (value.startsWith('data:')) return value
  return `data:image/jpeg;base64,${value}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function tapFeedback(): Promise<void> {
  if (!(await isNativeRuntime())) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Haptics are a polish layer; lack of support should never block delivery.
  }
}
