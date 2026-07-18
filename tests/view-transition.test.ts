import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runViewTransition } from '../lib/view-transition.ts'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function replaceGlobal(name: 'document' | 'window', value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  })
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}

test('view transitions progressively enhance a synchronous state update', () => {
  let transitions = 0
  let updates = 0
  const restoreWindow = replaceGlobal('window', {
    matchMedia: () => ({ matches: false }),
  })
  const restoreDocument = replaceGlobal('document', {
    startViewTransition(update: () => void) {
      transitions += 1
      update()
      return { finished: Promise.resolve() }
    },
  })

  try {
    runViewTransition(() => {
      updates += 1
    })
    assert.equal(transitions, 1)
    assert.equal(updates, 1)
  } finally {
    restoreDocument()
    restoreWindow()
  }
})

test('reduced motion bypasses the animation without losing the update', () => {
  let transitions = 0
  let updates = 0
  const restoreWindow = replaceGlobal('window', {
    matchMedia: () => ({ matches: true }),
  })
  const restoreDocument = replaceGlobal('document', {
    startViewTransition() {
      transitions += 1
      return { finished: Promise.resolve() }
    },
  })

  try {
    runViewTransition(() => {
      updates += 1
    })
    assert.equal(transitions, 0)
    assert.equal(updates, 1)
  } finally {
    restoreDocument()
    restoreWindow()
  }
})

test('unsupported browsers use the ordinary update path', () => {
  let updates = 0
  const restoreWindow = replaceGlobal('window', {
    matchMedia: () => ({ matches: false }),
  })
  const restoreDocument = replaceGlobal('document', {})

  try {
    runViewTransition(() => {
      updates += 1
    })
    assert.equal(updates, 1)
  } finally {
    restoreDocument()
    restoreWindow()
  }
})

test('the My Card and conference capture surfaces use named transitions', () => {
  const myCard = source('../components/my-card-sheet.tsx')
  const scanCard = source('../components/scan-card-sheet.tsx')
  const styles = source('../app/globals.css')

  assert.match(myCard, /runViewTransition\(\(\) => \{/)
  assert.match(myCard, /data-transition-element="my-card-qr"/)
  assert.match(scanCard, /transitionToCapturedPerson=\{conferenceMode\}/)
  assert.match(scanCard, /setStage\('added'\)/)
  assert.match(styles, /followapp-my-card-qr/)
  assert.match(styles, /followapp-captured-person/)
})
