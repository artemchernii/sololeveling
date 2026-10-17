/* What Yahoo Finance says about a company, read for its page (16 Oct,
   mockup fundamentals.html): the analysts' target and rating, revenue
   on a year before, P/E and dividend yield — from `quoteSummary` — and
   the two quarters of revenue from its `fundamentals-timeseries`.
   Parsed here, stored by convex/fundamentals.ts; nothing is worked out
   that Yahoo did not say, except picking the quarter a year before. */

export type Rating = {
  mean: number
  /** Yahoo's word: strong_buy, buy, hold, underperform, sell. */
  key: string
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
}

export type Quarter = { asOf: number; value: number }

export type Summary = {
  currency?: string
  industry?: string
  target?: { mean: number; low: number; high: number; count: number }
  rating?: Rating
  revenueGrowth?: number
  pe?: { forward?: number; trailing?: number }
  dividend?: { yield: number; rate?: number; exDay?: number }
}

type Raw = { raw?: unknown } | number | undefined | null
const num = (x: Raw): number | undefined => {
  const v = typeof x === 'object' && x !== null ? x.raw : x
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
const obj = (x: unknown): Record<string, unknown> =>
  typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
const pick = (o: Record<string, unknown>, k: string) => num(o[k] as Raw)

/** One answer of `quoteSummary` with the modules financialData,
    recommendationTrend, summaryDetail and assetProfile. Null when it
    carries no company. */
export function parseSummary(json: unknown): Summary | null {
  const res = obj(obj(json).quoteSummary).result
  const r = Array.isArray(res) ? obj(res[0]) : null
  if (r === null) return null
  const fd = obj(r.financialData)
  const sd = obj(r.summaryDetail)
  const out: Summary = {}
  const cur = fd.financialCurrency ?? sd.currency
  if (typeof cur === 'string') out.currency = cur
  const ind = obj(r.assetProfile).industry
  if (typeof ind === 'string' && ind) out.industry = ind

  const mean = pick(fd, 'targetMeanPrice')
  const low = pick(fd, 'targetLowPrice')
  const high = pick(fd, 'targetHighPrice')
  const count = pick(fd, 'numberOfAnalystOpinions')
  if (mean && low && high && count)
    out.target = { mean, low, high, count: Math.round(count) }

  /* The counts of this month (`0m`), the mean and word of today. */
  const trend = obj(r.recommendationTrend).trend
  const now = Array.isArray(trend)
    ? obj(trend.find((t) => obj(t).period === '0m') ?? trend[0])
    : {}
  const rMean = pick(fd, 'recommendationMean')
  const key = fd.recommendationKey
  if (rMean && typeof key === 'string' && key !== 'none')
    out.rating = {
      mean: rMean,
      key,
      strongBuy: pick(now, 'strongBuy') ?? 0,
      buy: pick(now, 'buy') ?? 0,
      hold: pick(now, 'hold') ?? 0,
      sell: pick(now, 'sell') ?? 0,
      strongSell: pick(now, 'strongSell') ?? 0,
    }

  const growth = pick(fd, 'revenueGrowth')
  if (growth !== undefined) out.revenueGrowth = growth

  const forward = pick(sd, 'forwardPE')
  const trailing = pick(sd, 'trailingPE')
  if (forward !== undefined || trailing !== undefined)
    out.pe = {
      ...(forward !== undefined && { forward }),
      ...(trailing !== undefined && { trailing }),
    }

  const yld = pick(sd, 'dividendYield')
  if (yld) {
    const rate = pick(sd, 'dividendRate')
    const ex = pick(sd, 'exDividendDate')
    out.dividend = {
      yield: yld,
      ...(rate !== undefined && { rate }),
      ...(ex !== undefined && { exDay: ex * 1000 }),
    }
  }
  return out
}

/** The last quarter's revenue and the one a year before it (the same
    quarter, 330–400 days earlier), from `fundamentals-timeseries`
    with `type=quarterlyTotalRevenue`. Null without both. */
export function parseRevenue(
  json: unknown,
): { now: Quarter; was: Quarter } | null {
  const res = obj(obj(json).timeseries).result
  const r = Array.isArray(res) ? obj(res[0]) : {}
  const rows = Array.isArray(r.quarterlyTotalRevenue)
    ? r.quarterlyTotalRevenue
    : []
  const qs: Array<Quarter> = rows
    .flatMap((x: unknown) => {
      const o = obj(x)
      const value = num(obj(o.reportedValue) as Raw)
      const asOf = typeof o.asOfDate === 'string' ? Date.parse(o.asOfDate) : NaN
      return value !== undefined && Number.isFinite(asOf)
        ? [{ asOf, value }]
        : []
    })
    .sort((a: Quarter, b: Quarter) => a.asOf - b.asOf)
  const now = qs.at(-1)
  if (!now) return null
  const DAY = 86_400_000
  const was = qs.find(
    (q) => now.asOf - q.asOf >= 330 * DAY && now.asOf - q.asOf <= 400 * DAY,
  )
  return was ? { now, was } : null
}

export type Headline = {
  title: string
  publisher: string
  at: number
  link: string
}

/** At most `n` headlines of Yahoo's search answer (`newsCount`), newest
    first, each with its publisher, time and link. */
export function parseNews(json: unknown, n = 8): Array<Headline> {
  const news = obj(json).news
  if (!Array.isArray(news)) return []
  return news
    .flatMap((x: unknown) => {
      const o = obj(x)
      const t = num(o.providerPublishTime as Raw)
      return typeof o.title === 'string' &&
        typeof o.publisher === 'string' &&
        typeof o.link === 'string' &&
        /^https:\/\//.test(o.link) &&
        t !== undefined
        ? [
            {
              title: o.title,
              publisher: o.publisher,
              at: t * 1000,
              link: o.link,
            },
          ]
        : []
    })
    .sort((a: Headline, b: Headline) => b.at - a.at)
    .slice(0, n)
}
