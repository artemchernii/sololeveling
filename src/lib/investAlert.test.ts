import { describe, expect, test } from 'vitest'

import {
  badgeOf,
  bigDay,
  callTurn,
  closePush,
  earnSoon,
  nextEvening,
  plainCompany,
  reported,
} from './investAlert'

/* CLOSE (spec docs/specs/2026-10-22-n3-investment-alerts.md). Vitest
   runs in Lisbon. Closes at 21:00 UTC; checked the morning after. */

const DAY = 86_400_000
const close = (m: number, d: number, price: number) => ({
  asOf: Date.UTC(2026, m - 1, d, 21),
  price,
})
const morning = (m: number, d: number) => Date.UTC(2026, m - 1, d, 8)

describe('plainCompany', () => {
  test('drops the legal ending', () => {
    expect(plainCompany('Netflix, Inc.')).toBe('Netflix')
    expect(plainCompany('ASML Holding N.V.')).toBe('ASML')
    expect(plainCompany('Microsoft Corporation')).toBe('Microsoft')
    expect(plainCompany('Tesla')).toBe('Tesla')
  })
})

describe('S1 big day', () => {
  test('6% on the close before, fresh → rings with both closes', () => {
    const b = bigDay(
      [close(10, 20, 248.1), close(10, 21, 232.7)],
      morning(10, 22),
    )
    expect(b).not.toBeNull()
    expect(b!.pct).toBeCloseTo(-6.21, 2)
    expect(badgeOf({ kind: 'big', pct: b!.pct })).toEqual({
      text: 'BIG DAY',
      tone: 'bad',
    })
  })
  test('4% → quiet', () => {
    expect(
      bigDay([close(10, 20, 100), close(10, 21, 104)], morning(10, 22)),
    ).toBeNull()
  })
  test('the newest close a day and more old → quiet (Sunday sees Friday once)', () => {
    expect(
      bigDay([close(10, 15, 100), close(10, 16, 110)], morning(10, 18)),
    ).toBeNull()
  })
  test('one close → quiet', () => {
    expect(bigDay([close(10, 21, 100)], morning(10, 22))).toBeNull()
  })
})

describe('S2 the call changes', () => {
  /* 250 closes rising with a zigzag (RSI near 57), then a dip under the 50-day average with the
     200-day still below: HOLD the day before, ADD with the dip. */
  const rising = Array.from({ length: 250 }, (_, k) => ({
    asOf: Date.UTC(2026, 9, 21, 21) - (250 - k) * DAY,
    price: 100 + k * 0.4 + (k % 2 ? 1.5 : -1.5),
  }))
  const dip = { asOf: Date.UTC(2026, 9, 21, 21), price: 180 }
  test('HOLD → ADD rings, with the rows that made it', () => {
    const t = callTurn([...rising, dip], null, morning(10, 22))
    expect(t).not.toBeNull()
    expect(t!.was).toBe('hold')
    expect(t!.now).toBe('add')
    expect(t!.why).toEqual(['SMA 200 bullish', 'SMA 50 bearish'])
    expect(badgeOf({ kind: 'call', ...t! })).toEqual({
      text: 'HOLD → ADD',
      tone: 'good',
    })
  })
  test('the same call → quiet', () => {
    const up = { asOf: Date.UTC(2026, 9, 21, 21), price: 200.4 }
    expect(callTurn([...rising, up], null, morning(10, 22))).toBeNull()
  })
  test('a stale close → quiet', () => {
    expect(callTurn([...rising, dip], null, morning(10, 24))).toBeNull()
  })
})

describe('S3 earnings soon', () => {
  const report = Date.UTC(2026, 9, 20, 20, 5)
  test('two days away → rings', () => {
    expect(earnSoon(report, morning(10, 18))).toBe(true)
    expect(badgeOf({ kind: 'soon', at: report }).text).toBe('EARNINGS 20 OCT')
  })
  test('three days, one day, none → quiet', () => {
    expect(earnSoon(report, morning(10, 17))).toBe(false)
    expect(earnSoon(report, morning(10, 19))).toBe(false)
    expect(earnSoon(null, morning(10, 18))).toBe(false)
  })
})

describe('S4 reported', () => {
  const after = Date.UTC(2026, 9, 20, 21, 5) // after the 20 Oct close
  const closes = [
    close(10, 19, 1170),
    close(10, 20, 1180.4),
    close(10, 21, 1117.8),
  ]
  test('the first close after → rings with the close before', () => {
    const r = reported(closes, after, morning(10, 22))
    expect(r).not.toBeNull()
    expect(r!.from.price).toBe(1180.4)
    expect(r!.to.price).toBe(1117.8)
    expect(badgeOf({ kind: 'reported', ...r! }).text).toBe('REPORTED ▼ 5.3%')
  })
  test('before the open → the day before is the base', () => {
    const r = reported(
      closes.slice(0, 2),
      Date.UTC(2026, 9, 20, 11),
      morning(10, 21),
    )
    expect(r?.from.price).toBe(1170)
    expect(r?.to.price).toBe(1180.4)
  })
  test('the second close after → quiet', () => {
    expect(
      reported([...closes, close(10, 22, 1120)], after, morning(10, 23)),
    ).toBeNull()
  })
  test('no close after yet → quiet', () => {
    expect(reported(closes.slice(0, 2), after, morning(10, 21))).toBeNull()
  })
})

describe('S9 the 21:30 push', () => {
  test('the day, then the moments, then the biggest movers', () => {
    const w = closePush({ nowEur: 6158.4, wasEur: 6260.8 }, [
      { symbol: 'NVDA', pct: 4.1, moments: [] },
      { symbol: 'MSFT', pct: -1.1, moments: [] },
      {
        symbol: 'ASML.AS',
        pct: 1.9,
        moments: [{ kind: 'call', was: 'hold', now: 'add', why: [] }],
      },
      { symbol: 'TSLA', pct: -6.2, moments: [{ kind: 'big', pct: -6.2 }] },
    ])
    expect(w).toEqual({
      title: 'Close · ▼ €102.40 · 1.6%',
      body: 'TSLA ▼ 6.2% · ASML HOLD → ADD · NVDA ▲ 4.1%',
    })
  })
  test('a quiet day says its movers', () => {
    expect(
      closePush({ nowEur: 100.5, wasEur: 100 }, [
        { symbol: 'AAPL', pct: 0.5, moments: [] },
        { symbol: 'VUAA.L', pct: null, moments: [] },
      ]),
    ).toEqual({ title: 'Close · ▲ €0.50 · 0.5%', body: 'AAPL ▲ 0.5%' })
  })
})

describe('the 21:30 clock', () => {
  const lisbon = (m: number, d: number, h: number, min = 0) =>
    new Date(2026, m - 1, d, h, min).getTime()
  test('later today, else tomorrow', () => {
    expect(nextEvening(lisbon(10, 22, 12))).toBe(lisbon(10, 22, 21, 30))
    expect(nextEvening(lisbon(10, 22, 21, 30))).toBe(lisbon(10, 23, 21, 30))
  })
  test('across the clock change (25 Oct)', () => {
    expect(nextEvening(lisbon(10, 24, 22))).toBe(lisbon(10, 25, 21, 30))
    expect(nextEvening(lisbon(10, 25, 22))).toBe(lisbon(10, 26, 21, 30))
  })
})
