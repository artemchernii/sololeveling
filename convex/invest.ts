import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount } from './accounts'
import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import schema from './schema'

/* Investments (Finances F4, 26 Sep): tickers and trades. A broker
   screenshot turned into trades is the intake now (intake.ts, 27 Sep). The value of what he holds is
   read in aggregate.positions; the prices it uses are stored by market.ts.

   A trade is what the broker confirmed: shares and the price per share in
   euros. Nothing here computes a return. */

const MAX_TRADES = 2000

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

/* One row per owner and symbol; a new one is read at once, so a position
   has its price the moment it exists. */
export async function upsertInstrument(
  ctx: MutationCtx,
  ownerId: string,
  c: { symbol: string; name: string; exchange: string; type: string },
  isin?: string,
): Promise<Id<'instruments'>> {
  const symbol = c.symbol.trim()
  if (symbol.length === 0 || symbol.length > 24) {
    throw new ConvexError('That is not a ticker.')
  }
  const found = await ctx.db
    .query('instruments')
    .withIndex('by_owner_symbol', (q) =>
      q.eq('ownerId', ownerId).eq('symbol', symbol),
    )
    .first()
  if (found !== null) return found._id
  const id = await ctx.db.insert('instruments', {
    ownerId,
    symbol,
    name: c.name.slice(0, 120),
    exchange: c.exchange.slice(0, 40),
    /* Learned from the first price reading (market.storePrices). */
    currency: '',
    type: c.type,
    isin,
  })
  await ctx.scheduler.runAfter(0, internal.market.readOne, { instrumentId: id })
  return id
}

export function checkTrade(shares: number, priceEur: number) {
  if (!Number.isFinite(shares) || shares <= 0 || shares > 1e9) {
    throw new ConvexError('That is not a number of shares.')
  }
  if (!Number.isFinite(priceEur) || priceEur <= 0 || priceEur > 1e7) {
    throw new ConvexError('That is not a price in euros.')
  }
}

export async function heldShares(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  instrumentId: Id<'instruments'>,
): Promise<number> {
  const rows = await ctx.db
    .query('trades')
    .withIndex('by_owner_instrument', (q) =>
      q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
    )
    .take(MAX_TRADES)
  return rows
    .filter((t) => t.accountId === accountId)
    .reduce((n, t) => n + (t.side === 'buy' ? t.shares : -t.shares), 0)
}

/** A buy or a sell, as the broker confirmed it. */
export const addTrade = mutation({
  args: {
    accountId: v.id('accounts'),
    candidate,
    side: v.union(v.literal('buy'), v.literal('sell')),
    shares: v.number(),
    priceEur: v.number(),
    occurredAt: v.number(),
  },
  returns: v.id('trades'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedAccount(ctx, ownerId, args.accountId)
    checkTrade(args.shares, args.priceEur)
    if (args.occurredAt > Date.now() + 5 * 60_000) {
      throw new ConvexError('A trade is something that happened.')
    }
    const instrumentId = await upsertInstrument(ctx, ownerId, args.candidate)
    if (args.side === 'sell') {
      const held = await heldShares(ctx, ownerId, args.accountId, instrumentId)
      if (args.shares > held + 1e-9) {
        throw new ConvexError(
          `There are only ${Math.round(held * 1e6) / 1e6} shares of that here to sell.`,
        )
      }
    }
    return await ctx.db.insert('trades', {
      ownerId,
      accountId: args.accountId,
      instrumentId,
      side: args.side,
      shares: args.shares,
      priceEur: Math.round(args.priceEur * 10000) / 10000,
      occurredAt: args.occurredAt,
    })
  },
})

export const removeTrade = mutation({
  args: { tradeId: v.id('trades') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const trade = await ctx.db.get(args.tradeId)
    if (trade === null || trade.ownerId !== ownerId) {
      throw new Error('No such trade')
    }
    await ctx.db.delete(args.tradeId)
    return null
  },
})

/** One position's trades, newest first — what its number is made of. */
export const trades = query({
  args: { accountId: v.id('accounts'), instrumentId: v.id('instruments') },
  returns: v.array(schema.doc('trades')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('trades')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', args.instrumentId),
      )
      .take(MAX_TRADES)
    return rows
      .filter((t) => t.accountId === args.accountId)
      .sort((a, b) => b.occurredAt - a.occurredAt)
  },
})

/**
 * A ticker's stored closes over a period, oldest first, with where they
 * came from — source 4 read as a series, on the same condition as the
 * weight line (PLAN.md §1): the stored points and nothing between them.
 */
export const priceLine = query({
  args: { instrumentId: v.id('instruments'), since: v.number() },
  returns: v.array(v.object({ asOf: v.number(), price: v.number() })),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('instrumentId', args.instrumentId)
          .gte('asOf', args.since),
      )
      .take(400)
    return rows.map((r) => ({ asOf: r.asOf, price: r.price }))
  },
})
