import type { PoolClient } from 'pg'

const SCHEMA_LOCK_NAME = 'followapp:device-aliases-schema'

let ownershipSchemaReady: Promise<void> | null = null

export interface DeviceOwnership {
  ownerUserId: string
  canonicalDeviceId: string
}

export class DeviceAlreadyClaimedError extends Error {
  constructor() {
    super('Device data is already secured by another account')
    this.name = 'DeviceAlreadyClaimedError'
  }
}

export class DeviceOwnershipIntegrityError extends Error {
  constructor(deviceId: string) {
    super(`Conflicting ownership records for device ${deviceId}`)
    this.name = 'DeviceOwnershipIntegrityError'
  }
}

/**
 * Create the small alias registry used to retire a merged anonymous device id.
 *
 * This application has no migration runner and already performs compatible
 * additive schema setup at runtime. A transaction advisory lock makes the
 * CREATE TABLE safe when multiple serverless instances cold-start together.
 */
export function ensureDeviceOwnershipSchema(client: PoolClient): Promise<void> {
  if (!ownershipSchemaReady) {
    ownershipSchemaReady = createDeviceOwnershipSchema(client).catch((error) => {
      ownershipSchemaReady = null
      throw error
    })
  }
  return ownershipSchemaReady
}

async function createDeviceOwnershipSchema(client: PoolClient): Promise<void> {
  await client.query('BEGIN')
  try {
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '10s'")
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [SCHEMA_LOCK_NAME],
    )
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_aliases (
        device_id text PRIMARY KEY,
        canonical_device_id text NOT NULL,
        owner_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT device_aliases_not_self
          CHECK (device_id <> canonical_device_id)
      )
    `)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

/**
 * Acquire device locks in one deterministic order. Every device-scoped route
 * and account sync uses this function, preventing lock inversion deadlocks.
 */
export async function lockDeviceIds(
  client: PoolClient,
  deviceIds: readonly (string | null | undefined)[],
): Promise<string[]> {
  const ordered = [...new Set(deviceIds.filter((id): id is string => Boolean(id)))]
    .sort()

  for (const deviceId of ordered) {
    await client.query(
      // Keep the legacy key during rolling deploys so an older account-sync
      // instance and a newer route still serialize against one another.
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [deviceId],
    )
  }
  return ordered
}

/** A best-effort preflight hint; callers must recheck after taking the lock. */
export async function getAliasCanonicalDeviceId(
  client: PoolClient,
  deviceId: string,
): Promise<string | null> {
  const result = await client.query<{ canonicalDeviceId: string }>(
    `
      SELECT canonical_device_id AS "canonicalDeviceId"
      FROM device_aliases
      WHERE device_id = $1
      LIMIT 1
    `,
    [deviceId],
  )
  return result.rows[0]?.canonicalDeviceId ?? null
}

/** Resolve both canonical account-owned ids and retired/redirected aliases. */
export async function getDeviceOwnership(
  client: PoolClient,
  deviceId: string,
): Promise<DeviceOwnership | null> {
  const result = await client.query<DeviceOwnership>(
    `
      SELECT id AS "ownerUserId", "dataDeviceId" AS "canonicalDeviceId"
      FROM "user"
      WHERE "dataDeviceId" = $1

      UNION ALL

      SELECT owner_user_id AS "ownerUserId",
             canonical_device_id AS "canonicalDeviceId"
      FROM device_aliases
      WHERE device_id = $1
    `,
    [deviceId],
  )

  if (result.rows.length === 0) return null
  const [ownership, ...duplicates] = result.rows
  if (
    duplicates.some(
      (candidate) =>
        candidate.ownerUserId !== ownership.ownerUserId ||
        candidate.canonicalDeviceId !== ownership.canonicalDeviceId,
    )
  ) {
    throw new DeviceOwnershipIntegrityError(deviceId)
  }
  return ownership
}

export async function assertDeviceAvailableToUser(
  client: PoolClient,
  deviceId: string,
  currentUserId: string,
): Promise<DeviceOwnership | null> {
  const ownership = await getDeviceOwnership(client, deviceId)
  if (ownership && ownership.ownerUserId !== currentUserId) {
    throw new DeviceAlreadyClaimedError()
  }
  return ownership
}

/**
 * Permanently retire a merged source id. Authenticated requests from its owner
 * are redirected to the canonical id; bearer-only reuse is denied.
 */
export async function registerDeviceAlias(
  client: PoolClient,
  sourceDeviceId: string,
  canonicalDeviceId: string,
  ownerUserId: string,
): Promise<void> {
  if (sourceDeviceId === canonicalDeviceId) return

  const result = await client.query(
    `
      INSERT INTO device_aliases (
        device_id, canonical_device_id, owner_user_id
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (device_id) DO UPDATE
      SET updated_at = now()
      WHERE device_aliases.owner_user_id = EXCLUDED.owner_user_id
        AND device_aliases.canonical_device_id = EXCLUDED.canonical_device_id
    `,
    [sourceDeviceId, canonicalDeviceId, ownerUserId],
  )

  if (result.rowCount === 0) throw new DeviceAlreadyClaimedError()
}
