import type { Observation } from './holdings'

/* A position priced by its broker's own statement (22 Nov, "price from
   TR" on design/treasury-mockup/tr-prices.html). His Net Worth PDF and
   the app valued the same shares about 1% apart — the app from Yahoo's
   US closes and the euro rate, Trade Republic at its own euro price on
   its own exchange.

   The statement's value is used while it is as new as the market's close
   or newer, and only for the very shares it counted — a buy since, or a
   newer close, and Yahoo's price is back. Nothing is worked out: the
   value is the one printed, stored with its day (source 4). */

const DAY = 86_400_000
const SAME_SHARES = 1e-6

export type StatementValue = { valueEur: number; asOf: number }

/** The latest look that printed a value, for the shares held now. */
export function statementOf(
  looks: ReadonlyArray<Observation>,
  shares: number,
): StatementValue | null {
  let best: Observation | null = null
  for (const o of looks)
    if (o.valueEur !== undefined && (best === null || o.asOf > best.asOf))
      best = o
  if (best === null || best.valueEur === undefined) return null
  if (Math.abs(best.shares - shares) > SAME_SHARES) return null
  return { valueEur: best.valueEur, asOf: best.asOf }
}

/** Whether the statement still values it: its day is not before the
    close's (a Friday close, a statement read on Sunday). */
export function statementHolds(
  s: StatementValue | null,
  close: { asOf: number } | null,
): s is StatementValue {
  if (s === null) return false
  return (
    close === null || Math.floor(s.asOf / DAY) >= Math.floor(close.asOf / DAY)
  )
}
