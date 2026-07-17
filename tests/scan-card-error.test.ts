import assert from 'node:assert/strict'
import test from 'node:test'
import { scanCardErrorMetadata } from '../lib/server/scan-card-error.ts'

test('scan-card logging metadata cannot retain card images or provider bodies', () => {
  const privateImage = 'data:image/jpeg;base64,PRIVATE_CARD_IMAGE'
  const error = Object.assign(
    new Error(`Provider rejected ${privateImage} for private@example.com`),
    {
      statusCode: 500,
      type: 'private@example.com',
      code: privateImage,
      request: { body: { image: privateImage } },
      response: { data: { name: 'Private Person', image: privateImage } },
      cause: { message: privateImage },
    },
  )

  const metadata = scanCardErrorMetadata(error)
  assert.deepEqual(metadata, { category: 'upstream_failure', statusCode: 500 })
  const serialized = JSON.stringify(metadata)
  assert.equal(serialized.includes('PRIVATE_CARD_IMAGE'), false)
  assert.equal(serialized.includes('private@example.com'), false)
  assert.equal(serialized.includes('Private Person'), false)
})

test('scan-card logging keeps only allowlisted operational classifications', () => {
  assert.deepEqual(
    scanCardErrorMetadata({
      statusCode: 429,
      type: 'rate_limit_exceeded',
      message: 'request body and image must not escape',
    }),
    { category: 'rate_limited', statusCode: 429 },
  )
  assert.deepEqual(scanCardErrorMetadata('private raw error'), {
    category: 'unknown',
  })
})
