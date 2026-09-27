/* Finances F4 (26 Sep): what the market readings look like, and how a
   broker screenshot is read. Pure — the fetches live in convex/market.ts
   and convex/ai/portfolio.ts; the shapes they accept are pinned here and
   tested without the network.

   Prices come from Yahoo Finance (no key, US symbols, Xetra ETFs, ISINs);
   exchange rates from the ECB via Frankfurter. Both are PLAN.md §1 source
   4: stored, attributed with these names, shown as of a time. */

export const PRICE_SOURCE = 'Yahoo Finance'
export const RATE_SOURCE = 'ECB via Frankfurter'

export type Candidate = {
  symbol: string
  name: string
  exchange: string
  type: string
}

/** Yahoo's search, narrowed to what can be held: shares and funds. */
export function parseSearch(json: unknown): Array<Candidate> {
  const quotes = (json as { quotes?: unknown } | null)?.quotes
  if (!Array.isArray(quotes)) return []
  const out: Array<Candidate> = []
  for (const q of quotes as Array<Record<string, unknown>>) {
    const symbol = q.symbol
    const type = q.quoteType
    if (typeof symbol !== 'string' || typeof type !== 'string') continue
    if (!['EQUITY', 'ETF', 'MUTUALFUND'].includes(type)) continue
    const name =
      (typeof q.longname === 'string' && q.longname) ||
      (typeof q.shortname === 'string' && q.shortname) ||
      symbol
    const exchange =
      (typeof q.exchDisp === 'string' && q.exchDisp) ||
      (typeof q.exchange === 'string' && q.exchange) ||
      ''
    out.push({ symbol, name, exchange, type })
  }
  return out
}

export type Chart = {
  currency: string
  /** The latest price and the market time it is for. */
  price: number
  asOf: number
  /** Daily closes, oldest first, for the line on a position. */
  closes: Array<{ asOf: number; price: number }>
}

/** Yahoo's chart for one symbol, or null when it is not a whole reading. */
export function parseChart(json: unknown): Chart | null {
  const result = (
    json as { chart?: { result?: Array<Record<string, unknown>> } } | null
  )?.chart?.result?.[0]
  if (!result) return null
  const meta = result.meta as Record<string, unknown> | undefined
  const price = meta?.regularMarketPrice
  const time = meta?.regularMarketTime
  const currency = meta?.currency
  if (
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price <= 0 ||
    typeof time !== 'number' ||
    typeof currency !== 'string'
  ) {
    return null
  }
  const stamps = Array.isArray(result.timestamp)
    ? (result.timestamp as Array<unknown>)
    : []
  const quote = (
    result.indicators as
      { quote?: Array<{ close?: Array<unknown> } | undefined> } | undefined
  )?.quote?.[0]?.close
  const closes: Chart['closes'] = []
  stamps.forEach((t, i) => {
    const c = quote?.[i]
    if (typeof t === 'number' && typeof c === 'number' && c > 0) {
      closes.push({ asOf: t * 1000, price: c })
    }
  })
  return { currency, price, asOf: time * 1000, closes }
}

/** Frankfurter's latest: euros per one of `from`, and the day it is for. */
export function parseRate(
  json: unknown,
): { rate: number; asOf: number } | null {
  const j = json as { rates?: { EUR?: unknown }; date?: unknown } | null
  const rate = j?.rates?.EUR
  const date = j?.date
  if (typeof rate !== 'number' || !(rate > 0) || typeof date !== 'string') {
    return null
  }
  const asOf = Date.parse(`${date}T16:00:00Z`)
  return Number.isFinite(asOf) ? { rate, asOf } : null
}
