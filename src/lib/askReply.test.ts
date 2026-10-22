import { describe, expect, test } from 'vitest'

import { replyNote } from './askReply'

describe('replyNote', () => {
  test('an answer: the period and the headline', () => {
    expect(
      replyNote({
        question: 'What did I actually do in August?',
        range: 'AUG 1 – 31',
        answer: { headline: 'A building month.' },
      }),
    ).toEqual({ title: '✦ Ask · AUG 1 – 31', body: 'A building month.' })
  })

  test('an empty headline falls back to the question', () => {
    expect(
      replyNote({ question: 'Q?', range: 'X', answer: { headline: '' } }).body,
    ).toBe('Q?')
  })

  test('a failure that cost nothing says so', () => {
    expect(
      replyNote({ question: 'Q?', range: 'X', error: 'NOT REACHED', cost: 0 }),
    ).toEqual({
      title: '✕ Ask · NOT REACHED',
      body: '$0.00 · NOTHING PAID · Q?',
    })
  })

  test('a failure that was paid shows its cost', () => {
    expect(
      replyNote({ question: 'Q?', range: 'X', error: 'TOO LONG', cost: 0.042 })
        .body,
    ).toBe('$0.04 · Q?')
  })

  test('a long headline is clipped', () => {
    const body = replyNote({
      question: 'Q?',
      range: 'X',
      answer: { headline: 'a'.repeat(400) },
    }).body
    expect(body.length).toBe(160)
    expect(body.endsWith('…')).toBe(true)
  })
})
