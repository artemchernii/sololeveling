import { describe, expect, test } from 'vitest'

import { afterWords, goesParts, goesVerb } from './undoFile'

const none = {
  rows: 0,
  trades: 0,
  positions: 0,
  balanceDay: null,
  cash: false,
}

describe('what goes', () => {
  test('a bank screenshot: rows and its balance', () => {
    const g = { ...none, rows: 2, balanceDay: '11 Oct' }
    expect(goesParts(g)).toEqual(['2 rows', 'the balance of 11 Oct'])
    expect(goesVerb(g)).toBe('go')
  })
  test('a broker screen: positions and the cash, never a plus', () => {
    const g = { ...none, positions: 15, balanceDay: '3 Oct', cash: true }
    expect(goesParts(g)).toEqual(['15 positions and the cash'])
    expect(goesVerb(g)).toBe('go')
  })
  test('a stocks file', () => {
    expect(goesParts({ ...none, trades: 212 })).toEqual(['212 buys and sells'])
  })
  test('one thing goes', () => {
    expect(goesVerb({ ...none, rows: 1 })).toBe('goes')
    expect(goesVerb({ ...none, balanceDay: '3 Oct' })).toBe('goes')
    expect(goesVerb({ ...none, rows: 23 })).toBe('go')
  })
  test('a file that wrote nothing here', () => {
    expect(goesParts(none)).toEqual([])
  })
})

describe('afterwards', () => {
  test('back to the balance before', () => {
    expect(
      afterWords({ account: 'ActivoBank', now: '€90.35', after: '€153.21' }),
    ).toBe('ActivoBank is €153.21 again.')
  })
  test('an older file: nothing moves', () => {
    expect(
      afterWords({ account: 'ActivoBank', now: '€90.35', after: '€90.35' }),
    ).toBe('ActivoBank stays €90.35.')
  })
  test('the only balance went', () => {
    expect(
      afterWords({ account: 'ActivoBank', now: '€90.35', after: null }),
    ).toBe('ActivoBank has no balance now.')
  })
  test('a stocks file says nothing of cash', () => {
    expect(afterWords({ account: 'Revolut', now: null, after: null })).toBe(
      'Revolut is as it was before this file.',
    )
  })
})
