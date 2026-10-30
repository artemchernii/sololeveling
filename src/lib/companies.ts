/* YOUR COMPANIES (30 Oct, market-story.html): one row per held company
   with something this week — its results (actual and expected, or the
   next results day), the analysts' buy / hold count this month and last,
   and the biggest insider buy or sale on the open market. From Finnhub's
   free key, fetched on open, never stored. Rating changes are paid on
   Finnhub (403 on 30 Oct), so the counts stand in for them. */

export const COMPANIES_SOURCE = 'Finnhub'
/** Finnhub's free key allows 60 calls a minute; two per company and one calendar. */
export const MAX_COMPANIES = 12

const num = (x: unknown) =>
  typeof x === 'number' && Number.isFinite(x) ? x : null

export type Results = {
  day: string
  actual: number | null
  expected: number | null
}

/** The earnings calendar, the latest entry for each symbol asked. */
export function parseEarnings(
  json: unknown,
  symbols: ReadonlySet<string>,
): Map<string, Results> {
  const out = new Map<string, Results>()
  const rows = (
    json as { earningsCalendar?: Array<Record<string, unknown>> } | null
  )?.earningsCalendar
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    if (typeof r.symbol !== 'string' || typeof r.date !== 'string') continue
    if (!symbols.has(r.symbol)) continue
    const was = out.get(r.symbol)
    if (was && was.day >= r.date) continue
    out.set(r.symbol, {
      day: r.date,
      actual: num(r.epsActual),
      expected: num(r.epsEstimate),
    })
  }
  return out
}

export type Count = { month: string; buy: number; hold: number; sell: number }
export type Analysts = { now: Count; was: Count | null }

/** Finnhub's monthly recommendation counts: this month and the one before. */
export function parseAnalysts(json: unknown): Analysts | null {
  if (!Array.isArray(json)) return null
  const counts = (json as Array<Record<string, unknown>>)
    .filter((r) => typeof r.period === 'string')
    .map((r) => ({
      month: (r.period as string).slice(0, 7),
      buy: (num(r.strongBuy) ?? 0) + (num(r.buy) ?? 0),
      hold: num(r.hold) ?? 0,
      sell: (num(r.sell) ?? 0) + (num(r.strongSell) ?? 0),
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
  return counts[0] ? { now: counts[0], was: counts[1] ?? null } : null
}

export type Insider = {
  who: string
  side: 'BUY' | 'SELL'
  usd: number
  day: string
}

/** The biggest open-market buy (P) or sale (S) since `since`; grants and tax are left out. */
export function parseInsiders(json: unknown, since: string): Insider | null {
  const rows = (json as { data?: Array<Record<string, unknown>> } | null)?.data
  if (!Array.isArray(rows)) return null
  let best: Insider | null = null
  for (const r of rows) {
    const code = r.transactionCode
    const change = num(r.change)
    const price = num(r.transactionPrice)
    const day = r.transactionDate
    if ((code !== 'P' && code !== 'S') || change === null || !price) continue
    if (typeof day !== 'string' || day < since) continue
    const usd = Math.abs(change) * price
    if (best && best.usd >= usd) continue
    best = {
      who: typeof r.name === 'string' ? r.name : '',
      side: code === 'P' ? 'BUY' : 'SELL',
      usd,
      day,
    }
  }
  return best
}

export type CompanyRow = {
  symbol: string
  name: string
  valueEur: number | null
  results: Results | null
  analysts: Analysts | null
  insider: Insider | null
}

/** Only a company with results in the window or an insider trade earns a row. */
export const hasNews = (r: CompanyRow) =>
  r.results !== null || r.insider !== null

/** $4.2M, $310K, $900. */
export function usdShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}
