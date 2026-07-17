export type PendingContactOperationKind =
  | 'upsert'
  | 'update'
  | 'touch'
  | 'outreach'
  | 'circle'
  | 'delete'

export interface PendingContactOperation {
  kind: PendingContactOperationKind
  contactId: string
  /** Distinguishes a newer same-kind edit from an older request in flight. */
  intentId?: string
}

interface StoredContactSyncState {
  version: 1
  operations: PendingContactOperation[]
  lastStatus?: number
  updatedAt: number
}

export interface ContactSyncState {
  pending: number
  authorizationBlocked: boolean
  lastStatus?: number
}

const STORAGE_KEY = 'followapp.contactSync.v1'
export const CONTACT_SYNC_EVENT = 'followapp:contact-sync'

let syncStateRevision = 0
let storageListenerInstalled = false

function installStorageRevisionListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return
  storageListenerInstalled = true
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) syncStateRevision += 1
  })
}

/**
 * Monotonic process-local revision for pending-write state. Fetches capture it
 * before network I/O so a queue -> settled transition cannot create an ABA
 * race where an older server snapshot looks current again.
 */
export function contactSyncRevision(): number {
  installStorageRevisionListener()
  return syncStateRevision
}

/** Keep only the latest desired operation for each contact/action. */
export function coalescePendingContactOperations(
  current: PendingContactOperation[],
  next: PendingContactOperation,
): PendingContactOperation[] {
  if (!next.contactId) return current

  if (next.kind === 'delete') {
    return [
      ...current.filter((operation) => operation.contactId !== next.contactId),
      next,
    ]
  }

  const hasDelete = current.some(
    (operation) =>
      operation.contactId === next.contactId && operation.kind === 'delete',
  )
  if (hasDelete && next.kind !== 'upsert') {
    // A circle/outreach write racing a deletion must never resurrect a person.
    return current
  }
  if (hasDelete) {
    // A later local upsert explicitly means the person was recreated.
    current = current.filter(
      (operation) =>
        !(operation.contactId === next.contactId && operation.kind === 'delete'),
    )
  }

  const withoutDuplicate = current.filter(
    (operation) =>
      !(
        operation.contactId === next.contactId && operation.kind === next.kind
      ),
  )
  return [...withoutDuplicate, next]
}

function readStoredState(): StoredContactSyncState {
  if (typeof window === 'undefined') {
    return { version: 1, operations: [], updatedAt: 0 }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, operations: [], updatedAt: 0 }
    const parsed = JSON.parse(raw) as Partial<StoredContactSyncState>
    const operations = Array.isArray(parsed.operations)
      ? parsed.operations.filter(
          (operation): operation is PendingContactOperation =>
            Boolean(operation?.contactId) &&
            ['upsert', 'update', 'touch', 'outreach', 'circle', 'delete'].includes(
              operation.kind ?? '',
            ),
        )
        .map((operation) => ({
          kind: operation.kind,
          contactId: operation.contactId,
          intentId:
            typeof operation.intentId === 'string' && operation.intentId
              ? operation.intentId
              : undefined,
        }))
      : []
    return {
      version: 1,
      operations: operations.slice(-500),
      lastStatus:
        typeof parsed.lastStatus === 'number' ? parsed.lastStatus : undefined,
      updatedAt:
        typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return { version: 1, operations: [], updatedAt: 0 }
  }
}

function publish(state: StoredContactSyncState): void {
  if (typeof window === 'undefined') return
  installStorageRevisionListener()
  syncStateRevision += 1
  try {
    if (state.operations.length === 0 && state.lastStatus === undefined) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // Local people data still retains the desired state. Failure to store a
    // retry marker must not make the original edit fail.
  }
  window.dispatchEvent(new Event(CONTACT_SYNC_EVENT))
}

export function getContactSyncState(): ContactSyncState {
  const state = readStoredState()
  return {
    pending: state.operations.length,
    authorizationBlocked:
      state.lastStatus === 401 || state.lastStatus === 403,
    lastStatus: state.lastStatus,
  }
}

export function pendingContactOperations(): PendingContactOperation[] {
  return readStoredState().operations
}

export function queuePendingContactOperation(
  operation: PendingContactOperation,
  status?: number,
): void {
  const current = readStoredState()
  publish({
    version: 1,
    operations: coalescePendingContactOperations(current.operations, operation),
    lastStatus: status,
    updatedAt: Date.now(),
  })
}

export function resolvePendingContactOperation(
  operation: PendingContactOperation,
): void {
  const current = readStoredState()
  const operations = current.operations.filter(
    (candidate) =>
      !(
        candidate.kind === operation.kind &&
        candidate.contactId === operation.contactId &&
        (operation.intentId
          ? candidate.intentId === operation.intentId
          : candidate.intentId === undefined)
      ),
  )
  publish({
    version: 1,
    operations,
    lastStatus: operations.length > 0 ? current.lastStatus : undefined,
    updatedAt: Date.now(),
  })
}

export function clearPendingContactOperations(): void {
  publish({ version: 1, operations: [], updatedAt: Date.now() })
}

export function recordContactAccessFailure(status: number): void {
  if (status !== 401 && status !== 403) return
  const current = readStoredState()
  publish({ ...current, lastStatus: status, updatedAt: Date.now() })
}

export function clearContactAccessFailure(): void {
  const current = readStoredState()
  if (current.lastStatus !== 401 && current.lastStatus !== 403) return
  publish({ ...current, lastStatus: undefined, updatedAt: Date.now() })
}
