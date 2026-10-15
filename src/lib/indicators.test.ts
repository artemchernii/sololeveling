import { describe, expect, it } from 'vitest'

import { avgBuy, rateOn, rsi, sma, yearRange } from './indicators'

const DAY = 86_400_000
const at = (day: string) => Date.parse(`${day}T12:00:00Z`)
/* Closes a day apart from 1 Jan 2026. */
const series = (vs: ReadonlyArray<number>) =>
  vs.map((v, i) => ({ t: at('2026-01-01') + i * DAY, v }))

/* The 14-day RSI worked example from StockCharts' ChartSchool (Wilder's
   smoothing), and the RSI it lists for each day from the 15th close.
   Its table rounds the averages to the cent on the way, so it sits up
   to 0.07 from the exact value. */
const WILDER = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
  46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25,
  45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
]
const WILDER_RSI = [
  70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71,
  50.42, 39.99, 41.46, 41.87, 45.46, 37.3, 33.08, 37.77,
]

describe('sma', () => {
  it('averages the last n closes, from the nth close on', () => {
    const out = sma(series([1, 2, 3, 4, 5, 6]), 3)
    expect(out.map((p) => p.v)).toEqual([2, 3, 4, 5])
    expect(out[0].t).toBe(at('2026-01-03'))
  })

  it('is empty with fewer closes than its period', () => {
    expect(sma(series([1, 2]), 3)).toEqual([])
  })
})

describe('rsi', () => {
  it("matches Wilder's worked example", () => {
    const out = rsi(series(WILDER), 14)
    expect(out).toHaveLength(WILDER_RSI.length)
    out.forEach((p, i) =>
      expect(Math.abs(p.v - WILDER_RSI[i])).toBeLessThan(0.1),
    )
    expect(out[0].t).toBe(series(WILDER)[14].t)
  })

  it('is 100 when nothing fell, and empty without n + 1 closes', () => {
    expect(rsi(series([1, 2, 3, 4]), 3).map((p) => p.v)).toEqual([100])
    expect(rsi(series([1, 2, 3]), 3)).toEqual([])
  })
})

const trade = (
  side: 'buy' | 'sell',
  day: string,
  shares: number,
  priceEur: number,
  extra: { reward?: boolean; split?: boolean } = {},
) => ({ side, occurredAt: at(day), shares, priceEur, ...extra })

describe('avgBuy', () => {
  /* A closed round in 2023, then the round held now: two buys, a part
     sold, a reward — only the buys of now count. */
  const trades = [
    trade('buy', '2023-04-06', 2, 30),
    trade('sell', '2023-07-12', 2, 34),
    trade('buy', '2026-06-22', 1, 300),
    trade('buy', '2026-07-01', 3, 340),
    trade('sell', '2026-08-01', 1, 380),
    trade('buy', '2026-08-02', 0.5, 0, { reward: true }),
  ]

  it('is the buys of the round now over their shares, in euros', () => {
    const a = avgBuy(trades)
    expect(a).not.toBeNull()
    expect(a!.eur).toBeCloseTo((300 + 1020) / 4, 6)
    expect(a!.buys).toBe(2)
    expect(a!.from).toBe(at('2026-06-22'))
  })

  it("says it in the chart's currency at each buy's own day rate", () => {
    /* A euro bought $1.25 on the first buy, $1.10 on the second. */
    const rate = (t: number) => (t < at('2026-06-30') ? 0.8 : 1 / 1.1)
    const a = avgBuy(trades, rate)
    expect(a!.price).toBeCloseTo((300 / 0.8 + 1020 * 1.1) / 4, 6)
  })

  it('has no price where a buy has no rate, and none at all when sold out', () => {
    expect(avgBuy(trades, () => undefined)!.price).toBeNull()
    expect(avgBuy(trades.slice(0, 2))).toBeNull()
    expect(avgBuy([])).toBeNull()
  })
})

describe('rateOn', () => {
  const closes = [
    { t: at('2026-06-19'), v: 100, eur: 86 },
    { t: at('2026-06-22'), v: 110, eur: 99 },
    { t: at('2026-06-23'), v: 120 },
  ]

  it('reads a euro per unit from the close on or before the day', () => {
    const rate = rateOn(closes)
    expect(rate(at('2026-06-22') + 3600_000)).toBeCloseTo(0.9, 6)
    expect(rate(at('2026-06-20'))).toBeCloseTo(0.86, 6)
    /* A close without its euros is passed over for the one before. */
    expect(rate(at('2026-06-24'))).toBeCloseTo(0.9, 6)
    expect(rate(at('2026-06-01'))).toBeUndefined()
  })
})

describe('yearRange', () => {
  it('is the highest and lowest close of the last 52 weeks, with their days', () => {
    const pts = [
      { t: at('2025-09-01'), v: 999 },
      { t: at('2025-10-20'), v: 500 },
      { t: at('2026-03-03'), v: 512 },
      { t: at('2026-06-22'), v: 388 },
      { t: at('2026-10-15'), v: 428.62 },
    ]
    const r = yearRange(pts)!
    expect(r.high).toEqual({ t: at('2026-03-03'), v: 512 })
    expect(r.low).toEqual({ t: at('2026-06-22'), v: 388 })
    expect(r.from).toBe(at('2026-10-15') - 364 * DAY)
    expect(r.fromHigh.diff).toBeCloseTo(-83.38, 2)
    expect(r.fromHigh.from.v).toBe(512)
  })

  it('is null with no closes', () => {
    expect(yearRange([])).toBeNull()
  })
})
