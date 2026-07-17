import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deleteAccountAndData,
  mergeAndRetireDeviceData,
  mergeDeviceData,
} from '../lib/server/account-sync.ts'
import {
  DeviceAlreadyClaimedError,
  DeviceAliasLimitError,
  MAX_DEVICE_ALIASES_PER_ACCOUNT,
  lockDeviceIds,
  registerDeviceAlias,
} from '../lib/server/device-ownership.ts'
import type { PoolClient } from 'pg'

test('device merge moves globally keyed contacts instead of dropping them', async () => {
  const statements: string[] = []
  const client = {
    async query(text: string) {
      statements.push(text.replace(/\s+/g, ' ').trim())
      return { rowCount: 0, rows: [] }
    },
  } as unknown as PoolClient

  await mergeDeviceData(client, 'source-device', 'target-device')

  assert.ok(
    statements.includes(
      'UPDATE user_contacts SET device_id = $2 WHERE device_id = $1',
    ),
  )
  assert.equal(
    statements.some((statement) => statement.startsWith('INSERT INTO user_contacts')),
    false,
  )
  assert.equal(
    statements.some((statement) => statement.startsWith('DELETE FROM user_contacts')),
    false,
  )
})

test('device locks are sorted and deduplicated on the legacy shared key', async () => {
  const locked: string[] = []
  const client = {
    async query(text: string, values?: unknown[]) {
      assert.match(text, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/)
      locked.push(String(values?.[0]))
      return { rowCount: 1, rows: [] }
    },
  } as unknown as PoolClient

  const order = await lockDeviceIds(client, [
    'target-device',
    'source-device',
    'target-device',
  ])

  assert.deepEqual(order, ['source-device', 'target-device'])
  assert.deepEqual(locked, order)
})

test('merge locks source and target before moving data and retiring source', async () => {
  const statements: Array<{ text: string; values: unknown[] }> = []
  const client = {
    async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, ' ').trim()
      statements.push({ text: normalized, values })

      if (normalized.includes('UNION ALL')) {
        const requested = String(values[0])
        return {
          rowCount: requested === 'target-device' ? 1 : 0,
          rows:
            requested === 'target-device'
              ? [
                  {
                    ownerUserId: 'user-1',
                    canonicalDeviceId: 'target-device',
                  },
                ]
              : [],
        }
      }
      return { rowCount: 1, rows: [] }
    },
  } as unknown as PoolClient

  assert.equal(
    await mergeAndRetireDeviceData(
      client,
      'source-device',
      'target-device',
      'user-1',
    ),
    true,
  )

  const locks = statements
    .filter(({ text }) => text.includes('pg_advisory_xact_lock'))
    .map(({ values }) => values[0])
  assert.deepEqual(locks, ['source-device', 'target-device'])

  const moveIndex = statements.findIndex(({ text }) =>
    text.includes('UPDATE memory_signals SET device_id = $2'),
  )
  const retireIndex = statements.findIndex(({ text }) =>
    text.startsWith('INSERT INTO device_aliases'),
  )
  assert.ok(moveIndex >= 0)
  assert.ok(retireIndex > moveIndex)
})

test('merge rejects a source capability owned by another account', async () => {
  const client = {
    async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, ' ').trim()
      if (normalized.includes('UNION ALL')) {
        return {
          rowCount: 1,
          rows: [
            {
              ownerUserId: values[0] === 'source-device' ? 'user-2' : 'user-1',
              canonicalDeviceId: values[0],
            },
          ],
        }
      }
      return { rowCount: 1, rows: [] }
    },
  } as unknown as PoolClient

  await assert.rejects(
    mergeAndRetireDeviceData(
      client,
      'source-device',
      'target-device',
      'user-1',
    ),
    DeviceAlreadyClaimedError,
  )
})

test('replayed merge from an existing same-owner alias is a no-op', async () => {
  const statements: string[] = []
  const client = {
    async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, ' ').trim()
      statements.push(normalized)
      if (normalized.includes('UNION ALL')) {
        return {
          rowCount: 1,
          rows: [
            {
              ownerUserId: 'user-1',
              canonicalDeviceId:
                values[0] === 'source-device'
                  ? 'target-device'
                  : values[0],
            },
          ],
        }
      }
      return { rowCount: 1, rows: [] }
    },
  } as unknown as PoolClient

  assert.equal(
    await mergeAndRetireDeviceData(
      client,
      'source-device',
      'target-device',
      'user-1',
    ),
    false,
  )
  assert.equal(
    statements.some((statement) =>
      statement.includes('UPDATE memory_signals SET device_id = $2'),
    ),
    false,
  )
})

test('one account cannot create unbounded retired device aliases', async () => {
  const client = {
    async query(text: string) {
      if (text.startsWith('SELECT COUNT(*)')) {
        return {
          rowCount: 1,
          rows: [{ count: MAX_DEVICE_ALIASES_PER_ACCOUNT }],
        }
      }
      throw new Error('the capped alias must not be inserted')
    },
  } as unknown as PoolClient

  await assert.rejects(
    registerDeviceAlias(
      client,
      'source-device',
      'target-device',
      'user-1',
    ),
    DeviceAliasLimitError,
  )
})

test('account deletion removes every owned data scope in one transaction', async () => {
  const statements: Array<{ text: string; values: unknown[] }> = []
  const client = {
    async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, ' ').trim()
      statements.push({ text: normalized, values })
      if (normalized.startsWith('SELECT "dataDeviceId"')) {
        return {
          rowCount: 1,
          rows: [
            {
              dataDeviceId: 'canonical-device',
              email: 'owner@example.com',
            },
          ],
        }
      }
      if (normalized.includes('FROM device_aliases')) {
        return {
          rowCount: 1,
          rows: [
            {
              deviceId: 'retired-device',
              canonicalDeviceId: 'canonical-device',
            },
          ],
        }
      }
      return { rowCount: 1, rows: [] }
    },
  } as unknown as PoolClient

  assert.equal(await deleteAccountAndData(client, 'user-1'), true)

  assert.equal(statements[0].text, 'BEGIN')
  assert.equal(statements.at(-1)?.text, 'COMMIT')
  for (const table of [
    'circle_tags',
    'memory_signals',
    'user_contacts',
    'profiles',
    'direct_messages',
    'contact_links',
    'verification',
    '"user"',
  ]) {
    assert.ok(
      statements.some(({ text }) => text.startsWith(`DELETE FROM ${table}`)),
      `expected ${table} to be deleted`,
    )
  }
  const scopedDelete = statements.find(({ text }) =>
    text.startsWith('DELETE FROM user_contacts'),
  )
  assert.deepEqual(scopedDelete?.values, [
    ['canonical-device', 'retired-device'],
  ])
  const verificationDelete = statements.find(({ text }) =>
    text.startsWith('DELETE FROM verification'),
  )
  assert.match(verificationDelete?.text ?? '', /followapp-rate:%/)
  assert.deepEqual(verificationDelete?.values, [
    '"email":"owner@example.com"',
  ])
})
