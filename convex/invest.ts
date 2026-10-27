import { ConvexError, v } from 'convex/values'

import { quoteToRate } from './reads/positions'
import { requireUser } from './auth'
import { syncLedgers } from './ledgers'
import { internal } from './_generated/api'
import { query } from './_generated/server'
import { mutation } from './write'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'
import { reconcile } from '../src/lib/holdings'
import { bar } from './market'
import { UNPRICED } from '../src/lib/market'
import type { Bar } from '../src/lib/market'

/* Investments (Finances F4, 26 Sep): tickers and trades. Trades come in
   from a trade history or statement (intake.ts), or a typed line
   (money.record, 27 Sep); a holdings screenshot is stored as what it
   showed (the holdings table, R6c) and never becomes a trade. The value of what he holds is read in
   aggregate.positions; the prices it uses are stored by market.ts.

   A trade is what the broker confirmed: shares and the price per share in
   euros. Nothing here computes a return. */

const MAX_TRADES = 2000

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
  /* A frozen share has no market to ask (UNPRICED). */
  if (c.type !== UNPRICED)
    await ctx.scheduler.runAfter(0, internal.market.readOne, {
      instrumentId: id,
    })
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

/** What an account holds of a ticker now: its trades and its screens,
    merged (src/lib/holdings.ts) — so a sell of shares only a screenshot
    knew is still a sell of shares he has. */
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
  const looks = await ctx.db
    .query('holdings')
    .withIndex('by_owner_instrument', (q) =>
      q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
    )
    .take(MAX_TRADES)
  return reconcile(
    rows.filter((t) => t.accountId === accountId),
    looks
      .filter((h) => h.accountId === accountId)
      .map((h) => ({ shares: h.shares, paidEur: h.paidEur, asOf: h.asOf })),
  ).shares
}

/** Takes a trade off its position: the same row kept aside with when it
    went, so UNDO can put it back (15 Oct, mockup trade-remove.html). */
export const removeTrade = mutation({
  args: { tradeId: v.id('trades') },
  returns: v.id('removedTrades'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const trade = await ctx.db.get(args.tradeId)
    if (trade === null || trade.ownerId !== ownerId) {
      throw new Error('No such trade')
    }
    const { _id, _creationTime, ...row } = trade
    const removedId = await ctx.db.insert('removedTrades', {
      ...row,
      removedAt: Date.now(),
    })
    await ctx.db.delete(_id)
    await syncLedgers(ctx, ownerId, [trade])
    return removedId
  },
})

/** UNDO: a removed trade back on its position, the same row. */
export const restoreTrade = mutation({
  args: { removedId: v.id('removedTrades') },
  returns: v.id('trades'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const gone = await ctx.db.get(args.removedId)
    if (gone === null || gone.ownerId !== ownerId) {
      throw new Error('No such removed trade')
    }
    const { _id, _creationTime, removedAt, ...row } = gone
    const tradeId = await ctx.db.insert('trades', row)
    await ctx.db.delete(_id)
    await syncLedgers(ctx, ownerId, [row])
    return tradeId
  },
})

/** One position's removed trades, newest removal first — each with UNDO. */
export const removedTrades = query({
  /* Every listing it is owned under (one company, several brokers). */
  args: { instrumentIds: v.array(v.id('instruments')) },
  returns: v.array(schema.doc('removedTrades')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = []
    for (const instrumentId of new Set(args.instrumentIds.slice(0, 8)))
      rows.push(
        ...(await ctx.db
          .query('removedTrades')
          .withIndex('by_owner_instrument', (q) =>
            q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
          )
          .take(MAX_TRADES)),
      )
    return rows.sort((a, b) => b.removedAt - a.removedAt)
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

/** One position's looks — what each screen showed — newest first. */
export const looks = query({
  args: { accountId: v.id('accounts'), instrumentId: v.id('instruments') },
  returns: v.array(schema.doc('holdings')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('holdings')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', args.instrumentId),
      )
      .take(MAX_TRADES)
    return rows
      .filter((h) => h.accountId === args.accountId)
      .sort((a, b) => b.asOf - a.asOf)
  },
})

/**
 * A ticker's stored closes over a period, oldest first, with where they
 * came from — source 4 read as a series, on the same condition as the
 * weight line (PLAN.md §1): the stored points and nothing between them.
 *
 * Each close carries `eur` (13 Oct: "we want euros and dollar"): the
 * close times the stored ECB rate of the same day, as the position's
 * worth converts (quoteToRate). None for a euro share, and none where no
 * rate is stored for that day or the four before it. A day stored as a
 * bar carries its open, high, low and shares traded too.
 */
export const priceLine = query({
  args: { instrumentId: v.id('instruments'), since: v.number() },
  returns: v.array(
    v.object({
      asOf: v.number(),
      price: v.number(),
      eur: v.optional(v.number()),
      ...bar,
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    type Close = { asOf: number; price: number; eur?: number } & Partial<Bar>
    /* The day as a bar, where it is stored as one (13 Oct) — in the
       share's own currency, as the axis is. */
    const stored = (r: Doc<'prices'>): Close => ({
      asOf: r.asOf,
      price: r.price,
      ...(r.open !== undefined &&
      r.high !== undefined &&
      r.low !== undefined &&
      r.volume !== undefined
        ? { open: r.open, high: r.high, low: r.low, volume: r.volume }
        : {}),
    })
    const instrument = await ctx.db.get(args.instrumentId)
    if (instrument === null || instrument.ownerId !== ownerId) return []
    const rows = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('instrumentId', args.instrumentId)
          .gte('asOf', args.since),
      )
      .take(400)
    const { base, divide } = quoteToRate(instrument.currency)
    if (base === 'EUR' || base === '' || rows.length === 0)
      return rows.map(stored)
    /* The rates of the same window, one read. The ECB publishes on
       business days, in the afternoon: a close on a weekend, a holiday
       or this morning takes the last rate before it, as the position's
       worth does — but none older than RATE_REACH days. */
    const rates = await ctx.db
      .query('fxRates')
      .withIndex('by_owner_currency_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('currency', base)
          .gte('asOf', (dayOf(rows[0].asOf) - RATE_REACH) * DAY),
      )
      .take(400 + RATE_REACH)
    let k = -1
    return rows.map((r): Close => {
      const day = dayOf(r.asOf)
      while (k + 1 < rates.length && dayOf(rates[k + 1].asOf) <= day) k++
      return k < 0 || day - dayOf(rates[k].asOf) > RATE_REACH
        ? stored(r)
        : {
            ...stored(r),
            eur: Math.round((r.price / divide) * rates[k].rate * 100) / 100,
          }
    })
  },
})

/* How many days back a close may take its rate from: a long weekend. */
const RATE_REACH = 4
const DAY = 86_400_000
/* The UTC day, as market.ts keeps one close a day. */
const dayOf = (t: number) => Math.floor(t / DAY)
