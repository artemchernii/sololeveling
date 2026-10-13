import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

const DAY = 86_400_000

/**
 * Shopify, bought twice and sold out, in the first account — so the
 * "sold" fold and a sold thing's page are seen without a paid reading
 * (13 Oct). Test backend only (`guard`).
 */
export const soldOut = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .first()
    if (account === null) throw new Error('No account to sell from.')
    const now = Date.now()
    const found = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', ownerId).eq('symbol', 'SHOP'),
      )
      .first()
    const instrumentId =
      found?._id ??
      (await ctx.db.insert('instruments', {
        ownerId,
        symbol: 'SHOP',
        name: 'Shopify Inc.',
        exchange: 'NMS',
        currency: 'USD',
        type: 'EQUITY',
      }))
    if (found === null)
      for (const [ago, price] of [
        [120, 96],
        [60, 124],
        [1, 118.4],
      ])
        await ctx.db.insert('prices', {
          ownerId,
          instrumentId,
          price,
          currency: 'USD',
          asOf: now - ago * DAY,
          fetchedAt: now,
          source: 'Yahoo Finance',
        })
    const trade = (
      side: 'buy' | 'sell',
      shares: number,
      priceEur: number,
      ago: number,
    ) =>
      ctx.db.insert('trades', {
        ownerId,
        accountId: account._id,
        instrumentId,
        side,
        shares,
        priceEur,
        occurredAt: now - ago * DAY,
      })
    await trade('buy', 1, 80.6, 200)
    await trade('buy', 1, 100, 150)
    await trade('sell', 2, 118.45, 90)
    return null
  },
})
