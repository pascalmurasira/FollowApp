import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('the primary scan tap uses the maintained camera lifecycle', () => {
  const scanner = source('../ios/App/App/BusinessCardScannerCoordinator.swift')
  const plugin = source('../ios/App/App/FollowAppNativePlugin.swift')
  const native = source('../lib/native.ts')
  const scanSheet = source('../components/scan-card-sheet.tsx')

  // Keep the experimental VisionKit bridge available without letting it own
  // the critical first-camera presentation used at conferences.
  assert.match(scanner, /DataScannerViewController/)
  assert.match(scanner, /isHighlightingEnabled: true/)
  assert.match(scanner, /asyncAfter\(deadline: \.now\(\) \+ 1\.0/)
  assert.match(plugin, /CAPPluginMethod\(name: "scanBusinessCard"/)
  assert.match(native, /export async function scanBusinessCardNatively/)
  assert.match(native, /Camera\.takePhoto\(/)
  assert.match(scanSheet, /const capture = captureImageDataUrl\(\)/)
  assert.doesNotMatch(scanSheet, /scanBusinessCardNatively/)
})

test('cancelling a replacement camera or photo picker keeps the active scan valid', () => {
  const scanSheet = source('../components/scan-card-sheet.tsx')
  const cameraHandler = scanSheet.slice(
    scanSheet.indexOf('const handleNativeCamera'),
    scanSheet.indexOf('const handleChoosePhoto'),
  )
  const photoHandler = scanSheet.slice(
    scanSheet.indexOf('const handleChoosePhoto'),
    scanSheet.indexOf('const handleOpenSettings'),
  )
  const fileHandler = scanSheet.slice(
    scanSheet.indexOf('const handleFile'),
    scanSheet.indexOf('const update ='),
  )

  assert.match(cameraHandler, /let operation = operationRef\.current/)
  assert.match(
    cameraHandler,
    /const image = await capture[\s\S]*?operation = \+\+operationRef\.current/,
  )
  assert.doesNotMatch(
    cameraHandler,
    /const operation = \+\+operationRef\.current/,
  )
  assert.match(photoHandler, /let operation = operationRef\.current/)
  assert.match(
    photoHandler,
    /const image = await chooseImageDataUrl\(\)[\s\S]*?operation = \+\+operationRef\.current/,
  )
  assert.ok(
    fileHandler.indexOf('if (!file) return') <
      fileHandler.indexOf('const image = await downscale(file)'),
  )
  assert.ok(
    fileHandler.indexOf('const image = await downscale(file)') <
      fileHandler.indexOf('operation = ++operationRef.current'),
  )
})

test('system entry points, controls and secure capture use stable routes', () => {
  const appPlist = source('../ios/App/App/Info.plist')
  const intents = source('../ios/App/App/FollowAppSystemIntents.swift')
  const widgets = source('../ios/App/FollowAppWidgets/FollowAppWidgets.swift')
  const capturePlist = source(
    '../ios/App/FollowAppCaptureExtension/Info.plist',
  )
  const project = source('../ios/App/App.xcodeproj/project.pbxproj')

  assert.match(appPlist, /<string>followapp<\/string>/)
  assert.match(intents, /case scan/)
  assert.match(intents, /case myQR = "my-qr"/)
  assert.match(intents, /case event/)
  assert.match(intents, /url\.query == nil/)
  assert.match(intents, /url\.fragment == nil/)
  assert.match(widgets, /FollowAppCameraCaptureIntent\(\)/)
  assert.match(widgets, /followapp:\/\/my-qr/)
  assert.match(capturePlist, /com\.apple\.securecapture/)
  assert.match(project, /dstPath = Extensions;/)
  assert.match(project, /dstSubfolderSpec = 13;/)
})

test('the iOS 15 app weak-links the iOS 18 locked-camera framework', () => {
  const project = source('../ios/App/App.xcodeproj/project.pbxproj')
  const appDelegate = source('../ios/App/App/AppDelegate.swift')
  const plugin = source('../ios/App/App/FollowAppNativePlugin.swift')

  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/)
  assert.match(appDelegate, /@_weakLinked import LockedCameraCapture/)
  assert.match(plugin, /@_weakLinked import LockedCameraCapture/)
  assert.doesNotMatch(appDelegate, /\nimport LockedCameraCapture\n/)
  assert.doesNotMatch(plugin, /\nimport LockedCameraCapture\n/)
})

test('QR presentation and event Live Activity lifecycle are reversible', () => {
  const qr = source('../ios/App/App/QRPresentationManager.swift')
  const plugin = source('../ios/App/App/FollowAppNativePlugin.swift')
  const appPlist = source('../ios/App/App/Info.plist')
  const widgets = source('../ios/App/FollowAppWidgets/FollowAppWidgets.swift')

  assert.match(qr, /previousBrightness/)
  assert.match(qr, /previousIdleTimerDisabled/)
  assert.match(qr, /presentationIds: Set<String>/)
  assert.match(qr, /func end\(presentationId: String\)/)
  assert.match(qr, /applicationDidEnterBackground/)
  assert.match(plugin, /call\.getString\("presentationId"\)/)
  assert.match(plugin, /startEventLiveActivity/)
  assert.match(plugin, /updateEventLiveActivity/)
  assert.match(plugin, /endEventLiveActivity/)
  assert.match(appPlist, /<key>NSSupportsLiveActivities<\/key>/)
  assert.match(widgets, /ActivityConfiguration\(for: FollowAppEventAttributes\.self\)/)
})
