import { describe, expect, test } from 'vitest'

import {
  formatLine,
  lineFromLog,
  parseCapture,
  suggestVerbs,
} from './capture-parser'

/* The parser is the whole of PLAN.md §3's "three seconds, no form" promise, and
   it is pure — so it is cheap to pin down exactly. */

function parsed(input: string) {
  const result = parseCapture(input)
  if (!result.ok) {
    throw new Error(`expected "${input}" to parse: ${result.message}`)
  }
  return result
}

function log(input: string) {
  return parsed(input).log
}

describe('the verbs', () => {
  test('gym on its own logs — the dashboard counts sessions, not minutes', () => {
    expect(log('gym')).toEqual({
      kind: 'workout',
      area: 'body',
      value: undefined,
      unit: 'min',
      text: undefined,
    })
  })

  test('workout is another spelling of gym', () => {
    expect(log('workout 60')).toMatchObject({ kind: 'workout', value: 60 })
  })

  test('gym 60 push day keeps the note', () => {
    expect(log('gym 60 push day')).toMatchObject({
      value: 60,
      text: 'push day',
    })
  })

  test('pt is a portuguese session, not a workout', () => {
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

  test('invest 500 is a transfer, filed under money', () => {
    expect(log('invest 500')).toMatchObject({
      kind: 'transfer',
      area: 'money',
      value: 500,
      unit: 'eur',
    })
  })

  test("note defaults to 'life' — the badge changes it later", () => {
    expect(log('note buy a better desk lamp')).toMatchObject({
      kind: 'note',
      area: 'life',
      text: 'buy a better desk lamp',
    })
  })

  test('a note keeps its numbers as words', () => {
    expect(log('note call 3 people')).toMatchObject({ text: 'call 3 people' })
  })
})

describe('the number can sit anywhere after the verb', () => {
  test('pt homework 20 and pt 20 homework are the same line', () => {
    expect(log('pt homework 20')).toEqual(log('pt 20 homework'))
    expect(log('pt homework 20')).toMatchObject({ value: 20, text: 'homework' })
  })

  test('spend groceries 48', () => {
    expect(log('spend groceries 48')).toMatchObject({
      value: 48,
      text: 'groceries',
    })
  })
})

describe('defaults are real values, and say that they are defaults', () => {
  test('a bare pt is a 50 minute class', () => {
    const result = parsed('pt')
    expect(result.log).toMatchObject({ value: 50, text: 'class' })
    expect(result.defaulted).toEqual({ value: true, text: true })
    expect(result.typed).toEqual({ value: undefined, text: undefined })
  })

  test('a typed number replaces the default and is not marked as one', () => {
    const result = parsed('pt homework 20')
    expect(result.defaulted).toEqual({ value: false, text: false })
  })

  test('pt homework still takes the 50, visibly', () => {
    const result = parsed('pt homework')
    expect(result.log).toMatchObject({ value: 50, text: 'homework' })
    expect(result.defaulted).toEqual({ value: true, text: false })
  })

  test('gym has no default minutes — nothing is invented', () => {
    expect(parsed('gym').defaulted).toEqual({ value: false, text: false })
  })
})

describe('it refuses rather than guesses', () => {
  test('an unknown verb is not filed as anything', () => {
    const result = parseCapture('ran 5k')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("isn't a verb")
      expect(result.verb).toBeUndefined()
    }
  })

  test('a verb that needs a number says so, and is still recognised', () => {
    const result = parseCapture('weight')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('number')
      expect(result.verb?.kind).toBe('weight')
    }
  })

  test('a bare note is refused', () => {
    expect(parseCapture('note').ok).toBe(false)
  })

  test('empty input is refused', () => {
    expect(parseCapture('   ').ok).toBe(false)
  })

  test('verbs are case-insensitive', () => {
    expect(parseCapture('Gym 45').ok).toBe(true)
  })
})

describe('suggestVerbs', () => {
  test('completes a partial first word', () => {
    expect(suggestVerbs('gy')).toEqual(['gym'])
  })

  test('offers every verb that fits, in listed order', () => {
    expect(suggestVerbs('w')).toEqual(['workout', 'weight'])
  })

  test('what you used most recently wins', () => {
    expect(suggestVerbs('w', ['weight', 'gym'])).toEqual(['weight', 'workout'])
  })

  test('nothing once the word is complete or a space is typed', () => {
    expect(suggestVerbs('gym')).toEqual([])
    expect(suggestVerbs('gy ')).toEqual([])
    expect(suggestVerbs('')).toEqual([])
  })
})

describe('formatLine and lineFromLog', () => {
  test('formatLine drops what is missing', () => {
    expect(formatLine({ word: 'pt', value: 20, text: 'homework' })).toBe(
      'pt 20 homework',
    )
    expect(formatLine({ word: 'gym' })).toBe('gym')
  })

  test('a default class goes back as a bare pt', () => {
    expect(
      lineFromLog({
        kind: 'session',
        area: 'portuguese',
        value: 50,
        text: 'class',
      }),
    ).toBe('pt')
  })

  test('a workout goes back as gym, the word actually used', () => {
    expect(lineFromLog({ kind: 'workout', area: 'body', value: 60 })).toBe(
      'gym 60',
    )
  })

  test('a log no verb can say is not offered again', () => {
    expect(lineFromLog({ kind: 'task_done', area: 'life' })).toBeNull()
  })

  test('every line it writes parses back to the same row', () => {
    const rows = [
      {
        kind: 'session' as const,
        area: 'portuguese' as const,
        value: 20,
        text: 'homework',
      },
      {
        kind: 'expense' as const,
        area: 'money' as const,
        value: 48,
        text: 'groceries',
      },
      { kind: 'weight' as const, area: 'body' as const, value: 75.4 },
      { kind: 'note' as const, area: 'life' as const, text: 'call 3 people' },
    ]
    for (const row of rows) {
      const line = lineFromLog(row)!
      expect(log(line)).toMatchObject(row)
    }
  })
})
