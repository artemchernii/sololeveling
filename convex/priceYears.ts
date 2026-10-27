import { v } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalMutation, query } from './_generated/server'
import { quoteToRate } from './reads/positions'
import { requireUser } from './auth'
import { cannedYears } from './e2ePortfolio'
import { bar, chart } from './market'
import {
  PRICE_SOURCE,
  RATE_SOURCE,
  UNPRICED,
  parseRateSeries,
} from '../src/lib/market'
import type { Doc } from './_generated/dataModel'

/* The years before the one a position's page loads (13 Oct: "i zoom out
   and see gaps like we never show older chart"). Read from Yahoo only
   for the share "all" is pressed on, five years and no more, and kept
   as one record a calendar year — a year that is over never changes, so
   it is read once and its query never runs again ("I hope its not gonna
   make DB full in a week"). The year still running stays in `prices`. */

const DAY = 86_400_000
const RANGE = '5y'
/* How many days back a close may take its rate from: a long weekend
   (invest.priceLine). */
const RATE_REACH = 4
const dayOf = (t: number) => Math.floor(t / DAY)
const yearOf = (t: number) => new Date(t).getUTCFullYear()

const close = v.object({ asOf: v.number(), price: v.number(), ...bar })
const rate = v.object({ asOf: v.number(), rate: v.number() })

/* The ECB's daily rates from a day on; none when it does not answer —
   the years then show their own currency alone, never a made-up euro. */
async function ratesSince(currency: string, from: number) {
  const day = new Date(from - RATE_REACH * DAY).toISOString().slice(0, 10)
  const res = await fetch(
    `https://api.frankfurter.app/${day}..?from=${encodeURIComponent(currency)}&to=EUR`,
    { redirect: 'follow' },
  )
  return res.ok ? parseRateSeries(await res.json()) : []
}

/**
 * Reads one share's older years and stores them. 'fresh' when they were
 * read this calendar year already — nothing is asked of Yahoo; 'failed'
 * when Yahoo does not answer, and the share stays unmarked.
 */
export const read = action({
  args: { instrumentId: v.id('instruments') },
  returns: v.union(
    v.literal('stored'),
    v.literal('fresh'),
    v.literal('failed'),
    v.literal('nothing'),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const inst: Doc<'instruments'> | null = await ctx.runQuery(
      internal.market.instrument,
      args,
    )
    if (inst === null || inst.ownerId !== ownerId)
      throw new Error('No such share')
    if (inst.type === UNPRICED) return 'nothing'
    const now = Date.now()
    if (
      inst.yearsReadAt !== undefined &&
      yearOf(inst.yearsReadAt) === yearOf(now)
    )
      return 'fresh'
    /* The test backend never reads Yahoo (prices.refresh). */
    const c =
      process.env.E2E === '1'
        ? await cannedYears(inst, now)
        : await chart(inst.symbol, RANGE).catch(() => null)
    if (c === null) return 'failed'
    const bars = c.closes.filter((r) => yearOf(r.asOf) < yearOf(now))
    const { base } = quoteToRate(c.currency)
    const rates =
      base === 'EUR' || bars.length === 0 || process.env.E2E === '1'
        ? []
        : await ratesSince(base, bars[0].asOf).catch(() => [])
    await ctx.runMutation(internal.priceYears.store, {
      instrumentId: inst._id,
      currency: c.currency,
      bars,
      rates: rates.filter((r) => yearOf(r.asOf) < yearOf(now)),
      fetchedAt: now,
    })
    return 'stored'
  },
})

/** Stores each past year that is not stored yet — one record a year, a
    day once — and marks the share as read. Returns the years written. */
export const store = internalMutation({
  args: {
    instrumentId: v.id('instruments'),
    currency: v.string(),
    bars: v.array(close),
    rates: v.array(rate),
    fetchedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null) return 0
    const byYear = new Map<number, Map<number, (typeof args.bars)[number]>>()
    for (const b of args.bars) {
      if (yearOf(b.asOf) >= yearOf(args.fetchedAt)) continue
      const days = byYear.get(yearOf(b.asOf)) ?? new Map()
      byYear.set(yearOf(b.asOf), days.set(dayOf(b.asOf), b))
    }
    let written = 0
    for (const [year, days] of byYear) {
      const have = await ctx.db
        .query('priceYears')
        .withIndex('by_owner_instrument_year', (q) =>
          q
            .eq('ownerId', inst.ownerId)
            .eq('instrumentId', inst._id)
            .eq('year', year),
        )
        .first()
      if (have !== null) continue
      await ctx.db.insert('priceYears', {
        ownerId: inst.ownerId,
        instrumentId: inst._id,
        year,
        currency: args.currency,
        bars: [...days.values()].sort((a, b) => a.asOf - b.asOf),
        /* A few days of the year before too: its first closes take the
           last rate before them. */
        rates: args.rates.filter(
          (r) =>
            r.asOf >= Date.UTC(year, 0, 1) - RATE_REACH * DAY &&
            r.asOf < Date.UTC(year + 1, 0, 1),
        ),
        source: PRICE_SOURCE,
        rateSource: RATE_SOURCE,
        fetchedAt: args.fetchedAt,
      })
      written++
    }
    await ctx.db.patch(inst._id, { yearsReadAt: args.fetchedAt })
    return written
  },
})

/**
 * One share's stored older years, oldest day first, as invest.priceLine
 * gives the year it loads: the close in its own currency, in euros where
 * that day's rate is stored with the year, and the day as a bar.
 */
export const line = query({
  args: { instrumentId: v.id('instruments') },
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
    const years = await ctx.db
      .query('priceYears')
      .withIndex('by_owner_instrument_year', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', args.instrumentId),
      )
      .take(8)
    return years.flatMap((y) => {
      const { divide } = quoteToRate(y.currency)
      let k = -1
      return y.bars.map((b): (typeof y.bars)[number] & { eur?: number } => {
        const day = dayOf(b.asOf)
        while (k + 1 < y.rates.length && dayOf(y.rates[k + 1].asOf) <= day) k++
        return k < 0 || day - dayOf(y.rates[k].asOf) > RATE_REACH
          ? b
          : {
              ...b,
              eur: Math.round((b.price / divide) * y.rates[k].rate * 100) / 100,
            }
      })
    })
  },
})
