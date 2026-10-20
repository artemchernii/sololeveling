import { v } from 'convex/values'

import { action } from './_generated/server'
import { requireUser } from './auth'
import { chart } from './market'
import { ideaQuote } from '../src/lib/ideaQuote'
import type { IdeaQuote } from '../src/lib/ideaQuote'

/* The numbers on an idea card (I3, 19 Oct): each ticker the read named,
   its price, its month and year as two fetched prices each, and the
   month's line — fetched when the room opens, never saved, like band 1.
   A ticker the market does not answer is left out, so its card is
   dropped rather than shown with the model's numbers. */

const change = v.union(
  v.object({ base: v.number(), baseAt: v.number(), change: v.number() }),
  v.null(),
)
const quote = v.object({
  symbol: v.string(),
  currency: v.string(),
  price: v.number(),
  at: v.number(),
  month: change,
  year: change,
  points: v.array(v.object({ t: v.number(), v: v.number() })),
})

export const quotes = action({
  args: { symbols: v.array(v.string()) },
  returns: v.array(quote),
  handler: async (ctx, args): Promise<Array<IdeaQuote>> => {
    await requireUser(ctx)
    const symbols = args.symbols.slice(0, 4)
    const now = Date.now()
    if (process.env.E2E === '1') return canned(symbols, now)
    const found = await Promise.all(
      symbols.map(async (s) => {
        try {
          const c = await chart(s, '1y')
          return c === null ? null : ideaQuote(s, c, now)
        } catch {
          return null
        }
      }),
    )
    return found.filter((q): q is IdeaQuote => q !== null)
  },
})

/* The test backend's quotes: two known tickers, everything else unknown. */
const CANNED: Record<string, [string, number, number, number]> = {
  'NOVO-B.CO': ['DKK', 412, -3.9, -38.2],
  'WSML.L': ['USD', 7.12, 1.6, 9.4],
}
function canned(symbols: Array<string>, now: number): Array<IdeaQuote> {
  const DAY = 86_400_000
  return symbols.flatMap((s) => {
    const row = CANNED[s] as (typeof CANNED)[string] | undefined
    if (!row) return []
    const [currency, price, m, y] = row
    const closes = Array.from({ length: 366 }, (_, i) => {
      const t = now - (365 - i) * DAY
      const f = i / 365
      const yearBase = price / (1 + y / 100)
      const monthBase = price / (1 + m / 100)
      const val =
        i >= 335
          ? monthBase + (price - monthBase) * ((i - 335) / 30)
          : yearBase + (monthBase - yearBase) * (f / (335 / 365))
      return { asOf: t, price: Math.round(val * 100) / 100 }
    })
    const q = ideaQuote(s, { currency, price, asOf: now, closes }, now)
    return q ? [q] : []
  })
}
