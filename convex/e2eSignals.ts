import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

const DAY = 86_400_000

/**
 * Microsoft held, with 300 daily closes rising half a dollar a day to
 * $449.50 yesterday, two buys in the round held now (100 and 40 days
 * ago) and a round bought and sold out the year before — so a
 * position's chart lines and its SIGNALS tab have known answers (15
 * Oct): price above both averages and the average buy, RSI 100, near
 * the 52-week high. Test backend only (`guard`).
 */
export const heldShare = mutation({
  args: {},
  returns: v.id('instruments'),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .first()
    if (account === null) throw new Error('reset first')
    const now = Date.now()
    const today = Math.floor(now / DAY) * DAY
    /* Reset keeps tickers and their prices: the same one each time,
       its days stored afresh. */
    const found = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', ownerId).eq('symbol', 'MSFT'),
      )
      .first()
    const instrumentId =
      found?._id ??
      (await ctx.db.insert('instruments', {
        ownerId,
        symbol: 'MSFT',
        name: 'Microsoft',
        exchange: 'NMS',
        currency: 'USD',
        type: 'EQUITY',
      }))
    await ctx.db.patch(instrumentId, { yearsReadAt: undefined })
    for (const old of await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .take(400))
      await ctx.db.delete(old._id)
    for (const old of await ctx.db
      .query('priceYears')
      .withIndex('by_owner_instrument_year', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .take(8))
      await ctx.db.delete(old._id)
    const close = (ago: number) => 300 + (300 - ago) * 0.5
    for (let ago = 300; ago >= 1; ago--)
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price: close(ago),
        currency: 'USD',
        asOf: today - ago * DAY + 21 * 3_600_000,
        fetchedAt: now,
        source: 'Yahoo Finance',
      })
    /* A euro for a dollar on the buy days and the last one. */
    for (const ago of [100, 40, 1]) {
      const asOf = today - ago * DAY
      const had = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q.eq('ownerId', ownerId).eq('currency', 'USD').eq('asOf', asOf),
        )
        .first()
      if (had === null)
        await ctx.db.insert('fxRates', {
          ownerId,
          currency: 'USD',
          rate: 0.86,
          asOf,
          fetchedAt: now,
          source: 'ECB',
        })
    }
    const trade = (side: 'buy' | 'sell', shares: number, ago: number) =>
      ctx.db.insert('trades', {
        ownerId,
        accountId: account._id,
        instrumentId,
        side,
        shares,
        priceEur: Math.round(close(ago) * 0.86 * 100) / 100,
        occurredAt: today - ago * DAY + 15 * 3_600_000,
      })
    await trade('buy', 1, 280)
    await trade('sell', 1, 250)
    await trade('buy', 1.5, 100)
    await trade('buy', 0.75, 40)
    await ctx.db.insert('holdings', {
      ownerId,
      accountId: account._id,
      instrumentId,
      shares: 2.25,
      asOf: now,
    })
    return instrumentId
  },
})
