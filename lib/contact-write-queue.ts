// Network writes for one contact must preserve user order. A newly created
// contact can be opened and edited immediately; without this queue its PATCH
// may beat the original POST and disappear on the server while looking saved
// locally. Different contacts still persist in parallel.
const contactWriteTails = new Map<string, Promise<void>>()

export function serializeContactWrite<T>(
  key: string,
  write: () => Promise<T>,
): Promise<T> {
  const previous = contactWriteTails.get(key) ?? Promise.resolve()
  const run = previous.then(write)
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  contactWriteTails.set(key, settled)
  void settled.then(() => {
    if (contactWriteTails.get(key) === settled) contactWriteTails.delete(key)
  })
  return run
}

/**
 * Serialize one batch operation against every contact it contains. This keeps
 * a contact import from racing an in-flight delete/update for the same stable
 * id while still allowing unrelated contacts to persist independently.
 */
export function serializeContactWrites<T>(
  keys: readonly string[],
  write: () => Promise<T>,
): Promise<T> {
  const uniqueKeys = [...new Set(keys)].sort()
  if (uniqueKeys.length === 0) return write()

  const previous = uniqueKeys.map(
    (key) => contactWriteTails.get(key) ?? Promise.resolve(),
  )
  const run = Promise.all(previous).then(write)
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  for (const key of uniqueKeys) contactWriteTails.set(key, settled)
  void settled.then(() => {
    for (const key of uniqueKeys) {
      if (contactWriteTails.get(key) === settled) contactWriteTails.delete(key)
    }
  })
  return run
}
