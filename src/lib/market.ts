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

/* ---- Reading a broker screenshot ------------------------------------- */

/* The same reader as the Vault: Claude Haiku 4.5 reads the image itself. */
export const IMPORT_MODEL = 'claude-haiku-4-5'
export const IMPORT_MODEL_NAME = 'Claude Haiku 4.5'

/* At most this many screenshot readings in any 30 days — a portfolio is
   imported rarely; a cap keeps a stuck retry from spending. */
export const IMPORTS_PER_WINDOW = 20
export const IMPORT_WINDOW_MS = 30 * 86_400_000
/* A portfolio is a few screens long. */
export const MAX_IMPORT_IMAGES = 6
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export type ImportRow = {
  name: string
  isin?: string
  shares?: number
  priceEur?: number
  valueEur?: number
}

export const IMPORT_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          isin: { type: ['string', 'null'] },
          shares: { type: ['number', 'null'] },
          average_price_eur: { type: ['number', 'null'] },
          value_eur: { type: ['number', 'null'] },
        },
        required: ['name', 'isin', 'shares', 'average_price_eur', 'value_eur'],
        additionalProperties: false,
      },
    },
    cash_eur: { type: ['number', 'null'] },
    total_eur: { type: ['number', 'null'] },
  },
  required: ['rows', 'cash_eur', 'total_eur'],
  additionalProperties: false,
} as const

export function importPrompt(images: number): string {
  return [
    `These ${images === 1 ? 'is a screenshot' : `are ${images} screenshots`} of a broker app (for example Trade Republic, Trading 212 or Revolut) showing investment positions.`,
    'List every position you can see, once, in the order shown.',
    'For each: the name exactly as shown; the ISIN if one is visible (else null); the number of shares if shown (else null); the average buy price per share in euros if shown (else null); the current value in euros if shown (else null).',
    'Read numbers exactly as printed. A European comma decimal (1.234,56) is the number 1234.56. Never compute or estimate a number that is not printed — use null.',
    'Also read, if shown: the free cash in the account — uninvested money, often labelled cash, available, buying power or free funds — as cash_eur; and the total the app states for the whole account or portfolio as total_eur. Use null for either if it is not printed.',
    'Ignore charts, news and anything that is not a position, the cash or the total.',
  ].join('\n')
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

export type ImportReading = {
  rows: Array<ImportRow>
  cashEur?: number
  totalEur?: number
}

export function parseImport(
  text: string,
): ({ ok: true } & ImportReading) | { ok: false; error: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The reader answered in a shape it should not.' }
  }
  const j = json as {
    rows?: unknown
    cash_eur?: unknown
    total_eur?: unknown
  } | null
  const rows = j?.rows
  if (!Array.isArray(rows)) {
    return { ok: false, error: 'The reader found no positions.' }
  }
  const out: Array<ImportRow> = []
  for (const r of rows as Array<Record<string, unknown>>) {
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    if (name.length === 0) continue
    const isin =
      typeof r.isin === 'string' && /^[A-Z]{2}[A-Z0-9]{10}$/.test(r.isin)
        ? r.isin
        : undefined
    out.push({
      name: name.slice(0, 120),
      isin,
      shares: num(r.shares),
      priceEur: num(r.average_price_eur),
      valueEur: num(r.value_eur),
    })
  }
  /* Cash can be zero and still be a reading: "€0.00 available". */
  const cash =
    typeof j?.cash_eur === 'number' &&
    Number.isFinite(j.cash_eur) &&
    j.cash_eur >= 0
      ? j.cash_eur
      : undefined
  const total = num(j?.total_eur)
  if (out.length === 0 && cash === undefined) {
    return {
      ok: false,
      error: 'No positions or cash were found on that screenshot.',
    }
  }
  return { ok: true, rows: out.slice(0, 60), cashEur: cash, totalEur: total }
}
