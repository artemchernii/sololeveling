import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'
import type { Doc } from './_generated/dataModel'
import type { Chart } from '../src/lib/market'

const DAY = 86_400_000

/**
 * What the test backend answers when "all" is pressed, in place of
 * Yahoo: five years of working days up to yesterday, after a moment so
 * "reading…" is seen. No answer for a share marked `years: 'fail'`.
 */
export async function cannedYears(
  inst: Doc<'instruments'>,
  now: number,
): Promise<Pick<Chart, 'currency' | 'closes'> | null> {
  await new Promise((done) => setTimeout(done, 700))
  if (inst.isin === NO_YEARS) return null
  const closes: Chart['closes'] = []
  for (let ago = 5 * 365; ago >= 1; ago--) {
    const asOf = (Math.floor(now / DAY) - ago) * DAY + 13.5 * 3_600_000
    if ([0, 6].includes(new Date(asOf).getUTCDay())) continue
    const price =
      Math.round((60 + Math.sin(ago / 40) * 12 - ago / 60) * 100) / 100 + 40
    closes.push({
      asOf,
      price,
      open: price - 1,
      high: price + 2,
      low: price - 2,
      volume: 150_000 + (ago % 7) * 10_000,
    })
  }
  return { currency: inst.currency, closes }
}
const NO_YEARS = 'E2E-NO-YEARS'

/**
 * Shopify, bought twice and sold out, in the first account — so the
 * "sold" fold and a sold thing's page are seen without a paid reading
 * (13 Oct). Test backend only (`guard`).
 */
export const soldOut = mutation({
  /* `bars: false` stores the closes alone, as a day read before 13 Oct
     was: the chart has no candles and no volume to draw. */
  args: {
    bars: v.optional(v.boolean()),
    /* 'fail': pressing "all" gets no answer for its older years. */
    years: v.optional(v.literal('fail')),
    /* So many other things sold out too, each a day older than the
       last: the sold list is longer than it first shows. */
    more: v.optional(v.number()),
  },
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
    /* Its older years are not read yet, each time. */
    await ctx.db.patch(instrumentId, {
      yearsReadAt: undefined,
      isin: args.years === 'fail' ? NO_YEARS : undefined,
    })
    for (const old of await ctx.db
      .query('priceYears')
      .withIndex('by_owner_instrument_year', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .take(8))
      await ctx.db.delete(old._id)
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
    for (let n = 1; n <= (args.more ?? 0); n++) {
      const symbol = `SOLD${n}`
      const had = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', symbol),
        )
        .first()
      const id =
        had?._id ??
        (await ctx.db.insert('instruments', {
          ownerId,
          symbol,
          name: `Sold thing ${n}`,
          exchange: 'NMS',
          currency: 'USD',
          type: 'EQUITY',
        }))
      for (const [side, priceEur, ago] of [
        ['buy', 10, 300 + n],
        ['sell', 12, 70 + n],
      ] as const)
        await ctx.db.insert('trades', {
          ownerId,
          accountId: account._id,
          instrumentId: id,
          side,
          shares: 1,
          priceEur,
          occurredAt: now - ago * DAY,
        })
    }
    await trade('buy', 1, 80.6, 200)
    await trade('buy', 1, 100, 150)
    await trade('sell', 2, 118.45, 60)
    return null
  },
})

/**
 * Gold held at Revolut with no buy saved, and a screenshot of four of
 * its buys read and waiting in an update — ADD BUYS on its page opens on
 * it (14 Oct; his screenshot's rows). Test backend only (`guard`).
 */
export const goldBuys = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const revolut = (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .take(10)
    ).find((a) => a.name === 'Revolut')
    if (!revolut) throw new Error('reset first')
    const now = Date.now()
    const gold = {
      symbol: 'GC=F',
      name: 'Gold',
      exchange: 'CMX',
      type: 'FUTURE',
    }
    const had = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', ownerId).eq('symbol', gold.symbol),
      )
      .first()
    const instrumentId =
      had?._id ??
      (await ctx.db.insert('instruments', {
        ownerId,
        currency: 'EUR',
        ...gold,
      }))
    await ctx.db.insert('holdings', {
      ownerId,
      accountId: revolut._id,
      instrumentId,
      shares: 0.408365,
      asOf: now,
    })
    if (had === null)
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price: 3741.24,
        currency: 'EUR',
        asOf: now - DAY,
        fetchedAt: now,
        source: 'Yahoo Finance',
      })
    const batchId = await ctx.db.insert('batches', {
      ownerId,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    const year = new Date(now).getUTCFullYear() - 1
    const buy = (m: number, d: number, shares: number, price: number) => ({
      occurredAt: Date.UTC(year, m - 1, d, 12),
      name: 'XAU',
      side: 'buy' as const,
      shares,
      price,
      currency: 'EUR',
      preferred: 0,
      candidates: [gold],
    })
    await ctx.db.insert('intakes', {
      ownerId,
      batchId,
      accountId: revolut._id,
      storageIds: [],
      status: 'ready',
      kind: 'trades',
      title: 'Buy XAU · trades',
      files: [{ name: 'gold.png', size: 1, contentType: 'image/png' }],
      trades: [
        buy(7, 23, 0.08275, 3607.63),
        buy(6, 10, 0.069022, 3604.38),
        buy(4, 30, 0.074456, 4009.46),
        buy(4, 16, 0.059985, 4147.38),
      ],
    })
    return null
  },
})
