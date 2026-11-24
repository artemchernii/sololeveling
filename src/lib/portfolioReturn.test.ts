import { describe, expect, test } from 'vitest'

import { dayReturn, highLow, netDeposits, rangeReturn } from './portfolioReturn'

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
  test('a buy is taken out: a rise that was only money put in is no return', () => {
    const r = rangeReturn(
      ends,
      [1000, 990, 2000, 1950, 1900],
      [0, 0, 1000, 0, 0],
      4,
    )
    expect(r).toMatchObject({
      start: 1000,
      end: 1900,
      deposits: 1000,
      change: -100,
      pct: -5,
    })
    expect(r?.points.map((p) => p.deposit)).toEqual([0, 0, 1000, 0, 0])
  })

  test('the range is the last days, the first deposit of it not counted', () => {
    const r = rangeReturn(
      ends,
      [1000, 1100, 1200, 1300, 1250],
      [0, 500, 0, 0, 0],
      1,
    )
    expect(r).toMatchObject({
      start: 1300,
      end: 1250,
      deposits: 0,
      change: -50,
    })
  })

  test('a range longer than the data starts at the first day with a value', () => {
    const r = rangeReturn(
      ends,
      [null, null, 500, 520, 510],
      [0, 0, 500, 0, 0],
      30,
    )
    expect(r).toMatchObject({
      startAt: 3 * DAY,
      start: 500,
      deposits: 0,
      change: 10,
      pct: 2,
    })
  })

  test('a day with no value passes its deposits to the next one', () => {
    const r = rangeReturn(
      ends,
      [1000, null, 1600, 1600, 1600],
      [0, 500, 0, 0, 0],
      4,
    )
    expect(r).toMatchObject({ deposits: 500, change: 100 })
  })

  test('fewer than two days with a value: no return', () => {
    expect(
      rangeReturn(ends, [null, null, null, null, 700], [0, 0, 0, 0, 0], 4),
    ).toBeNull()
  })
})

describe('dayReturn', () => {
  /* Thu 19 … Mon 23 Nov 2026, noon local. */
  const week = [19, 20, 21, 22, 23].map((d) =>
    new Date(2026, 10, d, 12).getTime(),
  )

  test('on a Monday, PREV. CLOSE is Friday, not Sunday', () => {
    const r = dayReturn(week, [990, 1000, 1001, 1002, 1100], [0, 0, 0, 0, 0])
    expect(r).toMatchObject({
      startAt: week[1],
      start: 1000,
      end: 1100,
      change: 100,
    })
  })

  test('a buy over the weekend is taken out of the day', () => {
    const r = dayReturn(week, [990, 1000, 1000, 1500, 1520], [0, 0, 0, 500, 0])
    expect(r).toMatchObject({
      start: 1000,
      end: 1520,
      deposits: 500,
      change: 20,
    })
  })

  test('on a Tuesday it is Monday', () => {
    const days = [23, 24].map((d) => new Date(2026, 10, d, 12).getTime())
    expect(dayReturn(days, [1000, 1010], [0, 0])).toMatchObject({
      startAt: days[0],
      change: 10,
    })
  })
})

describe('highLow', () => {
  const pt = (value: number, at: number) => ({ at, value })

  test('the highest and lowest day, and the last day against the high', () => {
    const h = highLow([pt(100, 1), pt(120, 2), pt(90, 3), pt(110, 4)])
    expect(h).toEqual({
      high: { at: 2, value: 120 },
      low: { at: 3, value: 90 },
      last: { at: 4, value: 110 },
      vsHigh: -10,
      pct: -8.3,
    })
  })

  test('a new high today: 0 from it', () => {
    expect(highLow([pt(100, 1), pt(130, 2)])).toMatchObject({
      vsHigh: 0,
      pct: 0,
    })
  })

  test('one day is no range', () => {
    expect(highLow([pt(100, 1)])).toBeNull()
  })
})
