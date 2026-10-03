import { describe, expect, test } from 'vitest'

import {
  applyOrder,
  balanceGaps,
  coverage,
  monthKey,
  pairAcross,
  reviewMonths,
} from './bulk'

const day = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 12).getTime()

describe('reviewMonths', () => {
  test('one September is drawn against its year', () => {
    const m = reviewMonths([day(2026, 9, 2), day(2026, 9, 28)])
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2025-10')
    expect(m.at(-1)).toBe('2026-09')
  })

  test('a long drop keeps its latest two years', () => {
    const m = reviewMonths([day(2023, 1, 5), day(2026, 9, 28)])
    expect(m).toHaveLength(24)
    expect(m[0]).toBe('2024-10')
  })

  test('nothing read, nothing drawn', () => {
    expect(reviewMonths([])).toEqual([])
  })
})

describe('coverage', () => {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']

  test('what it had, what the drop adds, and the hole between', () => {
    const had = [day(2026, 1, 10)]
    const adds = [day(2026, 2, 3), day(2026, 4, 2)]
    expect(coverage(months, had, adds).map((m) => m.state)).toEqual([
      'had',
      'add',
      'hole',
      'add',
      'none',
    ])
  })

  test('a month he said was quiet is not a hole', () => {
    const adds = [day(2026, 2, 3), day(2026, 4, 2)]
    expect(coverage(months, [], adds, ['2026-03']).map((m) => m.state)).toEqual(
      ['none', 'add', 'none', 'add', 'none'],
    )
  })

  test('a gap only in old history is not asked (3 Oct)', () => {
    const had = [day(2026, 1, 10), day(2026, 3, 10)]
    const adds = [day(2026, 5, 2)]
    expect(coverage(months, had, adds).map((m) => m.state)).toEqual([
      'had',
      'none',
      'had',
      'hole',
      'add',
    ])
    expect(coverage(months, had, []).map((m) => m.state)).toEqual([
      'had',
      'none',
      'had',
      'none',
      'none',
    ])
  })

  test('the drop wins a month both had and brought', () => {
    const t = day(2026, 2, 3)
    expect(coverage(months, [t], [t])[1].state).toBe('add')
  })
})

describe('balanceGaps', () => {
  const bal = (m: number, d: number, value: number) => ({
    asOf: day(2026, m, d),
    value,
  })
  const r = (m: number, d: number, amount: number) => ({
    occurredAt: day(2026, m, d),
    amount,
  })

  test('balances that agree with their rows: no gap', () => {
    expect(
      balanceGaps(
        [bal(8, 31, 500), bal(9, 30, 421.5)],
        [r(9, 3, -60), r(9, 20, -18.5)],
      ),
    ).toEqual([])
  })

  test('his ActivoBank case: one row cut off — where, and how much', () => {
    const gaps = balanceGaps(
      [bal(9, 3, 742.36), bal(9, 10, 521.36)],
      [r(9, 3, -999), r(9, 5, -121)],
    )
    expect(gaps).toEqual([
      { from: day(2026, 9, 3), to: day(2026, 9, 10), gap: -100 },
    ])
  })

  test("a row the bank dates the day after the balance that already had it: no gap, and not counted again (ActivoBank's MB WAY)", () => {
    expect(
      balanceGaps(
        [bal(8, 31, 308.82), bal(9, 27, 575.36), bal(9, 30, 435.66)],
        [
          r(9, 1, 1100),
          r(9, 3, -1133.46),
          r(9, 26, 400),
          r(9, 28, -100),
          r(9, 29, -133.72),
          r(9, 30, -5.98),
        ],
      ),
    ).toEqual([])
  })

  test('a row on the closing day belongs to that balance, not the next', () => {
    expect(
      balanceGaps([bal(9, 3, 100), bal(9, 4, 90)], [r(9, 4, -10)]),
    ).toEqual([])
  })

  test('cents, not floats', () => {
    expect(
      balanceGaps([bal(9, 1, 0.1), bal(9, 2, 0.3)], [r(9, 2, 0.2)]),
    ).toEqual([])
  })
})

describe('pairAcross', () => {
  const own = (
    key: string,
    accountId: string,
    amount: number,
    occurredAt: number,
    otherAccountId: string | null = null,
  ) => ({ key, accountId, amount, occurredAt, otherAccountId })

  test('a top-up and its debit two days later are one transfer', () => {
    const r = pairAcross([
      own('rev-topup', 'rev', 1000, day(2026, 9, 1), 'act'),
      own('act-debit', 'act', -1000, day(2026, 9, 3)),
    ])
    expect(r).toEqual({ pairs: [['act-debit', 'rev-topup']], oneSide: [] })
  })

  test('a named other account pairs only with that account', () => {
    const r = pairAcross([
      own('bpi-out', 'bpi', -500, day(2026, 9, 3), 'act'),
      own('rev-in', 'rev', 500, day(2026, 9, 3)),
    ])
    expect(r.pairs).toEqual([])
    expect(r.oneSide).toEqual(['rev-in'])
  })

  test('money from him with no sender in the drop is one side', () => {
    const r = pairAcross([own('act-in', 'act', 250, day(2026, 9, 27))])
    expect(r).toEqual({ pairs: [], oneSide: ['act-in'] })
  })

  test('outside the window, or a different amount, is not a pair', () => {
    const r = pairAcross([
      own('a', 'rev', -2424.96, day(2026, 8, 18), 'tr'),
      own('b', 'tr', 2400, day(2026, 8, 18)),
      own('c', 'bpi', -50, day(2026, 8, 1)),
      own('d', 'act', 50, day(2026, 8, 10)),
    ])
    expect(r.pairs).toEqual([])
    expect(r.oneSide).toEqual(['b', 'c', 'd'])
  })

  test('each row is used once; the nearer day wins', () => {
    const r = pairAcross([
      own('out', 'bpi', -100, day(2026, 9, 3)),
      own('in-far', 'rev', 100, day(2026, 9, 5)),
      own('in-near', 'act', 100, day(2026, 9, 3)),
    ])
    expect(r.pairs).toEqual([['out', 'in-near']])
    expect(r.oneSide).toEqual(['in-far'])
  })
})

describe('applyOrder', () => {
  test('oldest statement first; one with no rows last', () => {
    const files = [
      { id: 'sep', to: day(2026, 9, 30) },
      { id: 'none', to: null },
      { id: 'aug', to: day(2026, 8, 31) },
    ]
    expect(applyOrder(files).map((f) => f.id)).toEqual(['aug', 'sep', 'none'])
  })
})

test('monthKey is local', () => {
  expect(monthKey(new Date(2026, 0, 31, 23, 30).getTime())).toBe('2026-01')
})
