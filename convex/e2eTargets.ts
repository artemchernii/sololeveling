import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

const DAY = 86_400_000

/* Beside e2eFind.manyHeld's eight shares (31 Oct, targets.spec.ts): a
   gold fund and a coin, so TARGET has gold and crypto to count. No bond
   fund — bonds start at €0. Test backend only (`guard`). */
const FUNDS: ReadonlyArray<[string, string, string, number]> = [
  ['IGLN.L', 'iShares Physical Gold ETC', 'ETF', 2000],
  ['BTC-EUR', 'Bitcoin EUR', 'CRYPTOCURRENCY', 300],
]

export const funds = mutation({
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
    for (const [symbol, name, type, price] of FUNDS) {
      const found = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', symbol),
        )
        .first()
      const own = { name, exchange: 'LSE', currency: 'EUR', type }
      if (found !== null) await ctx.db.patch(found._id, own)
      const instrumentId =
        found?._id ??
        (await ctx.db.insert('instruments', { ownerId, symbol, ...own }))
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
