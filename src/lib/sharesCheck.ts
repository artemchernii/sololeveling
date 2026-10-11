/* A trading history against the shares in the account (11 Oct, mockup
   design/treasury-mockup/stocks-check.html). Per company: what the file's
   buys, sales and splits add up to, on the day of the last screenshot,
   beside the shares that screenshot showed. Shares are the one number
   that is the same in both — the file knows what was paid, the screenshot
   what it is worth. Pure: convex/sharesCheck.ts reads the rows. */

const DAY = 86_400_000
/* Rows this close to the file's end are kept one by one, so the sum can
   be taken as of a screenshot older than the file. */
export const LATE_MS = 120 * DAY

export type HistoryRow = {
  occurredAt: number
  name: string
  isin?: string
  side: 'buy' | 'sell' | 'split' | 'reward'
  shares: number
}

export type HistorySum = {
  name: string
  isin?: string
  /** Bought, split and given, less sold: over the whole file. */
  net: number
  buys: number
  sells: number
  /** Every row of it, splits too. */
  rows: number
  /** The rows of the file's last days, signed. */
  late: Array<{ at: number; shares: number }>
}

const signed = (r: HistoryRow) => (r.side === 'sell' ? -r.shares : r.shares)
const round = (n: number) => Math.round(n * 1e6) / 1e6

/** One line a company, in the order the file first names them. */
export function historySums(rows: ReadonlyArray<HistoryRow>): {
  sums: Array<HistorySum>
  from: number | null
  to: number | null
} {
  if (rows.length === 0) return { sums: [], from: null, to: null }
  const to = Math.max(...rows.map((r) => r.occurredAt))
  const from = Math.min(...rows.map((r) => r.occurredAt))
  const by = new Map<string, HistorySum>()
  for (const r of rows) {
    let s = by.get(r.name)
    if (!s) {
      s = { name: r.name, net: 0, buys: 0, sells: 0, rows: 0, late: [] }
      if (r.isin) s.isin = r.isin
      by.set(r.name, s)
    }
    s.net = round(s.net + signed(r))
    s.rows++
    if (r.side === 'buy') s.buys++
    if (r.side === 'sell') s.sells++
    if (r.occurredAt > to - LATE_MS)
      s.late.push({ at: r.occurredAt, shares: signed(r) })
  }
  return { sums: [...by.values()], from, to }
}

export type HeldShares = {
  /** Which line of the file it is (the index in `sums`), or null. */
  sum: number | null
  name: string
  symbol: string
  shares: number
  /** Worked out as value ÷ price, not read off the screen. */
  calculated: boolean
}

export type ShareLine = {
  /** The index in `sums`: what an answer names. */
  n: number
  name: string
  symbol: string | null
  file: number
  account: number
  buys: number
  sells: number
  rows: number
  same: boolean
}

export type SharesCheck = {
  /** none: no screenshot of this account's shares. old: the last one is
      from before the days the file keeps row by row. */
  state: 'checked' | 'none' | 'old'
  lookAt: number | null
  lines: Array<ShareLine>
  /** Companies the file ends at nothing, and the account has none of. */
  sold: number
  /** Bought or sold after the screenshot: saved, not compared. */
  after: Array<{ name: string; shares: number; at: number }>
}

/** A screen rounds (42.1 for 42.1034), and a worked-out count is rougher. */
function close(file: number, account: number, calculated: boolean): boolean {
  const room = Math.max(0.011, Math.abs(account) * (calculated ? 0.02 : 0.005))
  return Math.abs(file - account) <= room
}

export function sharesCheck(
  sums: ReadonlyArray<HistorySum>,
  fileTo: number | null,
  held: ReadonlyArray<HeldShares>,
  lookAt: number | null,
): SharesCheck {
  if (lookAt === null)
    return { state: 'none', lookAt, lines: [], sold: 0, after: [] }
  if (fileTo !== null && lookAt <= fileTo - LATE_MS)
    return { state: 'old', lookAt, lines: [], sold: 0, after: [] }
  const lines: Array<ShareLine> = []
  const after: SharesCheck['after'] = []
  let sold = 0
  sums.forEach((s, n) => {
    const later = s.late.filter((r) => r.at > lookAt)
    for (const r of later)
      after.push({ name: s.name, shares: r.shares, at: r.at })
    const file = round(s.net - later.reduce((sum, r) => sum + r.shares, 0))
    const h = held.find((x) => x.sum === n)
    const account = h?.shares ?? 0
    if (!h && close(file, 0, false)) {
      sold++
      return
    }
    lines.push({
      n,
      name: h?.name ?? s.name,
      symbol: h?.symbol ?? null,
      file,
      account,
      buys: s.buys,
      sells: s.sells,
      rows: s.rows,
      same: close(file, account, h?.calculated ?? false),
    })
  })
  /* The ones that differ first, then the biggest. */
  lines.sort((a, b) => Number(a.same) - Number(b.same) || b.rows - a.rows)
  return { state: 'checked', lookAt, lines, sold, after }
}

/** "5 shares", "1 share", "42.1 shares". */
export function sharesWords(n: number): string {
  const v = Math.round(n * 10000) / 10000
  return `${v.toLocaleString('en', { maximumFractionDigits: 4 })} ${v === 1 ? 'share' : 'shares'}`
}

/** "bought 11 times, sold 3 times" · "bought once, never sold". */
export function timesWords(buys: number, sells: number): string {
  const t = (n: number) => (n === 1 ? 'once' : `${n} times`)
  return `${buys === 0 ? 'never bought' : `bought ${t(buys)}`}, ${sells === 0 ? 'never sold' : `sold ${t(sells)}`}`
}
