/* OPPORTUNITIES on MARKET (31 Oct, market-world.html; his "yes, the
   rule"; CLAUDE.md, Insights). The MOVERS companies, read from Yahoo's
   quoteSummary on open, and picked by two rules written here and nowhere
   else. Every number that put a name on a list is on its row; a % is two
   fetched numbers by `between()`. Nothing is stored or scored. BONDS and
   GOLD · SILVER pick nothing: now, a year ago and the year's high. */

import { between } from './priceChart'
import { industryOf } from './sectorAverages'
import type { SectorRow } from './sectorAverages'
import { parseSummary } from './yahooFundamentals'
import type { FlagCode, Point } from './insightsMarket'

/** DOWN FROM HIGH: this far or more below the 52-week high, in %. */
export const DOWN_FROM_HIGH = -20
/** CHEAP · TARGET ABOVE: the target this far or more above the price. */
export const TARGET_ABOVE = 15
/** Yahoo's analysts' mean: 1 strong buy … 5 sell; Buy or better. */
export const BUY_OR_BETTER = 2.5
/** The fewest analysts behind a target or a rating that count. */
export const MIN_ANALYSTS = 5
/** Rows each list shows at most. */
export const OPP_ROWS = 8

export type Quote = {
  symbol: string
  name: string
  currency: string | null
  price: number
  high: number
  industry: string | null
  target: { mean: number; count: number } | null
  rating: { mean: number; buy: number; hold: number; sell: number } | null
  pe: number | null
  dividend: number | null
}

const obj = (x: unknown): Record<string, unknown> =>
  typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
const raw = (x: unknown): number | null => {
  const v = typeof x === 'object' && x !== null ? obj(x).raw : x
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** One answer of `quoteSummary` with the modules price, summaryDetail,
    financialData, recommendationTrend and assetProfile. Null without a
    price or a 52-week high. */
export function parseQuote(symbol: string, json: unknown): Quote | null {
  const res = obj(obj(json).quoteSummary).result
  const r = Array.isArray(res) ? obj(res[0]) : null
  if (r === null) return null
  const p = obj(r.price)
  const sd = obj(r.summaryDetail)
  const price =
    raw(p.regularMarketPrice) ?? raw(obj(r.financialData).currentPrice)
  const high = raw(sd.fiftyTwoWeekHigh)
  if (price === null || high === null || price <= 0) return null
  const s = parseSummary(json) ?? {}
  const name = [p.shortName, p.longName].find(
    (n): n is string => typeof n === 'string' && n.length > 0,
  )
  const cur = p.currency ?? sd.currency
  return {
    symbol,
    name: name ?? symbol,
    currency: typeof cur === 'string' ? cur : null,
    price,
    high,
    industry: s.industry ?? null,
    target: s.target ? { mean: s.target.mean, count: s.target.count } : null,
    rating: s.rating
      ? {
          mean: s.rating.mean,
          buy: s.rating.strongBuy + s.rating.buy,
          hold: s.rating.hold,
          sell: s.rating.sell + s.rating.strongSell,
        }
      : null,
    pe: s.pe?.forward ?? null,
    dividend: s.dividend?.yield ?? null,
  }
}

export type Opp = Quote & {
  domain: string
  /** % from the 52-week high to the price, by `between()`. */
  fromHigh: number
  /** % from the price to the target, by `between()`; null without one. */
  toTarget: number | null
  /** Damodaran's industry and its forward P/E; null when not mapped. */
  sector: { industry: string; pe: number } | null
}

const pct = (from: number, to: number) =>
  between({ t: 0, v: from }, { t: 1, v: to }).pct

/** A quote with its distances and its sector, before any rule. */
export function oppOf(
  q: Quote,
  domain: string,
  sectors: ReadonlyArray<SectorRow>,
): Opp {
  const ind = industryOf(q.industry ?? undefined)
  const row = ind ? sectors.find((s) => s.industry === ind) : undefined
  return {
    ...q,
    domain,
    fromHigh: pct(q.high, q.price),
    toTarget: q.target ? pct(q.price, q.target.mean) : null,
    sector: row ? { industry: row.industry, pe: row.forwardPe } : null,
  }
}

const enough = (o: Opp) => o.target !== null && o.target.count >= MIN_ANALYSTS

/** DOWN FROM HIGH: 20% or more below the 52-week high, analysts' mean
    Buy or better from 5 or more, target above the price. Furthest down
    first. */
export function downFromHigh(all: ReadonlyArray<Opp>): Array<Opp> {
  return all
    .filter(
      (o) =>
        o.fromHigh <= DOWN_FROM_HIGH &&
        enough(o) &&
        o.rating !== null &&
        o.rating.mean <= BUY_OR_BETTER &&
        o.toTarget !== null &&
        o.toTarget > 0,
    )
    .sort((a, b) => a.fromHigh - b.fromHigh)
    .slice(0, OPP_ROWS)
}

/** CHEAP · TARGET ABOVE: forward P/E under its sector's, target 15% or
    more above the price, 5 or more analysts. Furthest target first. */
export function cheapTargetAbove(all: ReadonlyArray<Opp>): Array<Opp> {
  return all
    .filter(
      (o) =>
        o.pe !== null &&
        o.pe > 0 &&
        o.sector !== null &&
        o.pe < o.sector.pe &&
        enough(o) &&
        o.toTarget !== null &&
        o.toTarget >= TARGET_ABOVE,
    )
    .sort((a, b) => (b.toTarget ?? 0) - (a.toTarget ?? 0))
    .slice(0, OPP_ROWS)
}

export type Level = {
  now: Point
  /** The first close on or after a year before the last. */
  yearAgo: Point
  high: Point
  /** % from the year's high to now, by `between()`. */
  fromHigh: number
  /** % from a year ago to now, by `between()`. */
  year: number
}

const YEAR = 365 * 86_400_000

/** Now, a year ago and the year's high of fetched closes. Null with
    fewer than two. */
export function levelOf(points: ReadonlyArray<Point>): Level | null {
  if (points.length < 2) return null
  const now = points[points.length - 1]
  const yearAgo = points.find((p) => p.t >= now.t - YEAR) ?? points[0]
  const year = points.filter((p) => p.t >= yearAgo.t)
  const high = year.reduce((h, p) => (p.v > h.v ? p : h), year[0])
  return {
    now,
    yearAgo,
    high,
    fromHigh: pct(high.v, now.v),
    year: pct(yearAgo.v, now.v),
  }
}

/** FRED's observations as points; "." (no value that day) is left out. */
export function parseFred(json: unknown): Array<Point> {
  const obs = obj(json).observations
  if (!Array.isArray(obs)) return []
  return obs.flatMap((o) => {
    const r = obj(o)
    const v = typeof r.value === 'string' ? Number(r.value) : NaN
    const t = typeof r.date === 'string' ? Date.parse(r.date) : NaN
    return Number.isFinite(v) && Number.isFinite(t) ? [{ t, v }] : []
  })
}

/* Where a MOVERS company is listed, by its Yahoo suffix; US-listed
   companies from elsewhere by name. */
const SUFFIX: Record<string, FlagCode> = {
  CO: 'DK',
  PA: 'FR',
  DE: 'DE',
  SW: 'CH',
  L: 'GB',
  AS: 'NL',
  MC: 'ES',
  MI: 'IT',
  TW: 'TW',
  KS: 'KR',
  T: 'JP',
  HK: 'HK',
  NS: 'IN',
  SA: 'BR',
  SN: 'CL',
}
const ABROAD: Record<string, FlagCode> = {
  SPOT: 'SE',
  MELI: 'AR',
  NU: 'BR',
  YPF: 'AR',
  GGAL: 'AR',
  SQM: 'CL',
  EMBJ: 'BR',
  BAP: 'PE',
}

/** A company's flag: its listing's country, US when none is known. */
export function countryOf(symbol: string): FlagCode {
  const dot = symbol.lastIndexOf('.')
  return dot > 0
    ? (SUFFIX[symbol.slice(dot + 1)] ?? 'US')
    : (ABROAD[symbol] ?? 'US')
}
