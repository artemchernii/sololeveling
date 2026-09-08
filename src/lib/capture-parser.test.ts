import { describe, expect, test } from 'vitest'

import { parseCapture } from './capture-parser'

/* The parser is the whole of PLAN.md §3's "three seconds, no form" promise, and
   it is pure — so it is cheap to pin down exactly. */

function log(input: string) {
  const result = parseCapture(input)
  if (!result.ok) {
    throw new Error(`expected "${input}" to parse: ${result.message}`)
  }
  return result.log
}

describe('the five verbs', () => {
  test('workout 60', () => {
    expect(log('workout 60')).toEqual({
      kind: 'workout',
      area: 'body',
      value: 60,
      unit: 'min',
      text: undefined,
    })
  })

  test('workout 60 push day keeps the note', () => {
    expect(log('workout 60 push day').text).toBe('push day')
  })

  test('pt 30 is a portuguese session, not a workout', () => {
    expect(log('pt 30')).toMatchObject({ kind: 'session', area: 'portuguese' })
  })

  test('weight 75.4', () => {
    expect(log('weight 75.4')).toMatchObject({ value: 75.4, unit: 'kg' })
  })

  test('weight 75,4 — a comma decimal is a European keyboard, not a typo', () => {
    expect(log('weight 75,4').value).toBe(75.4)
  })

  test('spend 48 groceries', () => {
    expect(log('spend 48 groceries')).toMatchObject({
      kind: 'expense',
      area: 'money',
      value: 48,
      text: 'groceries',
    })
  })

  test("note defaults to 'life' — the badge changes it later", () => {
    expect(log('note buy a better desk lamp')).toMatchObject({
      kind: 'note',
      area: 'life',
      text: 'buy a better desk lamp',
    })
  })
})

describe('it refuses rather than guesses', () => {
  test('an unknown verb is not filed as custom', () => {
    const result = parseCapture('ran 5k')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('not a verb')
  })

  test('a verb needing a number says so', () => {
    const result = parseCapture('workout')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('number')
  })

  test('a bare note is refused', () => {
    expect(parseCapture('note').ok).toBe(false)
  })

  test('empty input is refused', () => {
    expect(parseCapture('   ').ok).toBe(false)
  })

  test('verbs are case-insensitive', () => {
    expect(parseCapture('Workout 45').ok).toBe(true)
  })
})
