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
