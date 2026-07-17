import assert from 'node:assert/strict'
import test from 'node:test'
import {
  nativeAuthDestination,
  nativeAuthMarker,
} from '../lib/native-auth-url.ts'

test('accepts FollowApp production magic-link verification urls', () => {
  const value =
    'https://followapp.chat/api/auth/magic-link/verify?token=secret&callbackURL=%2Fwelcome-back'
  assert.equal(nativeAuthDestination(value), value)
})

test('rejects lookalike hosts, non-auth paths, and links without tokens', () => {
  assert.equal(
    nativeAuthDestination(
      'https://followapp.chat.attacker.example/api/auth/magic-link/verify?token=x',
    ),
    null,
  )
  assert.equal(
    nativeAuthDestination('https://followapp.chat/welcome-back?token=x'),
    null,
  )
  assert.equal(
    nativeAuthDestination('https://followapp.chat/api/auth/magic-link/verify'),
    null,
  )
  assert.equal(
    nativeAuthDestination(
      'https://followapp.chat/api/auth/magic-link/verify?token=',
    ),
    null,
  )
  assert.equal(
    nativeAuthDestination(
      'https://followapp.chat:444/api/auth/magic-link/verify?token=secret',
    ),
    null,
  )
  assert.equal(
    nativeAuthDestination(
      'https://user@followapp.chat/api/auth/magic-link/verify?token=secret',
    ),
    null,
  )
})

test('native auth markers are stable, token-specific, and do not expose tokens', () => {
  const first = nativeAuthMarker(
    'https://followapp.chat/api/auth/magic-link/verify?token=very-secret-token',
  )
  const again = nativeAuthMarker(
    'https://followapp.chat/api/auth/magic-link/verify?token=very-secret-token',
  )
  const other = nativeAuthMarker(
    'https://followapp.chat/api/auth/magic-link/verify?token=another-token',
  )
  assert.equal(first, again)
  assert.notEqual(first, other)
  assert.equal(first?.includes('very-secret-token'), false)
})
