import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

const DAY = 86_400_000

/* Eight things held in the first account, each at one stored euro price
   from yesterday — a list long enough to search and sort (17 Oct, mockup
   find.html). Worth, biggest first: ASML, NVIDIA, Amazon, Palantir,
   Tesla, Visa, Novo Nordisk, Coca-Cola. */
export const HELD: ReadonlyArray<[string, string, number]> = [
  ['ASML', 'ASML Holding', 690],
  ['NVDA', 'NVIDIA', 640],
  ['AMZN', 'Amazon', 520],
  ['PLTR', 'Palantir', 400],
  ['TSLA', 'Tesla', 330],
  ['V', 'Visa', 280],
  ['NVO', 'Novo Nordisk', 130],
  ['KO', 'Coca-Cola', 60],
]

/**
 * Many positions held, one share each (17 Oct): the Portfolio list to
 * search by name or ticker and sort A–Z. Test backend only (`guard`).
 */
export const manyHeld = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .first()
    if (account === null) throw new Error('reset first')
    const now = Date.now()
    for (const [symbol, name, price] of HELD) {
      /* Reset keeps tickers and their prices, and other specs store the
         same tickers under their own names and days (insights MINE: a
         USD year of closes on ASML). Each run sets this one's own. */
      const own = {
        name,
        exchange: 'NMS',
        currency: 'EUR',
        type: 'EQUITY' as const,
      }
      const found = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', symbol),
        )
        .first()
      if (found !== null) await ctx.db.patch(found._id, own)
      const instrumentId =
        found?._id ??
        (await ctx.db.insert('instruments', { ownerId, symbol, ...own }))
      for (const old of await ctx.db
        .query('prices')
        .withIndex('by_owner_instrument_time', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(400))
        await ctx.db.delete(old._id)
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price,
        currency: 'EUR',
        asOf: now - DAY,
        fetchedAt: now,
        source: 'Yahoo Finance',
      })
      await ctx.db.insert('holdings', {
        ownerId,
        accountId: account._id,
        instrumentId,
        shares: 1,
        asOf: now,
      })
    }
    return null
  },
})
