/* BIG FUNDS (30 Oct, market-story.html): five big funds' 13F filings on
   SEC EDGAR, the last quarter beside the one before, for each held
   company: the fund that moved its shares the most. Both share counts
   always shown; quarterly and 45 days late, so it says the quarter, never
   "this week" (spec 2026-10-30-market.md). Fetched on open, never stored. */

export const FUNDS_SOURCE = 'SEC EDGAR'

/** The fixed list of five: name on screen, EDGAR's CIK. */
export const FUNDS: ReadonlyArray<{ name: string; cik: string }> = [
  { name: 'Berkshire', cik: '1067983' },
  { name: 'Bridgewater', cik: '1350694' },
  { name: 'Norges Bank', cik: '1374170' },
  { name: 'Pershing Square', cik: '1336528' },
  { name: 'Duquesne', cik: '1536411' },
]

/** A fund move this size or more earns a company its row on its own. */
export const NEWS_MOVE = 0.05

export type Filing = { accession: string; period: string }

/** The two latest 13F-HR filings (amendments left out), newest first. */
export function lastTwo(json: unknown): Array<Filing> {
  const r = (
    json as {
      filings?: {
        recent?: {
          form?: Array<unknown>
          accessionNumber?: Array<unknown>
          reportDate?: Array<unknown>
        }
      }
    } | null
  )?.filings?.recent
  if (!r?.form || !r.accessionNumber || !r.reportDate) return []
  const out: Array<Filing> = []
  for (let i = 0; i < r.form.length && out.length < 2; i++) {
    const acc = r.accessionNumber[i]
    const period = r.reportDate[i]
    if (r.form[i] !== '13F-HR') continue
    if (typeof acc !== 'string' || typeof period !== 'string') continue
    if (out.some((f) => f.period === period)) continue
    out.push({ accession: acc, period })
  }
  return out.sort((a, b) => b.period.localeCompare(a.period))
}

/** The holdings file in a filing's index: the .xml that is not the cover. */
export function holdingsFile(json: unknown): string | null {
  const items = (
    json as { directory?: { item?: Array<{ name?: unknown }> } } | null
  )?.directory?.item
  if (!Array.isArray(items)) return null
  const xml = items
    .map((i) => i.name)
    .filter(
      (n): n is string =>
        typeof n === 'string' && n.endsWith('.xml') && n !== 'primary_doc.xml',
    )
  return xml[0] ?? null
}

const NOISE = new Set(
  'INC CORP CORPORATION CO COMPANY LTD LIMITED PLC NV SA AG SE HOLDINGS HLDGS GROUP GRP THE OF AND CLASS CL A B C NEW COM DEL ADR ADS SPONSORED SPON ORD SHS'.split(
    ' ',
  ),
)

/** A company's name as a key both sides share: "META PLATFORMS INC" and
    "Meta Platforms, Inc." are both `META PLATFORMS`. First two words. */
export function issuerKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w !== '' && !NOISE.has(w))
    .slice(0, 2)
    .join(' ')
}

const tag = (block: string, name: string) =>
  new RegExp(`<(?:\\w+:)?${name}>([^<]*)<`).exec(block)?.[1]?.trim() ?? null

/** Shares a 13F holds per company key: share rows only (no options, no
    principal amounts), every class and manager added together. */
export function parseHoldings(xml: string): Map<string, number> {
  const out = new Map<string, number>()
  const blocks = xml.split(/<(?:\w+:)?infoTable>/).slice(1)
  for (const b of blocks) {
    const name = tag(b, 'nameOfIssuer')
    const shares = Number(tag(b, 'sshPrnamt'))
    /* A cover with its holdings kept confidential lists one "NA" row of
       0 shares (Norges Bank, Q1 2026): it holds nothing to compare. */
    if (!name || !Number.isFinite(shares) || shares <= 0) continue
    if (tag(b, 'sshPrnamtType') !== 'SH' || tag(b, 'putCall')) continue
    const key = issuerKey(name)
    if (key === '') continue
    out.set(key, (out.get(key) ?? 0) + shares)
  }
  return out
}

/** A quarter that lists nothing cannot be compared: that fund is left out. */
export const readable = (
  h: Map<string, number> | null,
): h is Map<string, number> => h !== null && h.size > 0

export type FundMove = {
  symbol: string
  fund: string
  was: number
  now: number
  wasPeriod: string
  nowPeriod: string
}

export type FundBook = {
  fund: string
  was: Map<string, number>
  now: Map<string, number>
  wasPeriod: string
  nowPeriod: string
}

/** The share change as a part of what was held; a new holding is +∞. */
export const moveOf = (m: Pick<FundMove, 'was' | 'now'>) =>
  m.was === 0 ? Infinity : m.now / m.was - 1

/** For each held company, the fund whose shares moved the most between
    its two quarters. A company no fund holds in either is left out. */
export function biggestMoves(
  held: ReadonlyArray<{ symbol: string; name: string }>,
  books: ReadonlyArray<FundBook>,
): Array<FundMove> {
  return held.flatMap((h) => {
    const key = issuerKey(h.name)
    if (key === '') return []
    const moves = books
      .map((b) => ({
        symbol: h.symbol,
        fund: b.fund,
        was: b.was.get(key) ?? 0,
        now: b.now.get(key) ?? 0,
        wasPeriod: b.wasPeriod,
        nowPeriod: b.nowPeriod,
      }))
      .filter((m) => m.was !== m.now)
      .sort((a, b) => Math.abs(moveOf(b)) - Math.abs(moveOf(a)))
    return moves[0] ? [moves[0]] : []
  })
}

/** "2026-06-30" → "Q2". */
export const quarter = (period: string) =>
  `Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`

/** 12,561,737 → "12.6M"; 840,000 → "840K". */
export function sharesShort(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`
  return `${Math.round(n)}`
}

/** The cell's head: "+8% shares", "NEW", "ALL SOLD". */
export function moveWord(m: Pick<FundMove, 'was' | 'now'>): string {
  if (m.was === 0) return 'NEW'
  if (m.now === 0) return 'ALL SOLD'
  const p = Math.round(moveOf(m) * 100)
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}% shares`
}
