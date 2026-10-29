import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action } from './_generated/server'
import { requireUser } from './auth'
import { UA, crumb } from './fundamentals'
import { chart } from './market'
import { PRICE_SOURCE } from '../src/lib/market'
import { parseSpark, thin } from '../src/lib/insightsMarket'
import type { Series } from '../src/lib/insightsMarket'
import { parseSummary } from '../src/lib/yahooFundamentals'
import {
  MOVERS,
  STRIP,
  cellOf,
  parseScreener,
  parseTrending,
  tickerFacts,
  trendingOf,
} from '../src/lib/ideasBoard'
import type { Movers, TickerFacts } from '../src/lib/ideasBoard'
import { cannedBoard, cannedChart } from '../src/lib/ideasBoardCanned'

/* IDEAS, the board (29 Oct; spec docs/specs/2026-10-29-ideas-board.md).
   One action, asked when the tab opens: the market strip, the movers
   (Yahoo's trending list and its gainers and losers screeners) and, for
   each ticker the board shows, a year of closes, the quote and what
   Yahoo's summary says. It writes nothing — "DONT SAVE IT TO DB" — and the
   page keeps the answer ten minutes. A source that does not answer comes
   back null, and only its own place says ❔ NO DATA. A ticker Yahoo does
   not know is left out, so a line of the model's naming it is dropped. */

const point = v.object({ t: v.number(), v: v.number() })
const level = v.union(
  v.null(),
  v.object({ level: v.number(), pct: v.number() }),
)
const ticker = v.object({
  symbol: v.string(),
  currency: v.string(),
  price: v.number(),
  at: v.number(),
  day: v.union(v.null(), v.object({ base: v.number(), change: v.number() })),
  points: v.array(point),
  rsi: v.union(v.number(), v.null()),
  sma200: level,
  high: level,
  target: v.union(
    v.null(),
    v.object({ mean: v.number(), count: v.number(), pct: v.number() }),
  ),
  pe: v.union(v.number(), v.null()),
  dividend: v.union(v.number(), v.null()),
})
const mover = v.object({
  symbol: v.string(),
  name: v.string(),
  change: v.number(),
})
const list = v.union(v.null(), v.array(mover))

export const boardAnswer = v.object({
  fetchedAt: v.number(),
  priceSource: v.string(),
  strip: v.array(
    v.object({
      id: v.string(),
      cell: v.union(
        v.null(),
        v.object({
          id: v.string(),
          price: v.number(),
          base: v.number(),
          change: v.number(),
          points: v.array(point),
        }),
      ),
    }),
  ),
  movers: v.object({ trending: list, gainers: list, losers: list }),
  tickers: v.array(ticker),
})
export type BoardAnswer = Infer<typeof boardAnswer>

/** Tickers one ask may carry: his holdings and the read's lines. */
const MAX = 40

export const board = action({
  args: { symbols: v.array(v.string()) },
  returns: boardAnswer,
  handler: async (ctx, args): Promise<BoardAnswer> => {
    await requireUser(ctx)
    const now = Date.now()
    const symbols = [...new Set(args.symbols)].slice(0, MAX)
    if (process.env.E2E === '1') return cannedBoard(symbols, now)
    const auth = await crumb().catch(() => null)
    const [day, gainers, losers, trending, tickers] = await Promise.all([
      spark(STRIP.map((s) => s.symbol)),
      screener('day_gainers', auth),
      screener('day_losers', auth),
      getJson(
        `https://query1.finance.yahoo.com/v1/finance/trending/US?count=${MOVERS}`,
      ).then(parseTrending),
      Promise.all(symbols.map((s) => facts(s, auth, now))),
    ])
    const trendDay = trending ? await spark(trending) : null
    const movers: Movers = {
      trending: trending && trendDay ? trendingOf(trending, trendDay) : null,
      gainers,
      losers,
    }
    return {
      fetchedAt: now,
      priceSource: PRICE_SOURCE,
      strip: STRIP.map((s) => ({
        id: s.id,
        cell: cellOf(s.id, day.get(s.symbol)),
      })),
      movers,
      tickers: tickers.filter((t): t is TickerFacts => t !== null),
    }
  },
})

const range = v.union(v.literal('1mo'), v.literal('6mo'), v.literal('1y'))

/**
 * The lines of an ASK answer's chart: each ticker's daily closes over the
 * period the model named, fetched and never stored.
 */
export const chartOf = action({
  args: { symbols: v.array(v.string()), range },
  returns: v.array(v.object({ symbol: v.string(), points: v.array(point) })),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const symbols = args.symbols.slice(0, 3)
    if (process.env.E2E === '1') return cannedChart(symbols, Date.now())
    const found = await Promise.all(
      symbols.map(async (symbol) => {
        const c = await chart(symbol, args.range).catch(() => null)
        if (c === null || c.closes.length < 2) return null
        return {
          symbol,
          points: thin(
            c.closes.map((x) => ({ t: x.asOf, v: x.price })),
            90,
          ),
        }
      }),
    )
    return found.filter((x) => x !== null)
  },
})

type Auth = { cookie: string; crumb: string } | null

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, ...init?.headers },
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function spark(symbols: Array<string>): Promise<Map<string, Series>> {
  if (symbols.length === 0) return new Map()
  const json = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=1d&interval=5m`,
  )
  return parseSpark(json)
}

async function screener(id: string, auth: Auth) {
  const json = await getJson(
    `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=${MOVERS}${auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''}`,
    auth ? { headers: { Cookie: auth.cookie } } : undefined,
  )
  return parseScreener(json)
}

async function facts(
  symbol: string,
  auth: Auth,
  now: number,
): Promise<TickerFacts | null> {
  const [c, summary] = await Promise.all([
    chart(symbol, '1y').catch(() => null),
    auth
      ? getJson(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,summaryDetail&crumb=${encodeURIComponent(auth.crumb)}`,
          { headers: { Cookie: auth.cookie } },
        ).then(parseSummary)
      : null,
  ])
  return c === null ? null : tickerFacts(symbol, c, summary, now)
}
