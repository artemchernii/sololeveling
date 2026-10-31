import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action } from '../_generated/server'
import { requireUser } from '../auth'
import { UA, crumb } from '../fundamentals'
import { parseSpark } from '../../src/lib/insightsMarket'
import type { Point } from '../../src/lib/insightsMarket'
import { MOVER_REGIONS, UNIVERSE } from '../../src/lib/movers'
import type { MoverRegion } from '../../src/lib/movers'
import {
  cheapTargetAbove,
  downFromHigh,
  levelOf,
  oppOf,
  parseFred,
  parseQuote,
} from '../../src/lib/opportunities'
import type { Opp, Quote } from '../../src/lib/opportunities'
import { DAMODARAN_PE, parsePeTable } from '../../src/lib/sectorAverages'
import type { SectorRow } from '../../src/lib/sectorAverages'

/* OPPORTUNITIES (31 Oct, market-world.html; the rule in CLAUDE.md,
   Insights). `stocks`: a region's MOVERS companies from Yahoo's
   quoteSummary (one call each, eight at a time) and Damodaran's table,
   picked by src/lib/opportunities.ts. `levels`: US 10Y, gold and silver
   from Yahoo's spark over a year, US 2Y and Germany 10Y (the OECD's month) from FRED.
   Nothing is written. Not reached → `reached: false`. Canned on the test
   backend. */

const region = v.union(...MOVER_REGIONS.map((r) => v.literal(r)))
const num = v.union(v.number(), v.null())
const opp = v.object({
  symbol: v.string(),
  domain: v.string(),
  name: v.string(),
  currency: v.union(v.string(), v.null()),
  price: v.number(),
  high: v.number(),
  fromHigh: v.number(),
  toTarget: num,
  industry: v.union(v.string(), v.null()),
  target: v.union(v.object({ mean: v.number(), count: v.number() }), v.null()),
  rating: v.union(
    v.object({
      mean: v.number(),
      buy: v.number(),
      hold: v.number(),
      sell: v.number(),
    }),
    v.null(),
  ),
  pe: num,
  sector: v.union(v.object({ industry: v.string(), pe: v.number() }), v.null()),
  dividend: num,
})
const stocksAnswer = v.object({
  region,
  fetchedAt: v.number(),
  reached: v.boolean(),
  /** Damodaran's year, null when its table was not reached. */
  sectorYear: num,
  down: v.array(opp),
  cheap: v.array(opp),
})
export type OppRow = Infer<typeof opp>
export type StocksAnswer = Infer<typeof stocksAnswer>

const point = v.object({ t: v.number(), v: v.number() })
const level = v.object({
  now: point,
  yearAgo: point,
  high: point,
  fromHigh: v.number(),
  year: v.number(),
})
const levelId = v.union(
  v.literal('us10y'),
  v.literal('us2y'),
  v.literal('de10y'),
  v.literal('gold'),
  v.literal('silver'),
)
const levelsAnswer = v.object({
  fetchedAt: v.number(),
  rows: v.array(
    v.object({
      id: levelId,
      source: v.string(),
      level: v.union(level, v.null()),
    }),
  ),
})
export type LevelsAnswer = Infer<typeof levelsAnswer>
export type LevelId = Infer<typeof levelId>

export const stocks = action({
  args: { region },
  returns: stocksAnswer,
  handler: async (ctx, args): Promise<StocksAnswer> => {
    await requireUser(ctx)
    const now = Date.now()
    if (process.env.E2E === '1') return await cannedStocks(args.region, now)
    const listed = UNIVERSE[args.region]
    const [quotes, table] = await Promise.all([
      readQuotes(listed.map((l) => l.symbol)),
      sectorTable(),
    ])
    const sectors = table?.rows ?? []
    const all = listed.flatMap((l) => {
      const q = quotes.get(l.symbol)
      return q ? [oppOf(q, l.domain, sectors)] : []
    })
    return {
      region: args.region,
      fetchedAt: now,
      reached: all.length > 0,
      sectorYear: table?.year ?? null,
      down: downFromHigh(all).map(row),
      cheap: cheapTargetAbove(all).map(row),
    }
  },
})

export const levels = action({
  args: {},
  returns: levelsAnswer,
  handler: async (ctx): Promise<LevelsAnswer> => {
    await requireUser(ctx)
    const now = Date.now()
    if (process.env.E2E === '1') return cannedLevels(now)
    const start = new Date(now - 400 * 86_400_000).toISOString().slice(0, 10)
    const key = process.env.FRED_API_KEY
    const fred = (id: string) =>
      key
        ? getJson(
            `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${encodeURIComponent(key)}&file_type=json&observation_start=${start}`,
          ).then(parseFred)
        : Promise.resolve([])
    const [spark, us2y, de10y] = await Promise.all([
      getJson(
        `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent('^TNX,GC=F,SI=F')}&range=1y&interval=1d`,
        { headers: { 'User-Agent': UA } },
      ).then(parseSpark),
      fred('DGS2'),
      fred('IRLTLT01DEM156N'),
    ])
    const yahoo = (s: string) => levelOf(spark.get(s)?.points ?? [])
    return {
      fetchedAt: now,
      rows: [
        { id: 'us10y', source: 'Yahoo Finance', level: yahoo('^TNX') },
        { id: 'us2y', source: 'FRED', level: levelOf(us2y) },
        { id: 'de10y', source: 'FRED', level: levelOf(de10y) },
        { id: 'gold', source: 'Yahoo Finance', level: yahoo('GC=F') },
        { id: 'silver', source: 'Yahoo Finance', level: yahoo('SI=F') },
      ],
    }
  },
})

const row = (o: Opp): OppRow => ({
  symbol: o.symbol,
  domain: o.domain,
  name: o.name,
  currency: o.currency,
  price: o.price,
  high: o.high,
  fromHigh: o.fromHigh,
  toTarget: o.toTarget,
  industry: o.industry,
  target: o.target,
  rating: o.rating,
  pe: o.pe,
  sector: o.sector,
  dividend: o.dividend,
})

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/** Each symbol's quoteSummary, eight at a time, with one crumb. */
async function readQuotes(symbols: Array<string>): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>()
  const auth = await crumb().catch(() => null)
  if (auth === null) return out
  const modules =
    'price,summaryDetail,financialData,recommendationTrend,assetProfile'
  for (let i = 0; i < symbols.length; i += 8) {
    const part = await Promise.all(
      symbols.slice(i, i + 8).map(async (s) => {
        const json = await getJson(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`,
          { headers: { 'User-Agent': UA, Cookie: auth.cookie } },
        )
        return parseQuote(s, json)
      }),
    )
    for (const q of part) if (q) out.set(q.symbol, q)
  }
  return out
}

async function sectorTable(): Promise<{
  year: number
  rows: Array<SectorRow>
} | null> {
  try {
    const page = await fetch(DAMODARAN_PE, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    })
    return page.ok ? parsePeTable(await page.text()) : null
  } catch {
    return null
  }
}

/* The test backend's lists, a moment late so READING is seen: US has
   two down from high (Broadcom held) and one cheap; ASIA not reached. */
async function cannedStocks(
  r: MoverRegion,
  now: number,
): Promise<StocksAnswer> {
  await new Promise((res) => setTimeout(res, 600))
  if (r === 'ASIA')
    return {
      region: r,
      fetchedAt: now,
      reached: false,
      sectorYear: null,
      down: [],
      cheap: [],
    }
  const US: Array<OppRow> = [
    canned(
      'ADBE',
      'adobe.com',
      'Adobe',
      318,
      512,
      410,
      31,
      22,
      9,
      17,
      31,
      'Software (System & Application)',
      null,
    ),
    canned(
      'AVGO',
      'broadcom.com',
      'Broadcom',
      280,
      370,
      352,
      40,
      34,
      6,
      24,
      27,
      'Semiconductor',
      0.009,
    ),
  ]
  const CHEAP: Array<OppRow> = [
    canned(
      'PYPL',
      'paypal.com',
      'PayPal',
      68.2,
      93.66,
      86,
      44,
      20,
      22,
      11,
      19,
      'Financial Svcs. (Non-bank & Insurance)',
      null,
    ),
  ]
  const EU: Array<OppRow> = [
    canned(
      'NOVO-B.CO',
      'novonordisk.com',
      'Novo Nordisk',
      342,
      712,
      458,
      32,
      20,
      12,
      13,
      26,
      'Drugs (Pharmaceutical)',
      0.031,
      'DKK',
    ),
  ]
  return {
    region: r,
    fetchedAt: now,
    reached: true,
    sectorYear: 2026,
    down: r === 'US' ? US : r === 'EUROPE' ? EU : [],
    cheap: r === 'US' ? CHEAP : [],
  }
}

function canned(
  symbol: string,
  domain: string,
  name: string,
  price: number,
  high: number,
  target: number,
  count: number,
  buy: number,
  hold: number,
  pe: number,
  sectorPe: number,
  industry: string,
  dividend: number | null,
  currency = 'USD',
): OppRow {
  return {
    symbol,
    domain,
    name,
    currency,
    price,
    high,
    fromHigh: ((price - high) / high) * 100,
    toTarget: ((target - price) / price) * 100,
    industry,
    target: { mean: target, count },
    rating: { mean: 1.8, buy, hold, sell: 0 },
    pe,
    sector: { industry, pe: sectorPe },
    dividend,
  }
}

function cannedLevels(now: number): LevelsAnswer {
  const D = 86_400_000
  const lv = (now_: number, ago: number, high: number, highDays: number) => {
    const n: Point = { t: now - D, v: now_ }
    const a: Point = { t: now - 366 * D, v: ago }
    const h: Point = { t: now - highDays * D, v: high }
    return {
      now: n,
      yearAgo: a,
      high: h,
      fromHigh: ((now_ - high) / high) * 100,
      year: ((now_ - ago) / ago) * 100,
    }
  }
  return {
    fetchedAt: now,
    rows: [
      { id: 'us10y', source: 'Yahoo Finance', level: lv(4.93, 4.21, 5.1, 17) },
      { id: 'us2y', source: 'FRED', level: null },
      { id: 'de10y', source: 'FRED', level: lv(2.71, 2.38, 2.84, 29) },
      { id: 'gold', source: 'Yahoo Finance', level: lv(3899, 2765, 4148, 22) },
      {
        id: 'silver',
        source: 'Yahoo Finance',
        level: lv(46.2, 31.2, 52.4, 25),
      },
    ],
  }
}
