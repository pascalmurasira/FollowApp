import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canScheduleReminderDate,
  cadenceForTier,
  cadenceLabel,
  nextFollowUpDateInput,
} from '../lib/follow-up-schedule.ts'
import {
  dateInputToUtcNoon,
  daysSinceDateInput,
  utcDateToDateInputValue,
} from '../lib/contact-dates.ts'

test('cadence values and labels come from one model', () => {
  assert.equal(cadenceForTier('key'), 21)
  assert.equal(cadenceLabel('key'), 'Every 3 weeks')
  assert.equal(cadenceForTier('network'), 45)
  assert.equal(cadenceLabel('network'), 'Every 6 weeks')
  assert.equal(cadenceForTier('casual'), 90)
  assert.equal(cadenceLabel('casual'), 'Quarterly')
})

test('next follow-up is exact for confirmed and never-contacted people', () => {
  const now = new Date(2026, 6, 17, 12)
  assert.equal(nextFollowUpDateInput('2026-07-17', 'key', 0, now), '2026-08-07')
  assert.equal(nextFollowUpDateInput('2026-07-17', 'network', 0, now), '2026-08-31')
  assert.equal(nextFollowUpDateInput(null, 'casual', 0, now), '2026-07-17')
})

test('date-only reminders stay schedulable until local 09:00', () => {
  assert.equal(
    canScheduleReminderDate('2026-08-31', new Date(2026, 7, 31, 8, 59, 59)),
    true,
  )
  assert.equal(
    canScheduleReminderDate('2026-08-31', new Date(2026, 7, 31, 9, 0, 0)),
    false,
  )
  assert.equal(canScheduleReminderDate('2026-02-31'), false)
  assert.equal(canScheduleReminderDate('not-a-date'), false)
})

test('calendar-day age is stable across short and long DST days', () => {
  assert.equal(daysSinceDateInput('2026-03-28', new Date(2026, 2, 30, 0, 1)), 2)
  assert.equal(daysSinceDateInput('2026-10-24', new Date(2026, 9, 26, 0, 1)), 2)
})

test('date-only database conversion is a stable UTC-noon round trip', () => {
  const stored = dateInputToUtcNoon('2026-07-17')
  assert.equal(stored?.toISOString(), '2026-07-17T12:00:00.000Z')
  assert.equal(utcDateToDateInputValue(stored!), '2026-07-17')
  assert.equal(dateInputToUtcNoon('2026-02-31'), null)
})
