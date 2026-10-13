import { kindOf } from './logo'
import { UNPRICED } from './market'
import { METALS } from './metals'

/* The line under a holding (10 Oct: "WHAT THE FUCK IS THIS TEXT"). It
   used to say where every number came from — "statement and Oct 3
   screen agree", "paid not known yet" — which is checking, not news.
   Now a row says something only when he has something to do or know,
   in a sentence; a row that is fine has no line. */

export type HoldingRow = {
  symbol: string
  type: string
  paid: number | null
  status: 'trades' | 'match' | 'screen' | 'gap' | 'over'
  seenAt: number | null
  gap: number
  notSeen: boolean
  priceAsOf: number | null
}

/** The metal's code (XAU) for its price symbol (GC=F), else null. */
export function metalOf(symbol: string): string | null {
  return (
    Object.entries(METALS).find(
      ([, m]) => m.candidate.symbol === symbol,
    )?.[0] ?? null
  )
}

/** The code he knows it by: VUAA for VUAA.L, SOL for SOL-EUR, XAU for
    gold's price symbol. A share class (BRK-B) is kept whole. */
export function codeOf(row: Pick<HoldingRow, 'symbol' | 'type'>): string {
  const metal = metalOf(row.symbol)
  if (metal) return metal
  if (kindOf(row) === 'crypto') return row.symbol.split('-')[0]
  return row.symbol.replace(/\.[A-Z]{1,4}$/, '')
}

/** "oz" for a metal, the coin's own symbol for a coin, "shares" else. */
export function unitOf(
  row: Pick<HoldingRow, 'symbol' | 'type'>,
  amount: number,
): string {
  if (metalOf(row.symbol)) return 'oz'
  if (kindOf(row) === 'crypto') return row.symbol.split('-')[0]
  return amount === 1 ? 'share' : 'shares'
}

const amount = (n: number) => String(Number(Math.abs(n).toFixed(6)))
const shares = (n: number) =>
  `${amount(n)} ${Math.abs(n) === 1 ? 'share' : 'shares'}`

export function holdingLine(
  row: HoldingRow,
  account: string,
  day: (t: number) => string,
): { text: string; warn: boolean } | null {
  const seen = row.seenAt === null ? null : day(row.seenAt)
  if (row.notSeen)
    return {
      text: `Not in the latest ${account} file${seen ? ` · last seen ${seen}` : ''}`,
      warn: true,
    }
  if (row.type === UNPRICED) {
    const asOf = row.priceAsOf ?? row.seenAt
    return {
      text: `No market price · worth from the ${account} screenshot${asOf === null ? '' : ` of ${day(asOf)}`}`,
      warn: false,
    }
  }
  /* A coin's amount is its statement's closing amount (4 Oct), so a
     difference with its trades changes nothing he sees. */
  if (kindOf(row) === 'crypto' || metalOf(row.symbol)) return null
  if (row.status === 'gap')
    return {
      text: `${account}: ${shares(row.gap)} more than in the files. A buy is missing.`,
      warn: true,
    }
  if (row.status === 'over')
    return {
      text: `Files: ${shares(row.gap)} more than in ${account}. A sale is missing.`,
      warn: true,
    }
  if (row.status === 'screen' && row.paid === null)
    return {
      text: `Bought for: unknown · a ${account} statement adds it`,
      warn: false,
    }
  return null
}
