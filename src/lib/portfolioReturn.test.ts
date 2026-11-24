import { describe, expect, test } from 'vitest'

import { dayReturn, netDeposits, rangeReturn } from './portfolioReturn'

const DAY = 86_400_000
/* Five day ends, the last one today. */
const ends = [1, 2, 3, 4, 5].map((d) => d * DAY)
const buy = (at: number, shares: number, priceEur: number) => ({
  side: 'buy' as const,
  shares,
  priceEur,
  occurredAt: at,
})

describe('netDeposits', () => {
  test('a buy counts on its day, a sell takes out, a reward adds nothing', () => {
    expect(
      netDeposits(ends, [
        buy(2.5 * DAY, 2, 50),
        { ...buy(3.2 * DAY, 1, 30), side: 'sell' },
        buy(4.5 * DAY, 10, 0),
      ]),
    ).toEqual([0, 0, 100, -30, 0])
  })

  test('a trade before the first day drawn is already in its value', () => {
    expect(
      netDeposits(ends, [buy(-3 * DAY, 1, 999), buy(0.5 * DAY, 1, 10)]),
    ).toEqual([10, 0, 0, 0, 0])
  })

  test('a trade after the last day end is left for tomorrow', () => {
    expect(netDeposits(ends, [buy(5.5 * DAY, 1, 10)])).toEqual([0, 0, 0, 0, 0])
  })
})

describe('rangeReturn', () => {
  test('a buy lifts value and cost alike: no return in it', () => {
    /* Up 100 on 1000 paid, then 1000 more bought, then down 50. */
    const r = rangeReturn(
      ends,
      [1000, 1100, 2100, 2050, 2050],
      [1000, 1000, 2000, 2000, 2000],
      [0, 0, 1000, 0, 0],
      4,
    )
    expect(r).toMatchObject({ start: 1000, end: 2050, change: 50, pct: 2.5 })
    expect(r?.points.map((p) => p.deposit)).toEqual([0, 0, 1000, 0, 0])
  })

  test('a range longer than the data starts at the first day with a value', () => {
    const r = rangeReturn(
      ends,
      [null, null, 500, 520, 510],
      [null, null, 500, 500, 500],
      [0, 0, 500, 0, 0],
      30,
    )
    expect(r).toMatchObject({ startAt: 3 * DAY, change: 10 })
  })

  test('no cost known for a day: counted at its value', () => {
    const r = rangeReturn(ends.slice(0, 2), [100, 120], [null, null], [0, 0], 1)
    expect(r?.points.map((p) => p.cost)).toEqual([100, 120])
  })

  test('fewer than two days with a value: no return', () => {
    expect(
      rangeReturn(ends, [null, null, null, null, 700], [], [0, 0, 0, 0, 0], 4),
    ).toBeNull()
  })
})

describe('dayReturn', () => {
  /* Thu 19 … Mon 23 Nov 2026, noon local. */
  const week = [19, 20, 21, 22, 23].map((d) =>
    new Date(2026, 10, d, 12).getTime(),
  )

  test('on a Monday, PREV. CLOSE is Friday, not Sunday', () => {
    const r = dayReturn(
      week,
      [990, 1000, 1001, 1002, 1100],
      [900, 900, 900, 900, 900],
      [0, 0, 0, 0, 0],
    )
    expect(r).toMatchObject({
      startAt: week[1],
      start: 1000,
      end: 1100,
      change: 100,
    })
  })

  test('on a Tuesday it is Monday', () => {
    const days = [23, 24].map((d) => new Date(2026, 10, d, 12).getTime())
    expect(dayReturn(days, [1000, 1010], [1000, 1000], [0, 0])).toMatchObject({
      startAt: days[0],
      change: 10,
    })
  })
})
