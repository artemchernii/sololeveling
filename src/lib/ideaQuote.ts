import { thin } from './insightsMarket'
import type { Chart } from './market'
import type { Point } from './insightsMarket'

/* An idea card's numbers (I3): the price, and the month and the year each
   as two fetched prices — the base close on or before the period's first
   day, and the latest — with both shown beside the change. */

const DAY = 86_400_000

export type Change = { base: number; baseAt: number; change: number } | null
export type IdeaQuote = {
  symbol: string
  currency: string
  price: number
  at: number
  month: Change
  year: Change
  points: Array<Point>
}

type Closes = Pick<Chart, 'currency' | 'price' | 'asOf'> & {
  closes: Array<{ asOf: number; price: number }>
}

function since(c: Closes, days: number, now: number): Change {
  const start = now - days * DAY
  const base = [...c.closes].reverse().find((x) => x.asOf <= start)
  if (!base || base.price <= 0) return null
  return {
    base: base.price,
    baseAt: base.asOf,
    change: Math.round((c.price / base.price - 1) * 10_000) / 100,
  }
}

export function ideaQuote(
  symbol: string,
  c: Closes,
  now: number,
): IdeaQuote | null {
  if (!(c.price > 0) || c.closes.length < 2) return null
  const month = since(c, 30, now)
  const from = now - 31 * DAY
  return {
    symbol,
    currency: c.currency,
    price: c.price,
    at: c.asOf,
    month,
    year: since(c, 365, now),
    points: thin(
      c.closes.filter((x) => x.asOf >= from).map((x) => ({ t: x.asOf, v: x.price })),
      32,
    ),
  }
}
