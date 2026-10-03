import { describe, expect, test } from 'vitest'

import {
  HISTORY_GRACE_MS,
  balanceChecks,
  balanceGaps,
  balanceSeries,
  coveredBy,
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

describe('balanceGaps', () => {
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

describe('a wallet carried back (1 Oct)', () => {
  const ends = [1, 2, 3, 4].map((d) => new Date(2026, 8, d, 23, 59).getTime())
  const typed = { at: new Date(2026, 8, 3, 12).getTime(), value: 5000 }

  test('its earliest balance is drawn flat before it', () => {
    expect(balanceSeries(ends, [typed], [], true)).toEqual([
      5000, 5000, 5000, 5000,
    ])
  })

  test('anything else still starts where it is known', () => {
    expect(balanceSeries(ends, [typed], [])).toEqual([null, null, 5000, 5000])
  })
})

describe('balanceChecks', () => {
  test('every pair, with its rows and their sum — his ActivoBank today', () => {
    const t0 = new Date(2026, 7, 31, 12).getTime()
    const t1 = new Date(2026, 8, 27, 19).getTime()
    expect(
      balanceChecks(
        [
          { at: t1, value: 575.36 },
          { at: t0, value: 308.82 },
        ],
        [
          { at: t0 + D, cents: 110000, fromFile: true },
          { at: t1 - D, cents: -10000, fromFile: false },
          { at: t1 - 2 * D, cents: -73346, fromFile: true },
        ],
      ),
    ).toEqual([
      {
        from: t0,
        to: t1,
        fromValue: 308.82,
        rows: 3,
        sum: 266.54,
        expected: 575.36,
        read: 575.36,
        missing: 0,
        bookedLater: null,
        pendingPart: null,
      },
    ])
  })

  test('a balance that already had a row the bank books the next day adds up — and the row is not counted twice (ActivoBank, 27 Sep)', () => {
    const aug31 = new Date(2026, 7, 31, 23).getTime()
    const sep27 = new Date(2026, 8, 27, 18).getTime()
    const sep30 = new Date(2026, 8, 30, 18).getTime()
    const at = (d: number) => new Date(2026, 8, d, 12).getTime()
    const rows = [
      { at: at(1), cents: 110000, fromFile: true },
      { at: at(3), cents: -113346, fromFile: true },
      { at: at(26), cents: 40000, fromFile: true },
      // MB WAY to Oleksandr: in the app's balance on the 27th, booked the 28th
      { at: at(28), cents: -10000, fromFile: true },
      { at: at(29), cents: -13372, fromFile: true },
      { at: at(30), cents: -598, fromFile: true },
    ]
    const checks = balanceChecks(
      [
        { at: aug31, value: 308.82 },
        { at: sep27, value: 575.36 },
        { at: sep30, value: 435.66 },
      ],
      rows,
    )
    expect(checks.map((c) => [c.missing, c.bookedLater])).toEqual([
      [0, { amount: -100, at: at(28) }],
      [0, null],
    ])
  })

  test('a gap no row after it explains is still a gap', () => {
    const a = new Date(2026, 8, 3, 18).getTime()
    const b = new Date(2026, 8, 10, 18).getTime()
    const [c] = balanceChecks(
      [
        { at: a, value: 742.36 },
        { at: b, value: 521.36 },
      ],
      [{ at: b + 5 * D, cents: -10000, fromFile: true }],
    )
    expect(c.missing).toBe(-221)
  })

  test('money the screen showed pending explains a balance below its rows (3 Oct)', () => {
    const a = new Date(2026, 8, 30, 18).getTime()
    const b = new Date(2026, 9, 3, 14).getTime()
    const [c] = balanceChecks(
      [
        { at: a, value: 435.66 },
        { at: b, value: 153.21, pending: -1205.2 },
      ],
      [
        // 1–2 Oct: +100, −2.25, +1,000, −175
        { at: a + D, cents: 92275, fromFile: true },
        // the Revolut top-up, from Revolut's file
        { at: b - D, cents: -70000, fromFile: false },
      ],
    )
    expect([c.missing, c.pendingPart]).toEqual([0, -505.2])
    // More than was pending is not explained by it.
    const [d] = balanceChecks(
      [
        { at: a, value: 435.66 },
        { at: b, value: 153.21, pending: -100 },
      ],
      [{ at: a + D, cents: 22275, fromFile: true }],
    )
    expect(d.pendingPart).toBe(null)
  })
})
