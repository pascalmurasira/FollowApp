import assert from 'node:assert/strict'
import test from 'node:test'
import { operationalErrorMetadata } from '../lib/server/error-metadata.ts'

test('server error metadata never retains SQL params or provider bodies', () => {
  const error = Object.assign(
    new Error('Failed query params: private@example.com +15550100'),
    {
      name: 'DrizzleQueryError',
      query: 'INSERT INTO contacts',
      params: ['private@example.com', '+15550100'],
      cause: { body: 'private card and token' },
    },
  )
  const metadata = operationalErrorMetadata(error)
  assert.deepEqual(metadata, { category: 'database' })
  assert.equal(JSON.stringify(metadata).includes('private'), false)
  assert.equal(JSON.stringify(metadata).includes('INSERT'), false)
})
