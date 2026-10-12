import { sameCompany } from './intake'
import { tickerBase } from './market'

/* Trading 212 read from Trading 212 itself (12 Oct,
   docs/specs/2026-10-12-trading-212.md): what its two answers say, which
   holding each position is, and what changed since the last look. Pure —
   convex/t212.ts stores what this works out. */

/** The institution of src/lib/institutions.ts. */
export const T212 = 'trading-212'

export type T212Cash = {
  currency: string
  free: number
  inPies: number
  reserved: number
}

export type T212Position = {
  ticker: string
  name: string
  isin?: string
  shares: number
  /* In the account's own currency, when that is euros. */
  valueEur?: number
  paidEur?: number
}

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/** `/equity/account/summary`, or null when it is not that. */
export function readSummary(json: unknown): T212Cash | null {
  const cash = obj(obj(json).cash)
  const currency = str(obj(json).currency)
  const free = num(cash.availableToTrade)
  if (currency === undefined || free === undefined) return null
  return {
    currency,
    free,
    inPies: num(cash.inPies) ?? 0,
    reserved: num(cash.reservedForOrders) ?? 0,
  }
}

/** `/equity/positions`, or null when one of them cannot be read: half a
    list is no list. */
export function readPositions(json: unknown): Array<T212Position> | null {
  if (!Array.isArray(json)) return null
  const out: Array<T212Position> = []
  for (const p of json) {
    const inst = obj(obj(p).instrument)
    const wallet = obj(obj(p).walletImpact)
    const ticker = str(inst.ticker)
    const shares = num(obj(p).quantity)
    if (ticker === undefined || shares === undefined || shares < 0) return null
    if (shares === 0) continue
    const euros = wallet.currency === 'EUR'
    const value = euros ? num(wallet.currentValue) : undefined
    const cost = euros ? num(wallet.totalCost) : undefined
    out.push({
      ticker,
      name: str(inst.name) ?? ticker,
      shares,
      ...(str(inst.isin) !== undefined ? { isin: str(inst.isin) } : {}),
      ...(value !== undefined && value > 0 ? { valueEur: value } : {}),
      ...(cost !== undefined && cost > 0 ? { paidEur: cost } : {}),
    })
  }
  return out
}

/** Free cash as the 212 app totals it (12 Oct, his "yes"): what can be
    traded, what sits in pies, and what is held for orders. */
export const cashOf = (c: T212Cash) =>
  Math.round((c.free + c.inPies + c.reserved) * 100) / 100

/** "AAPL_US_EQ" → "AAPL". */
export const tickerOf = (ticker: string) => ticker.split('_')[0].toUpperCase()

/** Which holding of the account a position is: the same ISIN, else the
    same ticker before its exchange and the same company. −1 when none. */
export function heldAs(
  p: { ticker: string; name: string; isin?: string },
  held: ReadonlyArray<{ symbol: string; name: string; isin?: string }>,
): number {
  if (p.isin !== undefined) {
    const i = held.findIndex((h) => h.isin === p.isin)
    if (i >= 0) return i
  }
  const same = held.flatMap((h, i) =>
    tickerBase(h.symbol) === tickerOf(p.ticker) ? [i] : [],
  )
  if (same.length <= 1) return same[0] ?? -1
  const k = sameCompany(
    { name: p.name },
    same.map((i) => held[i]),
  )
  return k >= 0 ? same[k] : -1
}

export type Change<T> = { id: T; was: number; now: number }

const differs = (a: number, b: number) => Math.abs(a - b) > 1e-6

/** Every holding whose shares are not what they were — a new one from 0,
    a sold one to 0. */
export function whatChanged<T>(
  was: ReadonlyMap<T, number>,
  now: ReadonlyMap<T, number>,
): Array<Change<T>> {
  const out: Array<Change<T>> = []
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id) ?? 0
    const b = now.get(id) ?? 0
    if (differs(a, b)) out.push({ id, was: a, now: b })
  }
  return out
}

/** A block he has not closed, and a later answer: each line keeps what it
    was at the first look and takes what it is now; one that is back where
    it began leaves. */
export function mergeChanged<T>(
  open: ReadonlyArray<Change<T>>,
  fresh: ReadonlyArray<Change<T>>,
): Array<Change<T>> {
  const lines = new Map(open.map((l) => [l.id, { ...l }]))
  for (const f of fresh) {
    const had = lines.get(f.id)
    lines.set(f.id, had ? { ...had, now: f.now } : { ...f })
  }
  return [...lines.values()].filter((l) => differs(l.was, l.now))
}
