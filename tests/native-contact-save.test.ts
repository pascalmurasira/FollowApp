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

test('native contact adding uses Apple\'s editor without requesting the address book', () => {
  const plugin = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )

  assert.match(plugin, /import ContactsUI/)
  assert.match(plugin, /CNContactViewControllerDelegate/)
  assert.match(plugin, /CNContactViewController\(forNewContact: contact\)/)
  assert.match(plugin, /editor\.contactStore = contactStore/)
  assert.match(plugin, /editor\.delegate = self/)
  assert.match(plugin, /presenter\.present\(navigationController, animated: true\)/)
  assert.doesNotMatch(plugin, /contactStore\.requestAccess\(for: \.contacts\)/)
  assert.doesNotMatch(plugin, /request\.add\(/)
})

test('the contact editor reports cancellation and confirmed saves honestly', () => {
  const plugin = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )
  const completion = plugin.slice(
    plugin.indexOf('public func contactViewController('),
    plugin.indexOf('private func topViewController('),
  )

  assert.match(completion, /didCompleteWith contact: CNContact\?/)
  assert.match(
    completion,
    /if let call, let identifier = contact\?\.identifier/,
  )
  assert.match(completion, /call\.resolve\(\["saved": true, "identifier": identifier\]\)/)
  assert.match(completion, /else \{\s*call\?\.resolve\(\["saved": false\]\)/)
  assert.match(completion, /rememberContactIdentifier\(identifier, for: requestID\)/)
  assert.ok(
    completion.indexOf('call.resolve(["saved": true') <
      completion.indexOf('dismiss(animated: true)'),
  )
  assert.match(plugin, /presentationControllerDidDismiss[\s\S]*call\?\.resolve\(\["saved": false\]\)/)
})

test('only UIKit presentation is watched; contact review has no wall-clock timeout', () => {
  const plugin = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )
  const native = readFileSync(
    new URL('../lib/native.ts', import.meta.url),
    'utf8',
  )

  assert.match(plugin, /contactPresentationConfirmed = false/)
  assert.match(plugin, /DispatchQueue\.main\.asyncAfter\(deadline: \.now\(\) \+ 3\)/)
  assert.match(plugin, /Contact editor presentation did not complete/)
  assert.doesNotMatch(plugin, /CONTACT_SAVE_TIMEOUT/)
  assert.doesNotMatch(plugin, /deadline: \.now\(\) \+ 60/)
  assert.doesNotMatch(native, /nativeContactSaveWithin/)
  assert.doesNotMatch(native, /CONTACT_SAVE_TIMEOUT/)
  assert.doesNotMatch(native, /65_000/)
})

test('native contact fields are trimmed and bounded before opening the editor', () => {
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

test('contact saving registers its bridge eagerly and awaits the editor directly', () => {
  const native = readFileSync(
    new URL('../lib/native.ts', import.meta.url),
    'utf8',
  )

  assert.match(native, /import \{ Capacitor, registerPlugin \}/)
  assert.match(
    native,
    /const result = await followAppNativePlugin\(\)\.saveContact\(\{/,
  )
  assert.doesNotMatch(native, /nativeContactSaveWithin/)
  assert.doesNotMatch(native, /import\('@capacitor\/core'\)\.then/)
})

test('a completed Apple save cannot prompt for broad access or create a duplicate', () => {
  const plugin = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )
  const button = readFileSync(
    new URL('../components/native-contact-save-button.tsx', import.meta.url),
    'utf8',
  )

  assert.match(plugin, /call\.getString\("existingIdentifier"\)/)
  assert.match(plugin, /call\.getString\("requestId"\)/)
  assert.match(plugin, /contactIdentifiersByRequestID/)
  assert.match(plugin, /mappedIdentifier == nil/)
  assert.match(plugin, /CONTACT_IDENTIFIER_UNTRUSTED/)
  assert.match(plugin, /if mappedIdentifier != nil/)
  assert.match(plugin, /CONTACT_ALREADY_SAVED_NEEDS_MANUAL_EDIT/)
  assert.doesNotMatch(plugin, /unifiedContacts\(/)
  assert.doesNotMatch(plugin, /CNSaveRequest\(/)
  assert.doesNotMatch(plugin, /request\.update\(/)
  assert.doesNotMatch(plugin, /request\.add\(/)
  assert.match(button, /savedIdentifierRef\.current = result\.identifier/)
  assert.match(button, /requestId: requestIdRef\.current/)
})

test('reviewed local OCR can save immediately without invalidating a completed Apple save', () => {
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
  assert.match(button, /card_changed_during_save: cardChanged/)
  assert.match(
    button,
    /resultIsComplete \|\| !cardChanged \? result\.outcome : 'idle'/,
  )
})

test('completed contact exports remain sticky across later OCR and card prop changes', () => {
  const button = readFileSync(
    new URL('../components/native-contact-save-button.tsx', import.meta.url),
    'utf8',
  )

  assert.match(
    button,
    /Extract<ContactSaveOutcome, 'saved' \| 'exported'>/,
  )
  assert.match(button, /if \(completedOutcomeRef\.current\) return/)
  assert.match(
    button,
    /if \(outcome === 'saved' \|\| outcome === 'exported'\) \{\s*completedOutcomeRef\.current = outcome/,
  )
  assert.match(
    button,
    /const complete =\s*completedOutcomeRef\.current !== undefined \|\|\s*state === 'saved' \|\|\s*state === 'exported'/,
  )
})
