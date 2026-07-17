import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import {
  DEFAULT_PROFILE,
  hasPendingProfileSync,
  isShareableProfile,
  loadLocalProfile,
  loadProfile,
  migratePendingProfileSync,
  normalizeProfile,
  retryPendingProfileSync,
  saveLocalProfile,
  saveProfile,
} from '../lib/profile.ts'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
)
const originalFetch = globalThis.fetch

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
})

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage')
  }
  globalThis.fetch = originalFetch
})

test('normalizes profile text and rejects the placeholder identity', () => {
  assert.deepEqual(
    normalizeProfile({
      name: '  Ada Lovelace  ',
      title: '  Mathematician ',
      company: 42,
      email: '',
    }),
    {
      name: 'Ada Lovelace',
      title: 'Mathematician',
      company: undefined,
      email: undefined,
      phone: undefined,
      photoUrl: undefined,
    },
  )
  assert.equal(isShareableProfile(DEFAULT_PROFILE), false)
  assert.equal(isShareableProfile({ name: ' you ' }), false)
  assert.equal(isShareableProfile({ name: 'Ada Lovelace' }), true)
})

test('caches only meaningful profiles per device', () => {
  saveLocalProfile('device-a', { name: 'You' })
  assert.equal(loadLocalProfile('device-a'), null)

  saveLocalProfile('device-a', {
    name: 'Grace Hopper',
    title: 'Rear Admiral',
  })
  assert.deepEqual(loadLocalProfile('device-a'), {
    name: 'Grace Hopper',
    title: 'Rear Admiral',
    company: undefined,
    email: undefined,
    phone: undefined,
    photoUrl: undefined,
  })
  assert.equal(loadLocalProfile('device-b'), null)
})

test('rejects saving the placeholder identity before making a request', async () => {
  let requested = false
  globalThis.fetch = async () => {
    requested = true
    return new Response(null, { status: 200 })
  }

  await assert.rejects(
    saveProfile('device-a', { name: ' You ' }),
    /real name/,
  )
  assert.equal(requested, false)
  assert.equal(loadLocalProfile('device-a'), null)
})

test('keeps a meaningful local card when the server returns its default', async () => {
  saveLocalProfile('device-a', {
    name: 'Katherine Johnson',
    company: 'NASA',
  })
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ name: 'You' }), { status: 200 })

  const loaded = await loadProfile('device-a')
  assert.equal(loaded.name, 'Katherine Johnson')
  assert.equal(loaded.company, 'NASA')
})

test('saves locally even when cloud persistence fails', async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 })
  const profile = { name: 'Margaret Hamilton', title: 'Software Engineer' }

  await assert.rejects(saveProfile('device-a', profile), /503/)
  assert.equal(loadLocalProfile('device-a')?.name, 'Margaret Hamilton')

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ name: 'Older Cloud Profile' }), { status: 200 })
  assert.equal((await loadProfile('device-a')).name, 'Margaret Hamilton')
})

test('a later load retries a pending local profile sync', async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 })
  await assert.rejects(
    saveProfile('device-a', { name: 'Dorothy Vaughan', company: 'NASA' }),
    /503/,
  )

  const methods: string[] = []
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? 'GET')
    return new Response(null, { status: 200 })
  }

  assert.equal((await loadProfile('device-a')).name, 'Dorothy Vaughan')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(methods, ['PUT'])

  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? 'GET')
    return new Response(JSON.stringify({ name: 'Dorothy Vaughan' }), {
      status: 200,
    })
  }
  assert.equal((await loadProfile('device-a')).name, 'Dorothy Vaughan')
  assert.deepEqual(methods, ['PUT', 'GET'])
})

test('an online retry immediately repairs a pending local profile', async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 })
  await assert.rejects(
    saveProfile('device-online', { name: 'Mary Jackson', company: 'NASA' }),
    /503/,
  )

  const methods: string[] = []
  globalThis.fetch = async (_input, init) => {
    methods.push(init?.method ?? 'GET')
    return new Response(null, { status: 200 })
  }
  await retryPendingProfileSync('device-online')
  assert.deepEqual(methods, ['PUT'])

  await retryPendingProfileSync('device-online')
  assert.deepEqual(methods, ['PUT'])
})

test('moves an unsynced profile to the adopted account id without losing it', async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 })
  await assert.rejects(
    saveProfile('anonymous-device', {
      name: 'Annie Easley',
      company: 'NASA',
    }),
    /503/,
  )

  assert.equal(hasPendingProfileSync('anonymous-device'), true)
  assert.equal(
    migratePendingProfileSync('anonymous-device', 'account-device'),
    true,
  )
  assert.equal(loadLocalProfile('anonymous-device'), null)
  assert.equal(hasPendingProfileSync('account-device'), true)
  assert.equal(loadLocalProfile('account-device')?.name, 'Annie Easley')

  const writes: string[] = []
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { profile: { name: string } }
    writes.push(body.profile.name)
    return new Response(null, { status: 200 })
  }
  await retryPendingProfileSync('account-device')
  assert.deepEqual(writes, ['Annie Easley'])
  assert.equal(hasPendingProfileSync('account-device'), false)
})

test('a pending retry cannot overwrite a newer direct edit in the cloud', async () => {
  const deviceId = 'device-write-race'
  globalThis.fetch = async () => new Response(null, { status: 503 })
  await assert.rejects(saveProfile(deviceId, { name: 'Older Card' }), /503/)

  let cloudName = ''
  let releaseOlder!: () => void
  const requestedNames: string[] = []
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { profile: { name: string } }
    const name = body.profile.name
    requestedNames.push(name)
    if (name === 'Older Card') {
      return new Promise<Response>((resolve) => {
        releaseOlder = () => {
          cloudName = name
          resolve(new Response(null, { status: 200 }))
        }
      })
    }
    cloudName = name
    return new Response(null, { status: 200 })
  }

  await loadProfile(deviceId)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const newerSave = saveProfile(deviceId, { name: 'Newer Card' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(requestedNames, ['Older Card'])

  releaseOlder()
  await newerSave
  assert.deepEqual(requestedNames, ['Older Card', 'Newer Card'])
  assert.equal(cloudName, 'Newer Card')
  assert.equal(loadLocalProfile(deviceId)?.name, 'Newer Card')
})

test('an in-flight profile read cannot overwrite a newer local save', async () => {
  let resolveRead!: (response: Response) => void
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') return new Response(null, { status: 503 })
    return new Promise<Response>((resolve) => {
      resolveRead = resolve
    })
  }

  const pendingRead = loadProfile('device-a')
  await assert.rejects(
    saveProfile('device-a', { name: 'New Local Card' }),
    /503/,
  )
  resolveRead(
    new Response(JSON.stringify({ name: 'Stale Cloud Card' }), { status: 200 }),
  )

  assert.equal((await pendingRead).name, 'New Local Card')
  assert.equal(loadLocalProfile('device-a')?.name, 'New Local Card')
})
