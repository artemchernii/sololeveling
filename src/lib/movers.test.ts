import { describe, expect, it } from 'vitest'

import { MOVER_ROWS, UNIVERSE, parseNames, weekMovers } from './movers'
import type { Series } from './insightsMarket'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 31, 12)
/* A week of closes: the base eight days back, the latest today. */
const series = (from: number, to: number): Series => ({
  points: [
    { t: now - 8 * DAY, v: from },
    { t: now - 3 * DAY, v: (from + to) / 2 },
    { t: now, v: to },
  ],
  previousClose: null,
})

describe('weekMovers', () => {
  it('ranks the week up and down, with both closes, names from Yahoo', () => {
    const s = new Map<string, Series>([
      ['RDDT', series(212, 161)],
      ['INTC', series(31.2, 24.52)],
      ['PLTR', series(100, 114.2)],
      ['MSFT', series(100, 103.1)],
      ['AAPL', series(100, 100)],
    ])
    const names = new Map([['RDDT', { name: 'Reddit', currency: 'USD' }]])
    const { up, down } = weekMovers('US', s, names, now)
    expect(up.map((m) => m.symbol)).toEqual(['PLTR', 'MSFT'])
    expect(down.map((m) => m.symbol)).toEqual(['RDDT', 'INTC'])
    expect(down[0]).toMatchObject({
      name: 'Reddit',
      currency: 'USD',
      base: 212,
      price: 161,
      baseAt: now - 8 * DAY,
      domain: 'reddit.com',
    })
    expect(down[0].change).toBeCloseTo(-24.06, 1)
    /* No name answered → the symbol; a flat week is on neither side. */
    expect(up[1].name).toBe('MSFT')
  })

  it('keeps five a side, and leaves out a company with no close a week back', () => {
    const s = new Map<string, Series>(
      UNIVERSE.US.slice(0, 14).map((l, i) => [l.symbol, series(100, 93 + i)]),
    )
    s.set('NVDA', { points: [{ t: now, v: 1 }], previousClose: null })
    const { up, down } = weekMovers('US', s, new Map(), now)
    expect(up).toHaveLength(MOVER_ROWS)
    expect(down).toHaveLength(MOVER_ROWS)
    expect([...up, ...down].some((m) => m.symbol === 'NVDA')).toBe(false)
  })

  it('says nothing for a region Yahoo did not answer', () => {
    expect(weekMovers('ASIA', new Map(), new Map(), now)).toEqual({
      up: [],
      down: [],
    })
  })
})

describe('parseNames', () => {
  it('short names without the company form, and the currency', () => {
    const n = parseNames({
      quoteResponse: {
        result: [
          { symbol: 'INTC', shortName: 'Intel Corporation', currency: 'USD' },
          { symbol: 'ASML.AS', longName: 'ASML Holding N.V.', currency: 'EUR' },
          { symbol: 'X' },
        ],
      },
    })
    expect(n.get('INTC')).toEqual({ name: 'Intel', currency: 'USD' })
    expect(n.get('ASML.AS')).toEqual({ name: 'ASML Holding', currency: 'EUR' })
    expect(n.has('X')).toBe(false)
    expect(parseNames(null).size).toBe(0)
  })
})
