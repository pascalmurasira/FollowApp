export async function isNativeRuntime(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
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
  if (await isNativeRuntime()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

export type NativePermissionState =
  | 'granted'
  | 'limited'
  | 'denied'
  | 'prompt'
  | 'prompt-with-rationale'

export function isNativeUserCancelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /cancel(?:led|ed|)?/i.test(message)
}

export function isNativePermissionDeniedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(denied|not authorized|not authorised|permission|privacy|restricted|access)/i.test(
    message,
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
  // iOS only reveals a Camera toggle after camera access has actually been
  // requested/denied. This opens the app-specific settings page; callers should
  // only use it for a confirmed denied/restricted permission state.
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

  const {
    Camera,
    CameraDirection,
    CameraResultType,
    CameraSource,
    EncodingType,
  } = await import('@capacitor/camera')

  try {
    const photo = await Camera.getPhoto({
      quality: 82,
      width: 1600,
      height: 1600,
      allowEditing: false,
      correctOrientation: true,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      promptLabelHeader: 'Scan business card',
      promptLabelPhoto: 'Take photo',
    })
    return photo.dataUrl ?? null
  } catch (error) {
    if (isNativeUserCancelError(error) || isNativePermissionDeniedError(error)) {
      throw error
    }
    console.warn('[v0] Native getPhoto failed, trying takePhoto:', error)
  }

  const photo = await Camera.takePhoto({
    quality: 82,
    targetWidth: 1600,
    targetHeight: 1600,
    correctOrientation: true,
    encodingType: EncodingType.JPEG,
    cameraDirection: CameraDirection.Rear,
    editable: 'no',
    presentationStyle: 'fullscreen',
    saveToGallery: false,
  })

  return mediaResultToDataUrl(photo.thumbnail, photo.uri)
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
    return mediaResultToDataUrl(photo.thumbnail, photo.uri)
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
  thumbnail?: string,
  uri?: string,
): Promise<string | null> {
  if (thumbnail) return base64ToJpegDataUrl(thumbnail)
  if (!uri) return null
  const response = await fetch(uri)
  const blob = await response.blob()
  return blobToDataUrl(blob)
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
