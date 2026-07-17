import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGenericInviteLink,
  GENERIC_INVITE_PATH,
  inviteLandingHeadline,
} from '../lib/invite-link.ts'

test('invitation URLs use one generic path with no contact content', () => {
  assert.equal(GENERIC_INVITE_PATH, '/i/join')
  assert.equal(
    buildGenericInviteLink('https://followapp.chat/contact-id/private-name?secret=1'),
    'https://followapp.chat/i/join',
  )
})

test('legacy invitation codes are never interpreted as inviter names', () => {
  assert.equal(
    inviteLandingHeadline('local-contact-id-pascal-murasira'),
    'You’ve been invited to FollowApp',
  )
  assert.equal(inviteLandingHeadline('another-secret'), inviteLandingHeadline())
})
