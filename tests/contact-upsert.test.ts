import assert from 'node:assert/strict'
import test from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { userContacts } from '../lib/db/schema.ts'
import {
  sameDeviceContactConflict,
  sameDeviceImportedContactConflict,
} from '../lib/server/contact-upsert.ts'

test('contact POST conflict is a same-device no-op with an ownership guard', () => {
  const database = drizzle('postgres://query-build-only')
  const query = database
    .insert(userContacts)
    .values({ id: 'contact-a', deviceId: 'device-a', name: 'Ada' })
    .onConflictDoUpdate(sameDeviceContactConflict('device-a'))
    .returning({ id: userContacts.id })
    .toSQL()

  assert.match(
    query.sql,
    /on conflict \("id"\) do update set "device_id" = \$\d+ where "user_contacts"\."device_id" = \$\d+ returning "id"/,
  )
  assert.equal(query.params.at(-1), 'device-a')
  assert.doesNotMatch(query.sql, /do update set "messages"/)
})

test('same-device re-import updates reviewed fields but never messages', () => {
  const database = drizzle('postgres://query-build-only')
  const query = database
    .insert(userContacts)
    .values({ id: 'contact-a', deviceId: 'device-a', name: 'Reviewed Ada' })
    .onConflictDoUpdate(sameDeviceImportedContactConflict('device-a'))
    .toSQL()

  assert.match(query.sql, /do update set "name" = excluded\.name/)
  assert.match(query.sql, /"last_contacted_at" = excluded\.last_contacted_at/)
  assert.match(query.sql, /where "user_contacts"\."device_id" = \$\d+/)
  assert.doesNotMatch(query.sql, /"messages" = excluded\.messages/)
})
