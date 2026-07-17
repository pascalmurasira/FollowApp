import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountSyncCallbackURL,
  accountSyncDeviceIds,
} from '../lib/account-sync-flow.ts'

test('magic-link callback never carries an anonymous device capability', () => {
  assert.equal(accountSyncCallbackURL(), '/welcome-back')
})

test('sync reconciles only the installation that opened the link', () => {
  assert.deepEqual(accountSyncDeviceIds('source', 'destination'), ['destination'])
  assert.deepEqual(accountSyncDeviceIds('same', 'same'), ['same'])
  assert.deepEqual(accountSyncDeviceIds(null, 'destination'), ['destination'])
})
