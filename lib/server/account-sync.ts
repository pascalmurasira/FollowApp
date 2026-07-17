import type { PoolClient } from 'pg'
import { eq } from 'drizzle-orm'
import type { DbExecutor } from '../db/index.ts'
import {
  circleTags,
  memorySignals,
  profiles,
  userContacts,
} from '../db/schema.ts'
import {
  assertDeviceAvailableToUser,
  DeviceOwnershipIntegrityError,
  lockDeviceIds,
  registerDeviceAlias,
} from './device-ownership.ts'

export {
  DeviceAliasLimitError,
  DeviceAlreadyClaimedError,
} from './device-ownership.ts'

/** Remove every device-scoped row while preserving the account itself. */
export async function clearDeviceData(
  deviceId: string,
  executor: DbExecutor,
): Promise<void> {
  // Keep this ordered so a future foreign key cannot turn a privacy erase into
  // a partially completed operation inside `withDeviceAccess`' transaction.
  await executor.delete(circleTags).where(eq(circleTags.deviceId, deviceId))
  await executor.delete(memorySignals).where(eq(memorySignals.deviceId, deviceId))
  await executor.delete(userContacts).where(eq(userContacts.deviceId, deviceId))
  await executor.delete(profiles).where(eq(profiles.deviceId, deviceId))
}

/**
 * Delete an authenticated account and all data it owns in one transaction.
 * The caller must establish the session before invoking this function.
 */
export async function deleteAccountAndData(
  client: PoolClient,
  userId: string,
): Promise<boolean> {
  await client.query('BEGIN')
  try {
    const account = await client.query<{
      dataDeviceId: string | null
      email: string
    }>(
      'SELECT "dataDeviceId", email FROM "user" WHERE id = $1 FOR UPDATE',
      [userId],
    )
    if (account.rowCount !== 1) {
      await client.query('ROLLBACK')
      return false
    }

    const aliases = await client.query<{ deviceId: string; canonicalDeviceId: string }>(
      `
        SELECT device_id AS "deviceId",
               canonical_device_id AS "canonicalDeviceId"
        FROM device_aliases
        WHERE owner_user_id = $1
      `,
      [userId],
    )
    const deviceIds = [
      account.rows[0].dataDeviceId,
      ...aliases.rows.flatMap((row) => [row.deviceId, row.canonicalDeviceId]),
    ].filter((value): value is string => Boolean(value))

    await lockDeviceIds(client, deviceIds)
    if (deviceIds.length > 0) {
      const uniqueDeviceIds = [...new Set(deviceIds)]
      await client.query('DELETE FROM circle_tags WHERE device_id = ANY($1::text[])', [
        uniqueDeviceIds,
      ])
      await client.query('DELETE FROM memory_signals WHERE device_id = ANY($1::text[])', [
        uniqueDeviceIds,
      ])
      await client.query('DELETE FROM user_contacts WHERE device_id = ANY($1::text[])', [
        uniqueDeviceIds,
      ])
      await client.query('DELETE FROM profiles WHERE device_id = ANY($1::text[])', [
        uniqueDeviceIds,
      ])
    }

    // Chat tables predate foreign keys. Remove both directions explicitly so
    // account deletion cannot leave identifiable message/link rows behind.
    await client.query(
      'DELETE FROM direct_messages WHERE sender_user_id = $1 OR recipient_user_id = $1',
      [userId],
    )
    await client.query(
      'DELETE FROM contact_links WHERE requester_user_id = $1 OR recipient_user_id = $1',
      [userId],
    )
    // Better Auth magic-link rows use a random token as `identifier` and keep
    // the target email in their JSON `value`. Remove any still-live links for
    // this account without touching FollowApp's verification-backed rate
    // limit buckets (whose values are numeric counters).
    const emailFragment = `"email":${JSON.stringify(account.rows[0].email)}`
    await client.query(
      `
        DELETE FROM verification
        WHERE identifier NOT LIKE 'followapp-rate:%'
          AND strpos(value, $1) > 0
      `,
      [emailFragment],
    )
    await client.query('DELETE FROM "user" WHERE id = $1', [userId])
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export async function lockAndAssertUnclaimed(
  client: PoolClient,
  deviceId: string,
  currentUserId: string,
) {
  await lockDeviceIds(client, [deviceId])
  await assertDeviceAvailableToUser(client, deviceId, currentUserId)
}

/** Move all anonymous rows from one capability to an account's canonical one. */
export async function mergeDeviceData(
  client: PoolClient,
  sourceDeviceId: string,
  targetDeviceId: string,
) {
  await client.query(
    `
    INSERT INTO profiles (
      device_id, name, photo_url, title, company, phone, email, updated_at
    )
    SELECT $2, name, photo_url, title, company, phone, email, updated_at
    FROM profiles
    WHERE device_id = $1
    ON CONFLICT (device_id) DO NOTHING
    `,
    [sourceDeviceId, targetDeviceId],
  )

  // Circle rows can collide when both devices tagged the same built-in
  // contact. Preserve the canonical device's choice in that case.
  await client.query(
    `
    INSERT INTO circle_tags (device_id, contact_id, circle)
    SELECT $2, contact_id, circle
    FROM circle_tags
    WHERE device_id = $1
    ON CONFLICT (device_id, contact_id) DO NOTHING
    `,
    [sourceDeviceId, targetDeviceId],
  )

  await client.query(
    'UPDATE memory_signals SET device_id = $2 WHERE device_id = $1',
    [sourceDeviceId, targetDeviceId],
  )

  // user_contacts.id is globally unique. Inserting a copy while the source
  // row still exists always conflicts with that same row, so move it instead.
  await client.query(
    'UPDATE user_contacts SET device_id = $2 WHERE device_id = $1',
    [sourceDeviceId, targetDeviceId],
  )

  await client.query('DELETE FROM circle_tags WHERE device_id = $1', [sourceDeviceId])
  await client.query('DELETE FROM profiles WHERE device_id = $1', [sourceDeviceId])
}

/**
 * Serialize a source-to-canonical merge against operations on both ids, then
 * retire the source in the same transaction so late requests cannot recreate
 * orphaned rows there. The caller owns BEGIN/COMMIT.
 */
export async function mergeAndRetireDeviceData(
  client: PoolClient,
  sourceDeviceId: string,
  targetDeviceId: string,
  currentUserId: string,
): Promise<boolean> {
  await lockDeviceIds(client, [sourceDeviceId, targetDeviceId])
  const sourceOwnership = await assertDeviceAvailableToUser(
    client,
    sourceDeviceId,
    currentUserId,
  )
  const targetOwnership = await assertDeviceAvailableToUser(
    client,
    targetDeviceId,
    currentUserId,
  )

  if (
    !targetOwnership ||
    targetOwnership.canonicalDeviceId !== targetDeviceId
  ) {
    throw new DeviceOwnershipIntegrityError(targetDeviceId)
  }

  // Replaying sync from an already-retired id is safe and does no work.
  if (sourceOwnership?.canonicalDeviceId === targetDeviceId) return false
  if (sourceOwnership) {
    throw new DeviceOwnershipIntegrityError(sourceDeviceId)
  }

  await mergeDeviceData(client, sourceDeviceId, targetDeviceId)
  await registerDeviceAlias(
    client,
    sourceDeviceId,
    targetDeviceId,
    currentUserId,
  )
  return true
}
