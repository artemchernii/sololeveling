import { describe, expect, test } from 'vitest'

import {
  HISTORY_GRACE_MS,
  balanceGaps,
  balanceSeries,
  coveredBy,
  rangeChange,
} from './cashHistory'

const D = 86_400_000
const day = (n: number) => n * D
const end = (n: number) => day(n) + D - 1
const noon = (n: number) => day(n) + D / 2

describe('balanceSeries', () => {
  test('forward from a reading, back before it, null before anything', () => {
    const s = balanceSeries(
      [end(3), end(5), end(9), end(10), end(12)],
      [{ at: end(10), value: 100 }],
      [
        { at: noon(5), cents: -2000, fromFile: false },
        { at: noon(12), cents: -3000, fromFile: false },
      ],
    )
    expect(s).toEqual([null, 100, 100, 100, 70])
  })

  test('an August statement: its rows are inside its closing balance', () => {
    const close = end(31) - HISTORY_GRACE_MS + 1
    const s = balanceSeries(
      [end(2), end(3), end(20), end(31), end(40)],
      [{ at: close, value: 500 }],
      [
        { at: noon(3), cents: -1000, fromFile: true },
        { at: noon(20), cents: 5000, fromFile: true },
        { at: noon(31), cents: -2000, fromFile: true },
      ],
    )
    /* Before the first row: nothing known. Aug 3: 500 back past Aug 31's
       −20 and Aug 20's +50 → 470. Aug 20: 520. Aug 31: 500. */
    expect(s).toEqual([null, 470, 520, 500, 500])
  })

  test('no reading, no line', () => {
    expect(
      balanceSeries(
        [end(1)],
        [],
        [{ at: noon(1), cents: 100, fromFile: false }],
      ),
    ).toEqual([null])
  })

  test('the latest reading before the day wins', () => {
    const s = balanceSeries(
      [end(2), end(4)],
      [
        { at: end(1), value: 10 },
        { at: end(3), value: 50 },
      ],
      [{ at: noon(2), cents: 500, fromFile: false }],
    )
    expect(s).toEqual([15, 50])
  })
})

describe('rangeChange', () => {
  test('an account joining is marked, not counted as gain (Cash, 27 Sep)', () => {
    const bank = [100, 110, 90, 95]
    const cash = [null, null, 5000, 5000]
    const total = [100, 110, 5090, 5095]
    const r = rangeChange(
      total,
      [
        { accountId: 'bank', values: bank },
        { accountId: 'cash', values: cash },
      ],
      0,
    )
    expect(r.joins).toEqual([{ index: 2, accountId: 'cash', value: 5000 }])
    expect(r.change).toBe(-5)
  })

  test('an account there from the range’s first day is not a join', () => {
    const r = rangeChange(
      [null, 5100, 5200],
      [
        { accountId: 'a', values: [null, 100, 200] },
        { accountId: 'b', values: [null, 5000, 5000] },
      ],
      0,
    )
    expect(r).toEqual({ change: 100, joins: [] })
  })

  test('the range starts later: only what joins inside it', () => {
    const r = rangeChange(
      [100, 100, 600, 700],
      [
        { accountId: 'a', values: [100, 100, 100, 200] },
        { accountId: 'b', values: [null, null, 500, 500] },
      ],
      2,
    )
    expect(r).toEqual({ change: 100, joins: [] })
  })

  test('fewer than two drawn days: no change', () => {
    expect(rangeChange([null, 5], [], 0).change).toBeNull()
  })
})

describe('balanceGaps', () => {
  const D = 86_400_000
  const t0 = new Date(2026, 8, 3, 12).getTime()

  test('his ActivoBank case: one −€100 row cut off the screenshot', () => {
    const gaps = balanceGaps(
      [
        { at: t0, value: 800 },
        { at: t0 + 7 * D, value: 575.36 },
      ],
      [
        { at: t0 + 2 * D, cents: -8464, fromFile: true },
        { at: t0 + 4 * D, cents: -4000, fromFile: false },
      ],
    )
    expect(gaps).toEqual([
      {
        from: t0,
        to: t0 + 7 * D,
        expected: 675.36,
        read: 575.36,
        missing: -100,
      },
    ])
  })

  test('rows that explain the change: no gap', () => {
    expect(
      balanceGaps(
        [
          { at: t0, value: 100 },
          { at: t0 + D, value: 50 },
        ],
        [{ at: t0 + 3_600_000, cents: -5000, fromFile: false }],
      ),
    ).toEqual([])
  })

  test('a statement’s own rows sit inside its closing reading', () => {
    /* Read at 2 am on its closing day; its last row stamped noon. */
    const close = t0 + 7 * D - 10 * 3_600_000
    expect(
      balanceGaps(
        [
          { at: t0, value: 100 },
          { at: close, value: 80 },
        ],
        [{ at: t0 + 7 * D, cents: -2000, fromFile: true }],
      ),
    ).toEqual([])
  })

  test('one reading has nothing to check against', () => {
    expect(balanceGaps([{ at: t0, value: 100 }], [])).toEqual([])
  })
})

describe('coveredBy', () => {
  const r1 = { at: 100, value: 1 }
  const r2 = { at: 200, value: 2 }
  test('the first reading on or after the row', () => {
    expect(coveredBy(150, [r2, r1])).toBe(r2)
    expect(coveredBy(100, [r1, r2])).toBe(r1)
  })
  test('after the latest reading: nothing covers it', () => {
    expect(coveredBy(250, [r1, r2])).toBeNull()
  })
})
