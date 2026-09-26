import { v } from 'convex/values'

import { requireUser } from './auth'
import { internal } from './_generated/api'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import {
  PRICE_SOURCE,
  RATE_SOURCE,
  parseChart,
  parseRate,
  parseSearch,
} from '../src/lib/market'
import type { Candidate } from '../src/lib/market'

/* The market readings (Finances F4, 26 Sep) — PLAN.md §1 source 4, like
   github.ts. Prices from Yahoo Finance, exchange rates from the ECB via
   Frankfurter; both read by a daily job and stored as rows, never fetched
   at render. Each row names its source and the market time it is for.

   The one read a person triggers directly is the ticker search, which
   stores nothing: it is how a ticker is found, not a number on screen. */

const YAHOO = 'https://query1.finance.yahoo.com'
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (SoloLeveling personal app)' }
/* How far back a new ticker's closes are read, for the line on it. */
const HISTORY_RANGE = '3mo'
const MAX_INSTRUMENTS = 500

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

export async function searchYahoo(q: string): Promise<Array<Candidate>> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return []
  return parseSearch(await res.json())
}

/** Type "tsla" or an ISIN, pick from what the market calls it. */
export const search = action({
  args: { q: v.string() },
  returns: v.array(candidate),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const q = args.q.trim()
    if (q.length < 2 || q.length > 40) return []
    return await searchYahoo(q)
  },
})

async function chart(symbol: string, range: string) {
  const res = await fetch(
    `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
    { headers: HEADERS },
  )
  if (!res.ok) return null
  return parseChart(await res.json())
}

async function rate(currency: string) {
  const res = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=EUR`,
    { redirect: 'follow' },
  )
  if (!res.ok) return null
  return parseRate(await res.json())
}

/* Pence are quoted against the pound's rate. */
function rateCurrency(currency: string): string | null {
  if (currency === 'EUR') return null
  if (currency === 'GBp' || currency === 'GBX') return 'GBP'
  return currency
}

/**
 * Read one owner's ticker now — when it is first added, so the position
 * has a value the moment it exists — with three months of closes for its
 * line, and its currency's rate.
 */
export const readOne = internalAction({
  args: { instrumentId: v.id('instruments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const inst = await ctx.runQuery(internal.market.instrument, {
      instrumentId: args.instrumentId,
    })
    if (inst === null) return null
    const c = await chart(inst.symbol, HISTORY_RANGE)
    if (c === null) return null
    const fetchedAt = Date.now()
    await ctx.runMutation(internal.market.storePrices, {
      ownerId: inst.ownerId,
      instrumentId: inst._id,
      currency: c.currency,
      rows: [...c.closes, { asOf: c.asOf, price: c.price }],
      fetchedAt,
    })
    const cur = rateCurrency(c.currency)
    if (cur !== null) {
      const r = await rate(cur)
      if (r !== null) {
        await ctx.runMutation(internal.market.storeRate, {
          ownerIds: [inst.ownerId],
          currency: cur,
          ...r,
          fetchedAt,
        })
      }
    }
    return null
  },
})

/**
 * The daily reading: every ticker anyone holds, one request per symbol,
 * then one rate per currency. A symbol that fails is left at its last
 * stored reading, which still carries the time it is for — never
 * overwritten with a guess.
 */
export const readAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const all = await ctx.runQuery(internal.market.allInstruments, {})
    const bySymbol = new Map<string, typeof all>()
    for (const i of all) {
      bySymbol.set(i.symbol, [...(bySymbol.get(i.symbol) ?? []), i])
    }
    const currencies = new Map<string, Set<string>>()
    const fetchedAt = Date.now()
    for (const [symbol, held] of bySymbol) {
      const c = await chart(symbol, '5d')
      if (c === null) continue
      for (const i of held) {
        await ctx.runMutation(internal.market.storePrices, {
          ownerId: i.ownerId,
          instrumentId: i._id,
          currency: c.currency,
          rows: [...c.closes, { asOf: c.asOf, price: c.price }],
          fetchedAt,
        })
        const cur = rateCurrency(c.currency)
        if (cur !== null) {
          currencies.set(cur, (currencies.get(cur) ?? new Set()).add(i.ownerId))
        }
      }
    }
    for (const [cur, owners] of currencies) {
      const r = await rate(cur)
      if (r === null) continue
      await ctx.runMutation(internal.market.storeRate, {
        ownerIds: [...owners],
        currency: cur,
        ...r,
        fetchedAt,
      })
    }
    return null
  },
})

export const instrument = internalQuery({
  args: { instrumentId: v.id('instruments') },
  handler: async (ctx, args) => await ctx.db.get(args.instrumentId),
})

export const allInstruments = internalQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query('instruments')
      .withIndex('by_symbol')
      .take(MAX_INSTRUMENTS),
})

/**
 * Stores closes it does not already have: one row per market time, so the
 * daily job re-reading the last five days adds only what is new — and a
 * live price for today is replaced by the close once the day ends.
 */
export const storePrices = internalMutation({
  args: {
    ownerId: v.string(),
    instrumentId: v.id('instruments'),
    currency: v.string(),
    rows: v.array(v.object({ asOf: v.number(), price: v.number() })),
    fetchedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.rows.length === 0) return null
    /* A new ticker learns its quote currency from its first reading. */
    const inst = await ctx.db.get(args.instrumentId)
    if (inst !== null && inst.currency !== args.currency) {
      await ctx.db.patch(args.instrumentId, { currency: args.currency })
    }
    const from = Math.min(...args.rows.map((r) => r.asOf))
    const have = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q
          .eq('ownerId', args.ownerId)
          .eq('instrumentId', args.instrumentId)
          .gte('asOf', from - 86_400_000),
      )
      .take(200)
    const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10)
    /* What is stored per day as this runs; a row replaced is dropped here
       too, so a second reading of the same day never deletes it twice. */
    let kept = have.map((h) => ({ id: h._id, asOf: h.asOf, price: h.price }))
    for (const row of args.rows) {
      const sameDay = kept.filter((h) => dayOf(h.asOf) === dayOf(row.asOf))
      if (sameDay.some((h) => h.asOf === row.asOf && h.price === row.price)) {
        continue
      }
      for (const h of sameDay) await ctx.db.delete(h.id)
      kept = kept.filter((h) => !sameDay.includes(h))
      const id = await ctx.db.insert('prices', {
        ownerId: args.ownerId,
        instrumentId: args.instrumentId,
        price: row.price,
        currency: args.currency,
        asOf: row.asOf,
        fetchedAt: args.fetchedAt,
        source: PRICE_SOURCE,
      })
      kept.push({ id, asOf: row.asOf, price: row.price })
    }
    return null
  },
})

export const storeRate = internalMutation({
  args: {
    ownerIds: v.array(v.string()),
    currency: v.string(),
    rate: v.number(),
    asOf: v.number(),
    fetchedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const ownerId of new Set(args.ownerIds)) {
      const same = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('currency', args.currency)
            .eq('asOf', args.asOf),
        )
        .first()
      if (same !== null) continue
      await ctx.db.insert('fxRates', {
        ownerId,
        currency: args.currency,
        rate: args.rate,
        asOf: args.asOf,
        fetchedAt: args.fetchedAt,
        source: RATE_SOURCE,
      })
    }
    return null
  },
})
