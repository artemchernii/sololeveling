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
  /* `bars: false` stores the closes alone, as a day read before 13 Oct
     was: the chart has no candles and no volume to draw. */
  args: { bars: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
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
    /* Its days are stored afresh each time: reset keeps tickers and
       prices, and a test asks for them with or without bars. */
    for (const old of await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .take(50))
      await ctx.db.delete(old._id)
    for (const [ago, price, open, high, low, volume] of [
      [120, 96, 93.2, 97.5, 92.4, 199_000],
      [60, 124, 121, 125.3, 120.1, 264_000],
      [1, 118.4, 119.6, 120.2, 117.5, 1_240_000],
    ])
      await ctx.db.insert('prices', {
        ...(args.bars === false ? {} : { open, high, low, volume }),
        ownerId,
        instrumentId,
        price,
        currency: 'USD',
        asOf: now - ago * DAY,
        fetchedAt: now,
        source: 'Yahoo Finance',
      })
    /* A euro for a dollar on the last two days only: the first shows
       its dollar price alone (13 Oct, euros beside dollars). */
    for (const ago of [60, 1]) {
      const asOf = Math.floor((now - ago * DAY) / DAY) * DAY
      const stored = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q.eq('ownerId', ownerId).eq('currency', 'USD').eq('asOf', asOf),
        )
        .first()
      if (stored === null)
        await ctx.db.insert('fxRates', {
          ownerId,
          currency: 'USD',
          rate: 0.9,
          asOf,
          fetchedAt: now,
          source: 'ECB',
        })
    }
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
    await trade('sell', 2, 118.45, 60)
    return null
  },
})
