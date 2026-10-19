import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action } from './_generated/server'
import { requireUser } from './auth'
import { UA, crumb } from './fundamentals'
import { PRICE_SOURCE } from '../src/lib/market'
import {
  MARKETS,
  PERIODS,
  PERIOD_FETCH,
  REGIONS,
  SECTORS,
  allSymbols,
  moveOf,
  parseCaps,
  parseSpark,
} from '../src/lib/insightsMarket'
import type { Period, Series } from '../src/lib/insightsMarket'
import {
  BLS_SOURCE,
  ECB_MEETINGS,
  ECB_SOURCE,
  EUROSTAT_SOURCE,
  FED_MEETINGS,
  FRED_SOURCE,
  nextMeeting,
  parseBls,
  parseEcb,
  parseEurostat,
  parseFred,
} from '../src/lib/insightsRates'
import type { Inflation, Policy } from '../src/lib/insightsRates'

/* Insights, band 1 THE MARKET (19 Oct, spec I1). One action, asked when
   the room opens and once for each period not yet seen: the four rates,
   the eight markets, the S&P 500's sectors and biggest companies and the
   regions, each with its source and the time it was fetched. It writes
   nothing — after the 17 Oct bill from saved per-ticker prices, his
   words: "DONT SAVE IT TO DB". A source that does not answer comes back
   `reached: false` (or a null move) and only its own card says so.

   Yahoo is asked in batches (its spark answer takes 20 symbols), three
   calls for about fifty symbols, rather than fifty chart calls. */

const period = v.union(...PERIODS.map((p) => v.literal(p)))
const point = v.object({ t: v.number(), v: v.number() })
const move = v.object({
  price: v.number(),
  at: v.number(),
  base: v.number(),
  baseAt: v.union(v.number(), v.null()),
  change: v.number(),
  points: v.array(point),
})
const num = v.union(v.number(), v.null())
const str = v.union(v.string(), v.null())

export const rate = v.object({
  id: v.union(
    v.literal('us-cpi'),
    v.literal('eu-hicp'),
    v.literal('fed'),
    v.literal('ecb'),
  ),
  source: v.string(),
  reached: v.boolean(),
  value: num,
  /** The Fed's range top; its `value` is the bottom. */
  upper: num,
  month: str,
  prev: num,
  prevMonth: str,
  since: str,
  next: str,
  index: v.union(v.object({ now: v.number(), yearAgo: v.number() }), v.null()),
})

export const answer = v.object({
  period,
  fetchedAt: v.number(),
  priceSource: v.string(),
  rates: v.array(rate),
  markets: v.array(v.object({ id: v.string(), move: v.union(move, v.null()) })),
  sectors: v.array(v.object({ id: v.string(), change: num })),
  companies: v.array(v.object({ symbol: v.string(), cap: num, change: num })),
  /** Whether company sizes came: without them the boxes are equal. */
  capsReached: v.boolean(),
  regions: v.array(v.object({ id: v.string(), change: num })),
})
export type Answer = Infer<typeof answer>
export type Rate = Infer<typeof rate>

export const market = action({
  args: { period },
  returns: answer,
  handler: async (ctx, args): Promise<Answer> => {
    await requireUser(ctx)
    const now = Date.now()
    if (process.env.E2E === '1') return await canned(args.period, now)
    const [series, caps, rates] = await Promise.all([
      spark(args.period),
      companyCaps(),
      readRates(now),
    ])
    return build(args.period, now, series, caps, rates)
  },
})

/** Fetched series into the answer's shape; exported for the canned one. */
export function build(
  p: Period,
  now: number,
  series: Map<string, Series>,
  caps: Map<string, number> | null,
  rates: Array<Rate>,
): Answer {
  const moveFor = (symbol: string, yieldPoints = false) => {
    const s = series.get(symbol)
    return s ? moveOf(s, p, now, yieldPoints) : null
  }
  const change = (symbol: string) => moveFor(symbol)?.change ?? null
  return {
    period: p,
    fetchedAt: now,
    priceSource: PRICE_SOURCE,
    rates,
    markets: MARKETS.map((m) => ({
      id: m.id,
      move: moveFor(m.symbol, m.unit === 'yield'),
    })),
    sectors: SECTORS.map((s) => ({ id: s.id, change: change(s.fund) })),
    companies: SECTORS.flatMap((s) =>
      s.stocks.map((symbol) => ({
        symbol,
        cap: caps?.get(symbol) ?? null,
        change: change(symbol),
      })),
    ),
    capsReached: caps !== null && caps.size > 0,
    regions: REGIONS.map((r) => ({ id: r.id, change: change(r.symbol) })),
  }
}

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

async function spark(p: Period): Promise<Map<string, Series>> {
  const { range, interval } = PERIOD_FETCH[p]
  const symbols = allSymbols()
  const chunks: Array<Array<string>> = []
  for (let i = 0; i < symbols.length; i += 20)
    chunks.push(symbols.slice(i, i + 20))
  const parts = await Promise.all(
    chunks.map((c) =>
      getJson(
        `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${c.map(encodeURIComponent).join(',')}&range=${range}&interval=${interval}`,
        { headers: { 'User-Agent': UA } },
      ),
    ),
  )
  return new Map(parts.flatMap((j) => [...parseSpark(j)]))
}

async function companyCaps(): Promise<Map<string, number> | null> {
  try {
    const auth = await crumb()
    if (auth === null) return null
    const symbols = SECTORS.flatMap((s) => s.stocks).join(',')
    const json = await getJson(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=marketCap&crumb=${encodeURIComponent(auth.crumb)}`,
      { headers: { 'User-Agent': UA, Cookie: auth.cookie } },
    )
    return parseCaps(json)
  } catch {
    return null
  }
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10)

async function readRates(now: number): Promise<Array<Rate>> {
  const year = new Date(now).getUTCFullYear()
  const twoYears = day(now - 730 * 86_400_000)
  const key = process.env.FRED_API_KEY
  const fred = (series: string) =>
    key
      ? getJson(
          `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${encodeURIComponent(key)}&file_type=json&observation_start=${twoYears}`,
        )
      : Promise.resolve(null)
  const [bls, euro, ecb, fedHigh, fedLow] = await Promise.all([
    getJson('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesid: ['CUUR0000SA0'],
        startyear: String(year - 2),
        endyear: String(year),
      }),
    }),
    getJson(
      'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=EA&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=2&format=JSON',
    ),
    getJson(
      `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?startPeriod=${twoYears}&format=jsondata`,
    ),
    fred('DFEDTARU'),
    fred('DFEDTARL'),
  ])
  const today = day(now)
  return rateCards({
    us: parseBls(bls),
    euro: parseEurostat(euro),
    ecb: parseEcb(ecb),
    fedHigh: parseFred(fedHigh),
    fedLow: parseFred(fedLow),
    today,
  })
}

/** The four cards from what was read; a source that gave nothing is not reached. */
export function rateCards(r: {
  us: Inflation | null
  euro: Inflation | null
  ecb: Policy | null
  fedHigh: Policy | null
  fedLow: Policy | null
  today: string
}): Array<Rate> {
  const none = {
    value: null,
    upper: null,
    month: null,
    prev: null,
    prevMonth: null,
    since: null,
    next: null,
    index: null,
  }
  const inflation = (
    id: 'us-cpi' | 'eu-hicp',
    source: string,
    i: Inflation | null,
  ): Rate =>
    i
      ? { ...none, id, source, reached: true, ...i }
      : { ...none, id, source, reached: false }
  const fed = r.fedHigh && r.fedLow
  return [
    inflation('us-cpi', BLS_SOURCE, r.us),
    inflation('eu-hicp', EUROSTAT_SOURCE, r.euro),
    fed
      ? {
          ...none,
          id: 'fed',
          source: FRED_SOURCE,
          reached: true,
          value: r.fedLow!.value,
          upper: r.fedHigh!.value,
          since: r.fedHigh!.since,
          next: nextMeeting(FED_MEETINGS, r.today),
        }
      : { ...none, id: 'fed', source: FRED_SOURCE, reached: false },
    r.ecb
      ? {
          ...none,
          id: 'ecb',
          source: ECB_SOURCE,
          reached: true,
          value: r.ecb.value,
          since: r.ecb.since,
          next: nextMeeting(ECB_MEETINGS, r.today),
        }
      : { ...none, id: 'ecb', source: ECB_SOURCE, reached: false },
  ]
}

/* The test backend's market (E2E=1), a moment late so the loading cards
   are seen. The mockup's month, scaled for the other periods, so each
   period reads differently. The Fed card is reached only where
   FRED_API_KEY is set — on the test backend it is not, which is the
   NOT REACHED case (S3). */
/* symbol:price:month's change, and the canned caps in trillions. */
const CANNED = table(
  '^GSPC:6612:2.4 ^NDX:24180:4.6 IWDA.AS:102.4:1.8 ^STOXX:561:-0.6 ' +
    'GC=F:3712:3.9 BTC-EUR:96400:-4.1 EURUSD=X:1.091:-1.2 ^TNX:4.02:-0.19 ' +
    'XLK:290:5.8 XLC:110:3.1 XLY:230:0.8 XLV:140:-2.4 XLF:52:1.2 ' +
    'XLI:150:1.6 XLE:88:-3.6 XLP:80:-1.1 NVDA:182:8.1 AAPL:252:2.0 ' +
    'MSFT:512:1.2 AVGO:344:7.4 GOOGL:251:4.2 META:712:2.6 NFLX:1210:-0.8 ' +
    'AMZN:214:1.5 TSLA:428:-2.8 LLY:810:-3.9 UNH:355:-5.1 XOM:112:-3.2 ' +
    'CVX:154:-4.1 ^N225:47500:1.9 EEM:53:2.8 MCHI:62:-1.8',
)
const CANNED_CAPS = table(
  'NVDA:4.4 MSFT:3.8 AAPL:3.7 GOOGL:3.0 AMZN:2.3 META:1.8 AVGO:1.6 ' +
    'TSLA:1.4 BRK-B:1.1 ORCL:0.85 JPM:0.83 WMT:0.8 LLY:0.72 V:0.68 ' +
    'NFLX:0.52 MA:0.52 XOM:0.47 COST:0.42 PLTR:0.42 JNJ:0.38 HD:0.38 ' +
    'ABBV:0.37 BAC:0.36 PG:0.36 UNH:0.32 GE:0.3 KO:0.3 CVX:0.27 RTX:0.21 ' +
    'CAT:0.2',
)
function table(rows: string) {
  return new Map(
    rows.split(' ').map((r) => {
      const [k, ...n] = r.split(':')
      return [k, n.map(Number)] as const
    }),
  )
}
const SCALE: Record<Period, number> = {
  '1D': 0.12,
  '1W': 0.4,
  '1M': 1,
  '1Y': 4,
}

async function canned(p: Period, now: number): Promise<Answer> {
  await new Promise((r) => setTimeout(r, 700))
  const series = new Map<string, Series>()
  allSymbols().forEach((symbol, k) => {
    const [price, month] = CANNED.get(symbol) ?? [
      100 + k,
      ((k * 37) % 70) / 10 - 3,
    ]
    const ch = Math.round(month * SCALE[p] * 100) / 100
    const yieldPoints = symbol === '^TNX'
    const base = yieldPoints ? price - ch : price / (1 + ch / 100)
    const wiggle = (i: number) =>
      Math.sin(i * 1.7 + k) * Math.abs(price - base) * 0.3
    if (p === '1D') {
      const points = Array.from({ length: 24 }, (_, i) => ({
        t: now - (23 - i) * 900_000,
        v: i === 23 ? price : base + ((price - base) * i) / 23 + wiggle(i),
      }))
      series.set(symbol, { points, previousClose: base })
      return
    }
    const days = PERIOD_FETCH[p].days
    const points = Array.from({ length: days + 4 }, (_, i) => {
      const t = now - (days + 3 - i) * 86_400_000
      const f = Math.max(0, i - 3) / days
      return {
        t,
        v:
          i <= 3
            ? base
            : i === days + 3
              ? price
              : base + (price - base) * f + wiggle(i),
      }
    })
    series.set(symbol, { points, previousClose: null })
  })
  const caps = new Map(
    [...CANNED_CAPS].map(([k, [t]]) => [k, t * 1e12] as const),
  )
  const today = day(now)
  const rates = rateCards({
    us: {
      value: 2.9,
      month: '2026-09',
      prev: 3.1,
      prevMonth: '2026-08',
      index: { now: 336.94, yearAgo: 327.46 },
    },
    euro: {
      value: 2.1,
      month: '2026-09',
      prev: 2.2,
      prevMonth: '2026-08',
      index: null,
    },
    ecb: { value: 2, since: '2026-09-11' },
    fedHigh: process.env.FRED_API_KEY
      ? { value: 4.5, since: '2026-09-17' }
      : null,
    fedLow: process.env.FRED_API_KEY
      ? { value: 4.25, since: '2026-09-17' }
      : null,
    today,
  })
  return build(p, now, series, caps, rates)
}
