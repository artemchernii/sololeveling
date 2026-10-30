/* ON REDDIT (30 Oct, market-story.html): the tickers named most on Reddit
   in the last 24 hours, and the 24 hours before — two fetched numbers,
   both shown, nothing stored. From ApeWisdom (free, no key), because
   Reddit's own API now asks for a company-style application. Never a
   reason to buy: no move, not a fact for the read's moves. */

export const CROWD_SOURCE = 'ApeWisdom'
export const CROWD_URL =
  'https://apewisdom.io/api/v1.0/filter/all-stocks/page/1'

export type CrowdRow = {
  ticker: string
  name: string
  mentions: number
  was: number | null
}

/** ApeWisdom's page 1, the top `n`; a share class counted once (GOOG and GOOGL). */
export function parseCrowd(json: unknown, n = 5): Array<CrowdRow> {
  const rows = (json as { results?: Array<Record<string, unknown>> } | null)
    ?.results
  if (!Array.isArray(rows)) return []
  const out: Array<CrowdRow> = []
  const names = new Set<string>()
  for (const r of rows) {
    const mentions = Number(r.mentions)
    if (typeof r.ticker !== 'string' || !Number.isFinite(mentions)) continue
    const name = typeof r.name === 'string' ? r.name : r.ticker
    if (names.has(name)) continue
    names.add(name)
    const was = r.mentions_24h_ago == null ? NaN : Number(r.mentions_24h_ago)
    out.push({
      ticker: r.ticker,
      name,
      mentions,
      was: Number.isFinite(was) ? was : null,
    })
    if (out.length === n) break
  }
  return out
}
