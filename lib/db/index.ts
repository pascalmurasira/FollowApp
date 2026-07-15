import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
import * as schema from './schema'

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
/** A Drizzle executor backed by either the pool or one checked-out client. */
export type DbExecutor = NodePgDatabase<typeof schema>
export const db: DbExecutor = drizzle(pool, { schema })

/** Bind Drizzle queries to an existing PostgreSQL transaction. */
export function dbForClient(client: PoolClient): DbExecutor {
  return drizzle(client, { schema })
}
