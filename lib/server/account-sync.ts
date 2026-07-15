import type { PoolClient } from 'pg'
import {
  assertDeviceAvailableToUser,
  DeviceOwnershipIntegrityError,
  lockDeviceIds,
  registerDeviceAlias,
} from './device-ownership.ts'

export { DeviceAlreadyClaimedError } from './device-ownership.ts'

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
