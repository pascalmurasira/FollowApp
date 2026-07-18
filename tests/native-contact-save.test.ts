import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { nativeContactSaveLabel } from '../lib/native-contact-save.ts'

test('native contact save labels distinguish every outcome honestly', () => {
  assert.equal(nativeContactSaveLabel('idle'), 'Also save to phone')
  assert.equal(nativeContactSaveLabel('saving'), 'Opening Contacts…')
  assert.equal(nativeContactSaveLabel('saved'), 'Saved to Contacts')
  assert.equal(nativeContactSaveLabel('exported'), 'Contact file ready')
  assert.equal(nativeContactSaveLabel('cancelled'), 'Not saved — try again')
  assert.equal(nativeContactSaveLabel('denied'), 'Open Settings for Contacts')
  assert.equal(nativeContactSaveLabel('error'), 'Could not save — try again')
})

test('native contact saving authorizes access and cannot strand its bridge call', () => {
  const plugin = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )

  assert.match(plugin, /CNContactStore\.authorizationStatus\(for: \.contacts\)/)
  assert.match(plugin, /contactStore\.requestAccess\(for: \.contacts\)/)
  assert.match(plugin, /status == \.limited/)
  assert.match(
    plugin,
    /private var contactNavigationController: UINavigationController\?/,
  )
  assert.match(plugin, /private var contactPresentationConfirmed = false/)
  assert.match(plugin, /self\.contactPresentationConfirmed = true/)
  assert.match(plugin, /private func takeContactCall\(\)/)
  assert.doesNotMatch(plugin, /weak navigationController/)
})
