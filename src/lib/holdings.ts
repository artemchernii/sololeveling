/* One broker position, worked out from every file that spoke of it
   (R6c, 27 Sep: "I dont want to overlap, I want to update data").

   Trades — a statement's or a CSV's dated buys and sells — are the ledger.
   A holdings screen is an observation: the shares seen on one day, and
   what was paid when the screen printed a % since buy. It is never turned
   into a buy, so a statement dropped later explains it instead of adding
   to it, and the answer is the same whatever order the files came in.

   Nothing here is a new number: shares are the sum of trade rows or a
   stored observation plus the trades after it; paid is the sum of what
   those rows cost, or what the screen printed. When neither says, paid is
   unknown (null) — and a profit is never shown against it. */

import { isCoin } from './logo'
import { METALS } from './metals'

export type LedgerTrade = {
  side: 'buy' | 'sell'
  shares: number
  priceEur: number
  occurredAt: number
}

export type Observation = {
  shares: number
  /** What the screen said was paid for these shares, if it said. */
  paidEur?: number
  asOf: number
}

/**
 * - `trades` — no screen, the trades alone
 * - `match`  — a screen and the trades up to it agree
 * - `screen` — only a screen knows it; no trades up to that day
 * - `gap`    — the screen shows more than the trades (buys not dropped yet)
 * - `over`   — the trades show more than the screen (a sell not dropped)
 */
export type HoldingStatus = 'trades' | 'match' | 'screen' | 'gap' | 'over'

export type Reconciled = {
  shares: number
  /** What the shares still held cost, in euros; null when no file says. */
  paid: number | null
  status: HoldingStatus
  /** The latest screen's day, or null when none has shown it. */
  seenAt: number | null
  /** Screen shares minus trade shares on the screen's day (0 on a match). */
  gap: number
}

/** Screen shares are often worked out as value ÷ price: 1.5% slack. */
export const MATCH_TOLERANCE = 0.015

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/* What the shares still held cost (10 Oct): a sell takes out its shares
   at the average cost of what was held, never at what it brought back.
   Buys less sells' money made "paid" for his SOL €16 when the coins he
   still holds cost €83 — and the gain +80% instead of +28%. `cents` is
   null when the start's cost is not known. */
function ledger(
  start: { shares: number; cents: number | null },
  trades: ReadonlyArray<LedgerTrade>,
) {
  let { shares, cents } = start
  for (const t of [...trades].sort((a, b) => a.occurredAt - b.occurredAt)) {
    if (t.side === 'buy') {
      shares += t.shares
      if (cents !== null) cents += Math.round(t.shares * t.priceEur * 100)
      continue
    }
    const out = Math.min(t.shares, Math.max(0, shares))
    if (cents !== null)
      cents = shares > 1e-9 ? Math.round(cents * (1 - out / shares)) : 0
    shares -= t.shares
  }
  if (shares <= 1e-9 && cents !== null) cents = 0
  return { shares, cents }
}

const sum = (trades: ReadonlyArray<LedgerTrade>) =>
  ledger({ shares: 0, cents: 0 }, trades) as { shares: number; cents: number }

/** What the shares still held after these trades cost, in euros. */
export const heldCost = (trades: ReadonlyArray<LedgerTrade>) =>
  sum(trades).cents / 100

export function reconcile(
  trades: ReadonlyArray<LedgerTrade>,
  observations: ReadonlyArray<Observation>,
): Reconciled {
  /* The latest screen; on a tie, the one given last (stored last). */
  let seen: Observation | undefined
  for (const o of observations) if (!seen || o.asOf >= seen.asOf) seen = o

  if (seen === undefined) {
    const all = sum(trades)
    return {
      shares: round6(all.shares),
      paid: all.cents / 100,
      status: 'trades',
      seenAt: null,
      gap: 0,
    }
  }

  const at = seen.asOf
  const before = sum(trades.filter((t) => t.occurredAt <= at))
  const later = trades.filter((t) => t.occurredAt > at)
  const gap = seen.shares - before.shares
  const slack = Math.max(1e-6, seen.shares * MATCH_TOLERANCE)

  if (Math.abs(gap) <= slack) {
    /* The trades are exact where a screen may be rounded: they win. */
    const all = sum(trades)
    return {
      shares: round6(all.shares),
      paid: all.cents / 100,
      status: 'match',
      seenAt: at,
      gap: 0,
    }
  }
  /* Fewer on the screen than the trades bought (a crypto fee taken in
     coins, a sell not dropped yet): what is left cost its share of the
     trades' cost — never a cost a file once saved by other math (10 Oct:
     his ETH read +39% where Revolut says +33.6%). */
  const startCents =
    gap < 0 && before.shares > 1e-9
      ? Math.round((before.cents * seen.shares) / before.shares)
      : seen.paidEur === undefined
        ? null
        : Math.round(seen.paidEur * 100)
  const from = ledger({ shares: seen.shares, cents: startCents }, later)
  return {
    shares: round6(from.shares),
    paid: from.cents === null ? null : from.cents / 100,
    status:
      gap < 0 ? 'over' : Math.abs(before.shares) <= 1e-6 ? 'screen' : 'gap',
    seenAt: at,
    gap: round6(gap),
  }
}

/** Which kind of file sees a holding (10 Oct): a gold statement lists
    only metals, a crypto statement only coins, a broker screen only
    shares. "Left out of the latest look" compares a holding with the
    latest look of its own kind — a gold file must not mark every coin
    of the same account as gone. */
export function lookFamily(i: {
  symbol: string
  type?: string
}): 'metal' | 'coin' | 'security' {
  if (Object.values(METALS).some((m) => m.candidate.symbol === i.symbol))
    return 'metal'
  return isCoin(i) ? 'coin' : 'security'
}

/** A later screen of the same account left this ticker out: flagged, not
    zeroed — two half-screenshots of one list must not sell anything.
    Screens on the same day count as one look. */
export function notSeenSince(
  seenAt: number | null,
  accountSeenAt: number | null,
): boolean {
  return (
    seenAt !== null &&
    accountSeenAt !== null &&
    accountSeenAt - seenAt > 20 * 3_600_000
  )
}
