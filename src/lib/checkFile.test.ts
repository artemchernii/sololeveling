import { describe, expect, test } from 'vitest'

import { addLabel, groupByDay, landedTitle, rowsSpan } from './checkFile'

const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime()

describe('the check screen', () => {
  test('the span a file covers, as he liked it', () => {
    expect(rowsSpan([at(4), at(1), at(2)])).toBe('Oct 1, 2026 → Oct 4, 2026')
    expect(rowsSpan([at(3), at(3, 9)])).toBe('Oct 3, 2026')
    expect(rowsSpan([])).toBeNull()
  })

  test('one heading a day, the order kept', () => {
    const rows = [
      { occurredAt: at(4), n: 'a' },
      { occurredAt: at(4), n: 'b' },
      { occurredAt: at(2), n: 'c' },
    ]
    expect(groupByDay(rows).map(([, l]) => l.map((r) => r.n))).toEqual([
      ['a', 'b'],
      ['c'],
    ])
  })

  test('the button says what pressing it does', () => {
    expect(
      addLabel({ rows: 2, noun: 'payments', orders: 0, balance: true }),
    ).toBe('add 2 payments and the balance')
    expect(addLabel({ rows: 0, noun: 'rows', orders: 0, balance: true })).toBe(
      'update the balance',
    )
    expect(addLabel({ rows: 3, noun: 'rows', orders: 1, balance: false })).toBe(
      'add 3 rows, 1 order',
    )
    expect(addLabel({ rows: 0, noun: 'rows', orders: 0, balance: false })).toBe(
      'done',
    )
  })

  test('landed says what he asks: is the account right now', () => {
    expect(landedTitle(['Revolut'], true)).toBe('Revolut is up to date')
    expect(landedTitle(['Revolut'], false)).toBe('Revolut updated')
    expect(landedTitle(['Revolut', 'BPI', 'ActivoBank'], true)).toBe(
      '3 accounts up to date',
    )
    expect(landedTitle([], true)).toBe('Saved')
  })
})
