/* A crypto statement checked before anything is saved (4 Oct; mock
   design/treasury-mockup/crypto.html, "adding the statement"): what he
   holds, his buys and sells, what staking gave him, the coins he sold
   completely, and whether the trades add up to the statement's closing
   amounts. Pure, so the review and its tests agree. */

export type CoinTrade = {
  occurredAt: number
  name: string
  side: 'buy' | 'sell' | 'reward'
  shares: number
  price: number
  currency: string
  fee?: number
}

export type Closing = { name: string; shares?: number; valueEur?: number }

/** A buy brings in its quantity less the fee's share of the value:
    Revolut takes its crypto fee in coins. convex/intake writes the same. */
export function sharesIn(t: CoinTrade): number {
  if (t.side === 'sell') return -t.shares
  if (t.side === 'buy' && t.fee && t.price > 0)
    return t.shares * (1 - t.fee / (t.shares * t.price))
  return t.shares
}

const coinOf = (name: string) => name.trim().toUpperCase().split(/\s+/)[0]

/** Within this share of the statement's amount, trades and statement
    agree (its printed prices are rounded). */
export const COIN_MATCH = 0.005

export function checkCryptoStatement(
  trades: ReadonlyArray<CoinTrade>,
  closing: ReadonlyArray<Closing>,
) {
  const held = closing
    .filter((c) => (c.shares ?? 0) > 0)
    .map((c) => ({
      coin: coinOf(c.name),
      shares: c.shares ?? 0,
      valueEur: c.valueEur,
    }))
  const deals = trades.filter((t) => t.side !== 'reward')
  const rewards = trades.filter((t) => t.side === 'reward')
  const net = new Map<string, number>()
  for (const t of trades)
    net.set(coinOf(t.name), (net.get(coinOf(t.name)) ?? 0) + sharesIn(t))
  const staked = new Map<string, number>()
  for (const r of rewards)
    staked.set(coinOf(r.name), (staked.get(coinOf(r.name)) ?? 0) + r.shares)
  const heldCoins = new Set(held.map((h) => h.coin))
  const soldOut = [...net.keys()].filter((c) => !heldCoins.has(c))
  const differs = held
    .map((h) => {
      const fromTrades = net.get(h.coin) ?? 0
      return {
        coin: h.coin,
        statement: h.shares,
        trades: fromTrades,
        diff: h.shares - fromTrades,
      }
    })
    .filter((d) => Math.abs(d.diff) > Math.max(1e-8, d.statement * COIN_MATCH))
  const times = deals.map((t) => t.occurredAt)
  return {
    held,
    worthEur:
      Math.round(held.reduce((t, h) => t + (h.valueEur ?? 0), 0) * 100) / 100,
    deals: deals.length,
    from: times.length ? Math.min(...times) : null,
    to: times.length ? Math.max(...times) : null,
    currencies: [...new Set(deals.map((t) => t.currency))].sort(),
    rewards: rewards.length,
    staked: [...staked].map(([coin, shares]) => ({ coin, shares })),
    soldOut,
    differs,
  }
}
