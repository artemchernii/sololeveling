/* What a buy cost, fee and all (14 Oct). Revolut prints a gold buy as
   "0,08275 units · €3 607,63" with −€300 beside it: units × price is
   €298.53, and the €1.47 between them is its fee — inside the amount,
   not in the price. He asked for the buy total to be what he paid
   ("yes, fee"). A coin's fee is taken in coins instead (crypto.ts). */

type Deal = {
  side: 'buy' | 'sell' | 'reward' | 'split'
  shares: number
  price: number
  fee?: number
  crypto?: boolean
}

/** The fee inside an amount printed beside a trade: what was paid over
    units × price on a buy, what came in under it on a sale. None when
    the two agree, or when they are too far apart to be a fee (5%) —
    then the amount is something else, and nothing is made up. */
export function feeInside(
  side: 'buy' | 'sell',
  shares: number,
  price: number,
  paid: number,
): number | undefined {
  const worth = shares * price
  const fee =
    Math.round((side === 'buy' ? paid - worth : worth - paid) * 100) / 100
  return fee >= 0.01 && fee <= worth * 0.05 ? fee : undefined
}

/** The price a unit really cost or brought: the printed price with the
    fee spread over the units. A coin's price is left as printed. */
export function costPrice(t: Deal): number {
  if (t.crypto || !t.fee || !(t.shares > 0)) return t.price
  if (t.side === 'buy') return (t.shares * t.price + t.fee) / t.shares
  if (t.side === 'sell')
    return Math.max(0, (t.shares * t.price - t.fee) / t.shares)
  return t.price
}
