import type { CardData } from './card'
import { Capacitor } from '@capacitor/core'
import {
  isNativeCameraAdapterUnavailableError,
  isNativeMethodUnavailableError,
} from './native-bridge.ts'

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

  // Prefer FollowApp's prewarmed native picker. Its presentation watchdog
  // guarantees a rejected promise when UIKit declines the transition, so the
  // UI cannot remain stuck on "Opening camera…". Only fall back when an older
  // native shell genuinely does not expose the method; never open a second
  // picker after a permission, cancellation, or presentation error.
  try {
    const result = await (await followAppNativePlugin()).takeBusinessCardPhoto()
    return result.dataUrl ?? null
  } catch (error) {
    if (!isNativeCameraAdapterUnavailableError(error)) throw error
    console.warn(
      '[v0] Fast business-card camera unavailable, using Capacitor fallback:',
      error,
    )
  }

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

/** Prepare an already-authorized iOS camera without requesting or presenting. */
export async function prepareBusinessCardCamera(): Promise<boolean> {
  if (!(await isNativeRuntime())) return false
  try {
    const result = await (await followAppNativePlugin()).prepareBusinessCardCamera()
    return result.prepared === true
  } catch (error) {
    if (!isNativeMethodUnavailableError(error)) {
      console.warn('[v0] Business-card camera prewarm failed:', error)
    }
    return false
  }
}

interface FollowAppNativePlugin {
  addListener(
    eventName: 'followUpReminderTapped',
    listener: (event: { contactId?: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>
  openSettings(): Promise<void>
  cameraStatus(): Promise<{
    available?: boolean
    permission?: 'granted' | 'prompt' | 'denied' | 'restricted' | 'unknown'
  }>
  prepareBusinessCardCamera(): Promise<{ prepared?: boolean }>
  takeBusinessCardPhoto(): Promise<{ dataUrl?: string }>
  saveContact(card: CardData): Promise<{ saved?: boolean }>
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
}

let followAppNativePluginPromise: Promise<FollowAppNativePlugin> | null = null

async function followAppNativePlugin(): Promise<FollowAppNativePlugin> {
  if (!followAppNativePluginPromise) {
    followAppNativePluginPromise = import('@capacitor/core').then(
      ({ registerPlugin }) =>
        registerPlugin<FollowAppNativePlugin>('FollowAppNative'),
    )
  }
  return followAppNativePluginPromise
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

export type PhoneContactSaveResult = 'saved' | 'cancelled' | 'exported'

export async function saveContactToPhone(
  card: CardData,
): Promise<PhoneContactSaveResult> {
  if (await isNativeRuntime()) {
    try {
      const result = await (await followAppNativePlugin()).saveContact(card)
      // The current iOS editor resolves false when the user cancels. Preserve
      // that outcome instead of unexpectedly opening a second save flow.
      return result.saved ? 'saved' : 'cancelled'
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
  return 'exported'
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
