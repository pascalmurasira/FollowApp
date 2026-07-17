export const CONTACT_IMPORT_BATCH_SIZE = 500

export interface ImportedContactIdentity {
  name: string
  title?: string
  company?: string
  position?: string
  email?: string
  phone?: string
}

function normalized(value?: string): string {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? ''
}

/**
 * Match a reviewed row to an already-imported contact after account adoption.
 * The device id deliberately is not part of this key because adoption replaces
 * the browser capability while the imported rows keep their original ids.
 */
export function importedContactIdentityKey(
  contact: ImportedContactIdentity,
): string {
  const role =
    contact.title ||
    [contact.position, contact.company].filter(Boolean).join(' · ')
  return [
    normalized(contact.name),
    normalized(role),
    normalized(contact.email),
    normalized(contact.phone),
  ].join('\u001f')
}

function hash(value: string, seed: number): string {
  let result = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16_777_619)
  }
  return (result >>> 0).toString(36)
}

/**
 * A device-scoped, content-stable id makes a retried import idempotent even
 * when the server committed a batch but the response never reached the app.
 */
export function importedContactId(
  deviceId: string,
  contact: ImportedContactIdentity,
): string {
  const identity = [
    normalized(deviceId),
    importedContactIdentityKey(contact),
  ].join('\u001f')

  return `import-${hash(identity, 2_166_136_261)}-${hash(identity, 3_332_829_277)}`
}

export function contactImportBatches<T>(items: T[]): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += CONTACT_IMPORT_BATCH_SIZE) {
    batches.push(items.slice(index, index + CONTACT_IMPORT_BATCH_SIZE))
  }
  return batches
}

/** Preserve review order while preventing one SQL upsert from seeing an id twice. */
export function uniqueContactsById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

/** Only an exact integer confirmation is considered a successful batch. */
export function confirmedImportCount(
  payload: unknown,
  expected: number,
): number {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The import response was not valid.')
  }
  const saved = (payload as { saved?: unknown }).saved
  if (!Number.isInteger(saved) || saved !== expected) {
    throw new Error('The import response did not confirm every contact.')
  }
  return saved as number
}

export class ContactImportError extends Error {
  readonly savedCount: number

  constructor(message: string, savedCount: number) {
    super(message)
    this.name = 'ContactImportError'
    this.savedCount = Math.max(0, Math.floor(savedCount))
  }
}

export function savedCountFromImportError(error: unknown): number {
  if (!error || typeof error !== 'object') return 0
  const savedCount = (error as { savedCount?: unknown }).savedCount
  return typeof savedCount === 'number' && Number.isFinite(savedCount)
    ? Math.max(0, Math.floor(savedCount))
    : 0
}
