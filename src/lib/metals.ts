import type { CsvReading } from './csvLayout'
import type { Candidate } from './market'

/* Precious metals as a bank prints them (9 Oct): Revolut's commodity
   account exports the same columns as its euro account, with XAU or XAG
   in the currency column and troy ounces in the amount — read as euros,
   "Exchanged to XAG +12.90" came out as €12.90 of his own money arriving.
   Each metal is priced by its COMEX future, in dollars an ounce. */
export const METALS: Record<string, { name: string; candidate: Candidate }> = {
  XAU: {
    name: 'Gold',
    candidate: {
      symbol: 'GC=F',
      name: 'Gold',
      exchange: 'CMX',
      type: 'FUTURE',
    },
  },
  XAG: {
    name: 'Silver',
    candidate: {
      symbol: 'SI=F',
      name: 'Silver',
      exchange: 'CMX',
      type: 'FUTURE',
    },
  },
  XPT: {
    name: 'Platinum',
    candidate: {
      symbol: 'PL=F',
      name: 'Platinum',
      exchange: 'NYM',
      type: 'FUTURE',
    },
  },
  XPD: {
    name: 'Palladium',
    candidate: {
      symbol: 'PA=F',
      name: 'Palladium',
      exchange: 'NYM',
      type: 'FUTURE',
    },
  },
}

/**
 * A statement whose every row is in a metal is what he holds, not money
 * moving: one position a metal, its ounces the statement's last balance
 * for it. A metal sold out (nothing left) is not a position. Null for any
 * statement with a row in money.
 */
export function metalHoldings(
  reading: Pick<CsvReading, 'transactions' | 'closings'>,
): Array<{
  name: string
  shares: number
  asOf: number
  candidate: Candidate
}> | null {
  if (reading.transactions.length === 0) return null
  if (!reading.transactions.every((t) => t.currency.toUpperCase() in METALS))
    return null
  return Object.entries(reading.closings)
    .filter(([cur, c]) => cur.toUpperCase() in METALS && c.value > 1e-6)
    .map(([cur, c]) => ({
      name: METALS[cur.toUpperCase()].name,
      shares: c.value,
      asOf: c.asOf,
      candidate: METALS[cur.toUpperCase()].candidate,
    }))
}

/** "gold and silver" — what the file holds, in words. */
export function metalsTitle(names: ReadonlyArray<string>): string {
  const low = names.map((n) => n.toLowerCase())
  return low.length <= 1
    ? (low[0] ?? 'metals')
    : `${low.slice(0, -1).join(', ')} and ${low.at(-1)}`
}
