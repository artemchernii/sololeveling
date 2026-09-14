import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'

import { failureMessage } from './write-failure'

/* The shapes the Convex client rejects with. A thrown Error reaches the client
   as a message carrying the function, a request id, and the server's words
   after "Uncaught"; a ConvexError keeps its data. */
const serverError = (words: string) =>
  new Error(
    `[CONVEX M(tasks:complete)] [Request ID: 3f2a9c] Server Error\nUncaught Error: ${words}\n    at handler (../convex/tasks.ts:120:11)\n\n  Called by client`,
  )

describe('a failed save says what went wrong, in words', () => {
  test('a thrown Error gives the server’s own sentence', () => {
    expect(failureMessage(serverError('No such task'))).toBe('No such task')
  })

  test('a known ConvexError code is translated', () => {
    expect(failureMessage(new ConvexError('TODAY_FULL'))).toBe(
      'Today is full. Finish one or drop one.',
    )
  })

  test('a ConvexError sentence is shown as written', () => {
    expect(
      failureMessage(new ConvexError('This goal still has a chain: Oreum')),
    ).toBe('This goal still has a chain: Oreum')
  })

  test('a Convex error with no words of its own still says it failed', () => {
    expect(
      failureMessage(
        new Error(
          '[CONVEX M(tasks:complete)] [Request ID: 3f2a9c] Server Error',
        ),
      ),
    ).toBe('The server did not accept it.')
  })

  test('anything that is not a Convex write is not ours to report', () => {
    expect(failureMessage(new Error('navigation aborted'))).toBeNull()
    expect(failureMessage('nope')).toBeNull()
    expect(failureMessage(undefined)).toBeNull()
  })

  test('signing out is not a failed save — the session handles it', () => {
    expect(failureMessage(serverError('Not signed in'))).toBeNull()
  })
})
