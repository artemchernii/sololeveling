import { v } from 'convex/values'

import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { requireUser } from './auth'
import { reading } from './fundamentalsFields'
import { parseRevenue, parseSummary } from '../src/lib/yahooFundamentals'
import {
  DAMODARAN_PE,
  MARKET,
  industryOf,
  parsePeTable,
} from '../src/lib/sectorAverages'

/* A company's fundamentals on its page (16 Oct, mockup
   fundamentals.html; his go 17 Oct). Read from Yahoo Finance when the
   page opens and the latest reading is a day old — the prices.refresh
   pattern, one reading on its way at a time — and stored before it is
   shown (source 4). The verdict reads them by the rule in
   src/lib/indicators.ts; the FUNDAMENTALS tab shows them with their day. */

const DAY = 86_400_000
export const SOURCE = 'Yahoo Finance'
const SECTOR_SOURCE = 'Damodaran · NYU Stern'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const RECENT_JOBS = 30

const sectorRow = v.object({
  industry: v.string(),
  year: v.number(),
  firms: v.number(),
  forwardPe: v.number(),
  source: v.string(),
})

/** The latest reading of one thing he owns, and the sector and market
    averages its P/E card compares with. Three rows read at most. */
export const latest = query({
  args: { instrumentId: v.id('instruments') },
  returns: v.union(
    v.null(),
    v.object({
      reading,
      sector: v.union(v.null(), sectorRow),
      market: v.union(v.null(), sectorRow),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const row = await ctx.db
      .query('fundamentals')
      .withIndex('by_owner_instrument_asOf', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', args.instrumentId),
      )
      .order('desc')
      .first()
    if (row === null) return null
    const avg = async (industry: string | undefined) => {
      if (industry === undefined) return null
      const s = await ctx.db
        .query('sectorAverages')
        .withIndex('by_owner_industry_year', (q) =>
          q.eq('ownerId', ownerId).eq('industry', industry),
        )
        .order('desc')
        .first()
      return s === null
        ? null
        : {
            industry: s.industry,
            year: s.year,
            firms: s.firms,
            forwardPe: s.forwardPe,
            source: s.source,
          }
    }
    const { _id, _creationTime, ownerId: _, instrumentId: __, ...r } = row
    return {
      reading: r,
      sector: await avg(industryOf(row.industry)),
      market: await avg(MARKET),
    }
  },
})

/** Asked by the page on open: a new reading when the latest is a day
    old, none for a fund, none while one is on its way. */
export const refresh = mutation({
  args: { instrumentId: v.id('instruments') },
  returns: v.union(
    v.literal('reading'),
    v.literal('fresh'),
    v.literal('nothing'),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null || inst.ownerId !== ownerId)
      throw new Error('No such share')
    if (inst.type !== 'EQUITY') return 'nothing'
    const last = await ctx.db
      .query('fundamentals')
      .withIndex('by_owner_instrument_asOf', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', inst._id),
      )
      .order('desc')
      .first()
    const now = Date.now()
    if (last !== null && now - last.asOf < DAY) return 'fresh'
    const jobs = await ctx.db.system
      .query('_scheduled_functions')
      .order('desc')
      .take(RECENT_JOBS)
    const running = jobs.some(
      (j) =>
        (j.state.kind === 'pending' || j.state.kind === 'inProgress') &&
        /fundamentals(\.js)?:(read|readCanned)$/.test(j.name) &&
        (j.args[0] as { instrumentId?: string } | undefined)?.instrumentId ===
          inst._id,
    )
    if (running) return 'reading'
    /* The test backend never asks Yahoo: a reading a day to a week old
       is read again from itself, a moment later (the slow refresh of
       the browser tests); an older one is left, to be seen as old. */
    if (process.env.E2E === '1') {
      if (last === null || now - last.asOf > 7 * DAY) return 'fresh'
      await ctx.scheduler.runAfter(1500, internal.fundamentals.readCanned, {
        instrumentId: inst._id,
      })
      return 'reading'
    }
    await ctx.scheduler.runAfter(0, internal.fundamentals.read, {
      instrumentId: inst._id,
    })
    return 'reading'
  },
})

/* Yahoo's quoteSummary wants a cookie and a crumb made with it. */
async function crumb(): Promise<{ cookie: string; crumb: string } | null> {
  const first = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
  })
  const set = first.headers.get('set-cookie') ?? ''
  const cookie = /A3=[^;]+/.exec(set)?.[0]
  if (cookie === undefined) return null
  const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  })
  const c = (await res.text()).trim()
  return res.ok && c && !/\s/.test(c) ? { cookie, crumb: c } : null
}

export const read = internalAction({
  args: { instrumentId: v.id('instruments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const inst = await ctx.runQuery(internal.market.instrument, args)
    if (inst === null || inst.type !== 'EQUITY') return null
    const sym = encodeURIComponent(inst.symbol)
    /* A failed read stores nothing: the page asks again next open. */
    const auth = await crumb()
    if (auth === null) return null
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=financialData,recommendationTrend,summaryDetail,assetProfile&crumb=${encodeURIComponent(auth.crumb)}`,
      { headers: { 'User-Agent': UA, Cookie: auth.cookie } },
    )
    if (!res.ok) return null
    const s = parseSummary(await res.json())
    if (s === null) return null
    const to = Math.floor(Date.now() / 1000)
    const ts = await fetch(
      `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${sym}?type=quarterlyTotalRevenue&period1=${to - 800 * 86_400}&period2=${to}`,
      { headers: { 'User-Agent': UA } },
    )
    const revenue = ts.ok ? parseRevenue(await ts.json()) : null
    const sectors = await ctx.runMutation(internal.fundamentals.store, {
      ownerId: inst.ownerId,
      instrumentId: inst._id,
      reading: {
        ...s,
        ...(revenue !== null && { revenue }),
        asOf: Date.now(),
        source: SOURCE,
      },
    })
    if (sectors) {
      const page = await fetch(DAMODARAN_PE, { headers: { 'User-Agent': UA } })
      const table = page.ok ? parsePeTable(await page.text()) : null
      if (table !== null)
        await ctx.runMutation(internal.fundamentals.storeSectors, {
          ownerId: inst.ownerId,
          year: table.year,
          rows: table.rows,
        })
    }
    return null
  },
})

/** Stores one reading; says whether the sector averages want reading
    — none stored for this year, and none asked for in a week. */
export const store = internalMutation({
  args: {
    ownerId: v.string(),
    instrumentId: v.id('instruments'),
    reading,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await ctx.db.insert('fundamentals', {
      ...args.reading,
      ownerId: args.ownerId,
      instrumentId: args.instrumentId,
    })
    const market = await ctx.db
      .query('sectorAverages')
      .withIndex('by_owner_industry_year', (q) =>
        q.eq('ownerId', args.ownerId).eq('industry', MARKET),
      )
      .order('desc')
      .first()
    const now = Date.now()
    return (
      market === null ||
      (market.year < new Date(now).getUTCFullYear() &&
        now - market.fetchedAt > 7 * DAY)
    )
  },
})

/** A year of Damodaran's table, stored once: a year already there is
    left as it is. */
export const storeSectors = internalMutation({
  args: {
    ownerId: v.string(),
    year: v.number(),
    rows: v.array(
      v.object({
        industry: v.string(),
        firms: v.number(),
        forwardPe: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const had = await ctx.db
      .query('sectorAverages')
      .withIndex('by_owner_industry_year', (q) =>
        q
          .eq('ownerId', args.ownerId)
          .eq('industry', MARKET)
          .eq('year', args.year),
      )
      .first()
    if (had !== null) return null
    const fetchedAt = Date.now()
    for (const r of args.rows.slice(0, 200))
      await ctx.db.insert('sectorAverages', {
        ...r,
        ownerId: args.ownerId,
        year: args.year,
        source: SECTOR_SOURCE,
        fetchedAt,
      })
    return null
  },
})

/** Test backend only: the latest reading stored again as of now. */
export const readCanned = internalMutation({
  args: { instrumentId: v.id('instruments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (process.env.E2E !== '1') return null
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null) return null
    const last = await ctx.db
      .query('fundamentals')
      .withIndex('by_owner_instrument_asOf', (q) =>
        q.eq('ownerId', inst.ownerId).eq('instrumentId', inst._id),
      )
      .order('desc')
      .first()
    if (last === null) return null
    const { _id, _creationTime, ...row } = last
    await ctx.db.insert('fundamentals', { ...row, asOf: Date.now() })
    return null
  },
})

/** The symbol of a thing he owns, for its news (news.ts). */
export const symbolOf = internalQuery({
  args: { ownerId: v.string(), instrumentId: v.id('instruments') },
  returns: v.union(
    v.null(),
    v.object({ symbol: v.string(), type: v.string() }),
  ),
  handler: async (ctx, args) => {
    const inst = await ctx.db.get(args.instrumentId)
    return inst === null || inst.ownerId !== args.ownerId
      ? null
      : { symbol: inst.symbol, type: inst.type }
  },
})
