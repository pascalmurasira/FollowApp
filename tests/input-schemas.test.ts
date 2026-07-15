import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contactInputSchema,
  contactUpdateInputSchema,
  profileInputSchema,
} from '../lib/server/input-schemas.ts'

test('persistence schemas reject nulls and wrong primitive field types', () => {
  assert.equal(profileInputSchema.safeParse(null).success, false)
  assert.equal(
    profileInputSchema.safeParse({ name: 42 }).success,
    false,
  )
  assert.equal(
    contactInputSchema.safeParse({ id: 'one', name: 'Ada', context: 7 })
      .success,
    false,
  )
  assert.equal(
    contactUpdateInputSchema.safeParse({ interests: ['valid', 3] }).success,
    false,
  )
})

test('contact schema supplies safe defaults for minimal imports', () => {
  const parsed = contactInputSchema.safeParse({ id: 'one', name: 'Ada' })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.relationship, '')
  assert.equal(parsed.data.avatarHue, 'coral')
  assert.deepEqual(parsed.data.interests, [])
})
