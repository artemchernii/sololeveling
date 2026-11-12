import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action } from '../_generated/server'
import { requireUser } from '../auth'
import { crumb } from '../fundamentals'
import { parseSpark } from '../../src/lib/insightsMarket'
import type { Series } from '../../src/lib/insightsMarket'
import {
  MOVER_REGIONS,
  UNIVERSE,
  parseNames,
  pickHeadline,
  weekMovers,
} from '../../src/lib/movers'
import type { Mover, MoverRegion } from '../../src/lib/movers'
import { parseNews } from '../../src/lib/yahooFundamentals'

/* MOVERS: when a region is pressed (US on open), Yahoo's spark for its
   companies over a month of days, their names, and the newest headline
   of each of the ten shown — about 14 calls. Nothing is written. Yahoo
   not answering → `reached: false`, the tile alone says so. Canned on the
   test backend. */

const UA = 'Mozilla/5.0 (SoloLeveling personal app)'
const region = v.union(...MOVER_REGIONS.map((r) => v.literal(r)))
const mover = v.object({
  symbol: v.string(),
  domain: v.string(),
  name: v.string(),
  currency: v.union(v.string(), v.null()),
  change: v.number(),
  base: v.number(),
  baseAt: v.number(),
  price: v.number(),
  headline: v.union(
    v.object({
      title: v.string(),
      publisher: v.string(),
      at: v.number(),
      link: v.string(),
    }),
    v.null(),
  ),
})
const answer = v.object({
  region,
  fetchedAt: v.number(),
  reached: v.boolean(),
  up: v.array(mover),
  down: v.array(mover),
})
export type MoversAnswer = Infer<typeof answer>
type Row = Infer<typeof mover>

export const movers = action({
  args: { region },
  returns: answer,
  handler: async (ctx, args): Promise<MoversAnswer> => {
    await requireUser(ctx)
    const now = Date.now()
    if (process.env.E2E === '1') return await canned(args.region, now)
    const symbols = UNIVERSE[args.region].map((l) => l.symbol)
    const [series, names] = await Promise.all([
      spark(symbols),
      quoteNames(symbols),
    ])
    const { up, down } = weekMovers(args.region, series, names, now)
    const withNews = async (m: Mover): Promise<Row> => ({
      ...m,
      headline: pickHeadline(await headlines(m.symbol), m),
    })
    return {
      region: args.region,
      fetchedAt: now,
      reached: series.size > 0,
      up: await Promise.all(up.map(withNews)),
      down: await Promise.all(down.map(withNews)),
    }
  },
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

export async function spark(
  symbols: Array<string>,
): Promise<Map<string, Series>> {
  const chunks: Array<Array<string>> = []
  for (let i = 0; i < symbols.length; i += 20)
    chunks.push(symbols.slice(i, i + 20))
  const parts = await Promise.all(
    chunks.map((c) =>
      getJson(
        `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${c.map(encodeURIComponent).join(',')}&range=1mo&interval=1d`,
        { headers: { 'User-Agent': UA } },
      ),
    ),
  )
  return new Map(parts.flatMap((j) => [...parseSpark(j)]))
}

async function quoteNames(symbols: Array<string>) {
  try {
    const auth = await crumb()
    if (auth === null) return new Map()
    return parseNames(
      await getJson(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&fields=shortName,currency&crumb=${encodeURIComponent(auth.crumb)}`,
        { headers: { 'User-Agent': UA, Cookie: auth.cookie } },
      ),
    )
  } catch {
    return new Map()
  }
}

async function headlines(symbol: string) {
  const json = await getJson(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=10`,
    { headers: { 'User-Agent': UA } },
  )
  return parseNews(json, 10)
}

/* The test backend's week, a moment late so the loading rows are seen:
   US five each side, ASIA nothing reached. */
async function canned(r: MoverRegion, now: number): Promise<MoversAnswer> {
  await new Promise((res) => setTimeout(res, 800))
  if (r === 'ASIA')
    return { region: r, fetchedAt: now, reached: false, up: [], down: [] }
  const WEEK = 7 * 86_400_000
  const rows: Array<[string, string, number, string]> = [
    [
      'PLTR',
      'Palantir Technologies',
      14.2,
      'Palantir sales jump 48% on AI demand',
    ],
    ['CAT', 'Caterpillar', 9.8, 'Caterpillar posts record order backlog'],
    ['AMD', 'Advanced Micro Devices', 7.4, 'AMD signs chip deal with OpenAI'],
    ['MSFT', 'Microsoft', 3.1, 'Microsoft cloud grows 39%'],
    ['AAPL', 'Apple', 1.8, 'iPhone sales rise 6%'],
    ['RDDT', 'Reddit', -24.1, 'Reddit daily users miss estimates'],
    ['INTC', 'Intel', -21.4, 'Intel cuts next quarter outlook'],
    ['GOOGL', 'Alphabet', -13.9, 'Alphabet falls after results'],
    ['META', 'Meta Platforms', -9.2, 'Meta raises AI spending by $20B'],
    ['NFLX', 'Netflix', -7.5, 'Netflix subscribers flat'],
  ]
  const domain = (s: string) =>
    UNIVERSE.US.find((l) => l.symbol === s)?.domain ?? 'example.com'
  const all: Array<Row> = rows.map(([symbol, name, change, title], i) => ({
    symbol,
    domain: domain(symbol),
    name,
    currency: 'USD',
    change,
    base: 100,
    baseAt: now - WEEK,
    price: Math.round((100 + change) * 100) / 100,
    headline:
      i === 4
        ? null
        : {
            title,
            publisher: 'Reuters',
            at: now - (i + 1) * 3_600_000,
            link: `https://finance.yahoo.com/news/e2e-mover-${i}.html`,
          },
  }))
  return {
    region: r,
    fetchedAt: now,
    reached: true,
    up: all.filter((m) => m.change > 0),
    down: all.filter((m) => m.change < 0),
  }
}
