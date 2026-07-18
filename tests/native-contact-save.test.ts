import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { nativeContactSaveLabel } from '../lib/native-contact-save.ts'

test('native contact save labels distinguish every outcome honestly', () => {
  assert.equal(nativeContactSaveLabel('idle'), 'Also save to phone')
  assert.equal(nativeContactSaveLabel('saving'), 'Saving to Contacts…')
  assert.equal(nativeContactSaveLabel('saved'), 'Saved to Contacts')
  assert.equal(nativeContactSaveLabel('exported'), 'Contact file ready')
  assert.equal(nativeContactSaveLabel('cancelled'), 'Not saved — try again')
  assert.equal(nativeContactSaveLabel('denied'), 'Open Settings for Contacts')
  assert.equal(nativeContactSaveLabel('error'), 'Could not save — try again')
})

test('native contact saving authorizes access and commits without a UIKit presentation', () => {
  const plugin = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )

  assert.match(plugin, /CNContactStore\.authorizationStatus\(for: \.contacts\)/)
  assert.match(plugin, /contactStore\.requestAccess\(for: \.contacts\)/)
  assert.match(plugin, /contactAccessAllowsSaving\(_ status: CNAuthorizationStatus\)/)
  assert.match(plugin, /updatedStatus = CNContactStore\.authorizationStatus/)
  assert.match(plugin, /contactAccessAllowsSaving\(updatedStatus\)/)
  assert.match(plugin, /status == \.limited/)
  assert.match(plugin, /private let contactSaveQueue = DispatchQueue/)
  assert.match(plugin, /let request = CNSaveRequest\(\)/)
  assert.match(plugin, /request\.add\(contact, toContainerWithIdentifier: nil\)/)
  assert.match(plugin, /try contactStore\.execute\(request\)/)
  assert.match(plugin, /call\.resolve\(\["saved": true/)
  assert.match(plugin, /CNError\.Code\.authorizationDenied\.rawValue/)
  assert.match(plugin, /permissionWasRevoked[\s\S]*CONTACT_PERMISSION_DENIED/)
  assert.match(plugin, /private func takeContactCall\(\)/)
  assert.doesNotMatch(plugin, /CNContactViewController/)
  assert.doesNotMatch(plugin, /contactPresentationConfirmed/)
})

test('native contact fields are trimmed and bounded before the device-store save', () => {
  const plugin = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )

  assert.match(plugin, /bounded\(call\.getString\("n"\), max: 200\)/)
  assert.match(plugin, /bounded\(call\.getString\("t"\), max: 300\)/)
  assert.match(plugin, /bounded\(call\.getString\("co"\), max: 300\)/)
  assert.match(plugin, /bounded\(call\.getString\("p"\), max: 100\)/)
  assert.match(plugin, /bounded\(call\.getString\("e"\), max: 320\)/)
  assert.match(plugin, /bounded\(call\.getString\("w"\), max: 300\)/)
  assert.match(plugin, /contact\.urlAddresses =/)
})

test('reviewed local OCR can save immediately and later edits invalidate stale success', () => {
  const sheet = readFileSync(
    new URL('../components/scan-card-sheet.tsx', import.meta.url),
    'utf8',
  )
  const button = readFileSync(
    new URL('../components/native-contact-save-button.tsx', import.meta.url),
    'utf8',
  )

  assert.match(sheet, /disabled=\{!card\.name\.trim\(\)\}/)
  assert.doesNotMatch(
    sheet,
    /disabled=\{!card\.name\.trim\(\) \|\| cloudScanPending\}/,
  )
  assert.match(button, /changedDuringSaveRef\.current = true/)
  assert.match(button, /latestCardSignatureRef\.current !== startingCardSignature/)
  assert.match(button, /update\(cardChanged \? 'idle' : outcome\)/)
})
