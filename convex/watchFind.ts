import { v } from 'convex/values'

import { action } from './_generated/server'
import { requireUser } from './auth'
import { cannedOpened, openUp } from './insightsMine'
import { chart } from './market'
import { chartRows } from '../src/lib/market'

/* FIND on the watchlist, IN YOUR ETFS (1 Nov, "go" on the mockup
   watch-find.html): the biggest companies inside the funds he holds, as
   Yahoo's topHoldings says, with each one's last two closes. Asked when
   FIND opens, kept ten minutes on the page; writes nothing ("DONT SAVE
   IT TO DB", the Insights rule). */

const MAX_FUNDS = 12
const MAX_NAMES = 20

const quote = v.object({
  symbol: v.string(),
  currency: v.string(),
  price: v.number(),
  /** The close before, for the day's move — both shown. */
  before: v.union(v.number(), v.null()),
})

export const etfs = action({
  args: { funds: v.array(v.string()), held: v.array(v.string()) },
  returns: v.object({
    fetchedAt: v.number(),
    funds: v.array(
      v.object({
        symbol: v.string(),
        top: v.array(
          v.object({ symbol: v.string(), name: v.string(), pct: v.number() }),
        ),
      }),
    ),
    quotes: v.array(quote),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const fetchedAt = Date.now()
    const e2e = process.env.E2E === '1'
    const symbols = args.funds.slice(0, MAX_FUNDS)
    const opened = e2e
      ? await cannedOpened(symbols.map((symbol) => ({ symbol })))
      : await openUp(symbols)
    const funds = symbols.map((symbol) => ({
      symbol,
      top: opened.get(symbol)?.top ?? [],
    }))
    const held = new Set(args.held)
    const names = [
      ...new Set(
        funds
          .flatMap((f) => f.top.map((t) => t.symbol))
          .filter((s) => !held.has(s)),
      ),
    ].slice(0, MAX_NAMES)
    const quotes = e2e
      ? names.map((symbol, i) => ({
          symbol,
          currency: 'USD',
          price: 180 + i * 10,
          before: 178 + i * 10,
        }))
      : (
          await Promise.all(
            names.map(async (symbol) => {
              const c = await chart(symbol, '5d').catch(() => null)
              if (c === null) return null
              const rows = chartRows(c)
              const last = rows.at(-1)
              if (last === undefined) return null
              return {
                symbol,
                currency: c.currency,
                price: last.price,
                before: rows.at(-2)?.price ?? null,
              }
            }),
          )
        ).flatMap((q) => (q === null ? [] : [q]))
    return { fetchedAt, funds, quotes }
  },
})
