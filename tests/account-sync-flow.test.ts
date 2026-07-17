import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountSyncCallbackURL,
  accountSyncDeviceIds,
} from '../lib/account-sync-flow.ts'

test('magic-link callback carries the source capability safely', () => {
  assert.equal(
    accountSyncCallbackURL('dev_source/with spaces'),
    '/welcome-back?sourceDeviceId=dev_source%2Fwith%20spaces',
  )
  assert.equal(accountSyncCallbackURL('  '), '/welcome-back')
})

test('cross-device sync claims the source before the destination', () => {
  assert.deepEqual(accountSyncDeviceIds('source', 'destination'), [
    'source',
    'destination',
  ])
  assert.deepEqual(accountSyncDeviceIds('same', 'same'), ['same'])
  assert.deepEqual(accountSyncDeviceIds(null, 'destination'), ['destination'])
})
