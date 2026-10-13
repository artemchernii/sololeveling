import { MATCH_TOLERANCE } from './holdings'
import type { LedgerTrade, Observation } from './holdings'

/* What was sold out (13 Oct, mockup portfolio.html: "sold" folded under
   the list). Sums of the trade rows and nothing else: what the sales
   brought, and what the buys cost — the second only when the buys in the
   files cover the shares sold, never a part of them against the whole. */

export type SoldPart = {
  /** Null when the buys of what was sold are not in the files. */
  boughtFor: number | null
  /** Null when no sale is in the files (the broker stopped listing it). */
  soldFor: number | null
  soldAt: number
}

const cents = (t: LedgerTrade) => Math.round(t.shares * t.priceEur * 100)

/** One account's side of a thing it no longer holds; null when nothing
    says it was sold. */
export function soldPart(
  trades: ReadonlyArray<LedgerTrade>,
  looks: ReadonlyArray<Observation>,
): SoldPart | null {
  const buys = trades.filter((t) => t.side === 'buy')
  const sells = trades.filter((t) => t.side === 'sell')
  let last: Observation | undefined
  for (const o of looks) if (!last || o.asOf >= last.asOf) last = o
  const gone = last !== undefined && last.shares <= 0 ? last.asOf : null
  if (sells.length === 0 && gone === null) return null

  const sum = (rows: ReadonlyArray<LedgerTrade>) =>
    rows.reduce((t, r) => t + cents(r), 0) / 100
  const shares = (rows: ReadonlyArray<LedgerTrade>) =>
    rows.reduce((t, r) => t + r.shares, 0)
  const covered =
    buys.length > 0 && shares(buys) >= shares(sells) * (1 - MATCH_TOLERANCE)
  return {
    boughtFor: covered ? sum(buys) : null,
    soldFor: sells.length > 0 ? sum(sells) : null,
    soldAt: Math.max(gone ?? 0, ...sells.map((t) => t.occurredAt)),
  }
}

/** A sold thing over its accounts: the last day, the sums, and the gain
    where both sides are known. */
export function soldSums(
  bought: number | null,
  parts: ReadonlyArray<Pick<SoldPart, 'soldFor' | 'soldAt'>>,
) {
  const got = parts.some((p) => p.soldFor === null)
    ? null
    : Math.round(parts.reduce((t, p) => t + (p.soldFor ?? 0), 0) * 100) / 100
  const eur =
    got === null || bought === null
      ? null
      : Math.round((got - bought) * 100) / 100
  return {
    day: Math.max(...parts.map((p) => p.soldAt)),
    got,
    bought,
    gain:
      eur === null || bought === null
        ? null
        : { eur, pct: bought > 0 ? (eur / bought) * 100 : 0 },
  }
}
