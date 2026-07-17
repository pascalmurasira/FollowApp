import type { Contact } from './types'

export type ReconciliationOperationKind =
  | 'upsert'
  | 'update'
  | 'touch'
  | 'outreach'
  | 'circle'
  | 'delete'

export interface ReconciliationOperation {
  kind: ReconciliationOperationKind
  contactId: string
}

export interface PeopleSnapshot {
  contacts: Contact[]
  circles: Record<string, string[]>
}

function operationKindsByContact(
  operations: ReconciliationOperation[],
): Map<string, Set<ReconciliationOperationKind>> {
  const result = new Map<string, Set<ReconciliationOperationKind>>()
  for (const operation of operations) {
    const current = result.get(operation.contactId) ?? new Set()
    current.add(operation.kind)
    result.set(operation.contactId, current)
  }
  return result
}

/**
 * Reconcile a completed server fetch without bringing back stale local data.
 * The server owns every settled field and deletion. Local values survive only
 * for operations that are still explicitly queued for upload.
 */
export function reconcilePeopleSnapshot(
  server: PeopleSnapshot,
  local: PeopleSnapshot,
  pending: ReconciliationOperation[],
): PeopleSnapshot {
  const operations = operationKindsByContact(pending)
  const localById = new Map(local.contacts.map((contact) => [contact.id, contact]))
  const serverById = new Map(
    server.contacts.map((contact) => [contact.id, contact]),
  )
  const contactIds = new Set(serverById.keys())
  for (const operation of pending) contactIds.add(operation.contactId)

  const contacts: Contact[] = []
  for (const contactId of contactIds) {
    const kinds = operations.get(contactId) ?? new Set()
    if (kinds.has('delete')) continue

    const remote = serverById.get(contactId)
    const desired = localById.get(contactId)
    if (!remote) {
      if (
        desired &&
        (kinds.has('upsert') ||
          kinds.has('update') ||
          kinds.has('touch') ||
          kinds.has('outreach'))
      ) {
        contacts.push(desired)
      }
      continue
    }

    if (!desired) {
      contacts.push(remote)
      continue
    }

    let reconciled = remote
    if (kinds.has('upsert') || kinds.has('update')) {
      // Card/cadence edits use the complete local desired card. Message history
      // stays server-owned unless an outreach write is also explicitly pending.
      reconciled = { ...remote, ...desired, messages: remote.messages }
    }
    if (kinds.has('touch')) {
      reconciled = {
        ...reconciled,
        lastContactedAt: desired.lastContactedAt,
        daysSinceContact: desired.daysSinceContact,
      }
    }
    if (kinds.has('outreach')) {
      reconciled = {
        ...reconciled,
        messages: desired.messages,
        lastContactedAt: desired.lastContactedAt,
        daysSinceContact: desired.daysSinceContact,
      }
    }
    contacts.push(reconciled)
  }

  const circles: Record<string, string[]> = { ...server.circles }
  for (const [contactId, kinds] of operations) {
    if (kinds.has('delete')) {
      delete circles[contactId]
      continue
    }
    if (!kinds.has('circle')) continue
    if (Object.prototype.hasOwnProperty.call(local.circles, contactId)) {
      circles[contactId] = [...local.circles[contactId]]
    } else {
      delete circles[contactId]
    }
  }

  return { contacts, circles }
}

/** Re-import reviewed fields without erasing local confirmed outreach. */
export function mergeReimportedContact(
  existing: Contact | undefined,
  reviewed: Contact,
): Contact {
  return existing ? { ...reviewed, messages: existing.messages } : reviewed
}
