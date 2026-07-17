import { eq, sql } from 'drizzle-orm'
import { userContacts } from '../db/schema.ts'

/**
 * Let a same-device POST retry return its existing id without rewriting data.
 * A conflicting id from another device fails the WHERE clause, so RETURNING
 * yields no row and the route can reject the ownership collision.
 */
export function sameDeviceContactConflict(deviceId: string) {
  return {
    target: userContacts.id,
    setWhere: eq(userContacts.deviceId, deviceId),
    set: { deviceId },
  }
}

/**
 * A reviewed re-import updates the contact card and cadence for the owning
 * device. Confirmed outreach history and creation metadata deliberately stay
 * untouched. The ownership WHERE also turns a cross-device id collision into
 * a skipped row rather than an overwrite.
 */
export function sameDeviceImportedContactConflict(deviceId: string) {
  return {
    target: userContacts.id,
    setWhere: eq(userContacts.deviceId, deviceId),
    set: {
      name: sql.raw('excluded.name'),
      relationship: sql.raw('excluded.relationship'),
      title: sql.raw('excluded.title'),
      tier: sql.raw('excluded.tier'),
      phone: sql.raw('excluded.phone'),
      email: sql.raw('excluded.email'),
      avatarHue: sql.raw('excluded.avatar_hue'),
      context: sql.raw('excluded.context'),
      interests: sql.raw('excluded.interests'),
      lastContactedAt: sql.raw('excluded.last_contacted_at'),
    },
  }
}
