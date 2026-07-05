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

export async function captureImageDataUrl(): Promise<string | null> {
  if (!(await isNativeRuntime())) return null

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const photo = await Camera.getPhoto({
    quality: 82,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    promptLabelHeader: 'Scan business card',
    promptLabelPhoto: 'Take photo',
  })

  return photo.dataUrl ?? null
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
