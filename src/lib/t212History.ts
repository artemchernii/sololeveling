/* Trading 212's history (18 Oct, docs/specs/2026-10-18-t212-history.md):
   what its three history answers say, as one list of events. Pure —
   convex/t212History.ts stores them. Every event keeps Trading 212's own
   id, so an answer read twice is written once. */

export type T212Event =
  | {
      ref: string
      at: number
      kind: 'buy' | 'sell'
      ticker: string
      name: string
      isin?: string
      shares: number
      /** Per share, in euros, as it left or reached the account. */
      priceEur: number
    }
  | {
      ref: string
      at: number
      kind: 'dividend'
      ticker: string
      name: string
      isin?: string
      shares: number
      amount: number
      currency: string
    }
  | {
      ref: string
      at: number
      /** Signed: money out of the account is negative. */
      kind: 'interest' | 'fee' | 'deposit' | 'withdraw'
      amount: number
      currency: string
    }

/** One page of a history call: its items and the next page's path. */
export type T212Page = { items: Array<unknown>; next: string | null }

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined
const time = (v: unknown): number | undefined => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : undefined
}
const cents = (n: number) => Math.round(n * 100) / 100

/** A paginated answer, or null when it is not one. */
export function readPage(json: unknown): T212Page | null {
  const items = obj(json).items
  if (!Array.isArray(items)) return null
  return { items, next: str(obj(json).nextPagePath) ?? null }
}

/** `/equity/history/orders`: a buy or a sell that filled, in euros. A
    cancelled order, a split or a fill in another currency is left out. */
export function readOrder(item: unknown): T212Event | null {
  const order = obj(obj(item).order)
  const fill = obj(obj(item).fill)
  const wallet = obj(fill.walletImpact)
  const inst = obj(order.instrument)
  const side = order.side
  const at = time(fill.filledAt)
  const shares = num(fill.quantity)
  const net = num(wallet.netValue)
  const ticker = str(inst.ticker) ?? str(order.ticker)
  const id = num(fill.id)
  if (
    (side !== 'BUY' && side !== 'SELL') ||
    (fill.type !== undefined && fill.type !== 'TRADE') ||
    wallet.currency !== 'EUR' ||
    at === undefined ||
    shares === undefined ||
    shares <= 0 ||
    net === undefined ||
    ticker === undefined ||
    id === undefined
  )
    return null
  const isin = str(inst.isin)
  return {
    ref: `t212:fill:${id}`,
    at,
    kind: side === 'BUY' ? 'buy' : 'sell',
    ticker,
    name: str(inst.name) ?? ticker,
    ...(isin !== undefined ? { isin } : {}),
    shares,
    priceEur: Math.round((Math.abs(net) / shares) * 1e6) / 1e6,
  }
}

/** `/equity/history/dividends`: money paid for holding, in euros. */
export function readDividend(item: unknown): T212Event | null {
  const d = obj(item)
  const inst = obj(d.instrument)
  const at = time(d.paidOn)
  const eur = num(d.amountInEuro)
  const amount = eur ?? num(d.amount)
  const currency = eur !== undefined ? 'EUR' : str(d.currency)
  const ticker = str(inst.ticker) ?? str(d.ticker)
  const ref = str(d.reference)
  if (
    at === undefined ||
    amount === undefined ||
    amount <= 0 ||
    currency === undefined ||
    ticker === undefined ||
    ref === undefined
  )
    return null
  const isin = str(inst.isin)
  return {
    ref: `t212:div:${ref}`,
    at,
    kind: 'dividend',
    ticker,
    name: str(inst.name) ?? ticker,
    ...(isin !== undefined ? { isin } : {}),
    shares: num(d.quantity) ?? 0,
    amount: cents(amount),
    currency,
  }
}

const CASH: Record<string, 'interest' | 'fee' | 'deposit' | 'withdraw'> = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  FEE: 'fee',
  INTEREST_ON_FREE_CASH: 'interest',
  LENDING_INTEREST: 'interest',
}

/** `/equity/history/transactions`: money in and out of the account. A
    TRANSFER between his own 212 accounts is left out. */
export function readCashflow(item: unknown): T212Event | null {
  const t = obj(item)
  const kind = typeof t.type === 'string' ? CASH[t.type] : undefined
  const at = time(t.dateTime)
  const amount = num(t.amount)
  const currency = str(t.currency)
  const ref = str(t.reference)
  if (
    kind === undefined ||
    at === undefined ||
    amount === undefined ||
    amount === 0 ||
    currency === undefined ||
    ref === undefined
  )
    return null
  const out = kind === 'fee' || kind === 'withdraw'
  return {
    ref: `t212:cash:${ref}`,
    at,
    kind,
    amount: cents(out ? -Math.abs(amount) : Math.abs(amount)),
    currency,
  }
}

const DAY = 86_400_000

/** How far back an answer is read: a day before the newest row a file
    saved (18 Oct, his "yes": older rows are in the file already, and the
    day they share is matched row by row); a week before the newest event
    read, once one was. With neither, all of it. */
export function historyFrom(
  fileEdge: number | null,
  lastSeen: number | null,
): number {
  if (lastSeen !== null) return lastSeen - 7 * DAY
  return fileEdge === null ? 0 : fileEdge - DAY
}
