import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeContactWrite } from '../lib/contact-write-queue.ts'

test('contact writes preserve add-before-update order for the same person', async () => {
  const events: string[] = []
  let releaseAdd: () => void = () => {}
  const addGate = new Promise<void>((resolve) => {
    releaseAdd = resolve
  })

  const add = serializeContactWrite('device-a:contact-1', async () => {
    events.push('add:start')
    await addGate
    events.push('add:end')
  })
  const update = serializeContactWrite('device-a:contact-1', async () => {
    events.push('update')
  })

  await Promise.resolve()
  assert.deepEqual(events, ['add:start'])
  releaseAdd()
  await Promise.all([add, update])
  assert.deepEqual(events, ['add:start', 'add:end', 'update'])
})

test('different contacts persist independently', async () => {
  const events: string[] = []
  let releaseFirst: () => void = () => {}
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = serializeContactWrite('device-a:contact-a', async () => {
    events.push('first:start')
    await firstGate
    events.push('first:end')
  })
  const second = serializeContactWrite('device-a:contact-b', async () => {
    events.push('second')
  })

  await second
  assert.deepEqual(events, ['first:start', 'second'])
  releaseFirst()
  await first
  assert.deepEqual(events, ['first:start', 'second', 'first:end'])
})
