import { describe, expect, it } from 'vitest'

import { checkCryptoStatement, sharesIn } from './crypto'
import type { CoinTrade } from './crypto'

/* Shapes from his Revolut crypto statement (4 Oct). */
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime()
const t = (over: Partial<CoinTrade>): CoinTrade => ({
  occurredAt: at(2025, 1, 25),
  name: 'SOL',
  side: 'buy',
  shares: 1,
  price: 100,
  currency: 'EUR',
  ...over,
})

describe('sharesIn', () => {
  it('a buy brings in its quantity less the fee, in coins', () => {
    expect(
      sharesIn(t({ shares: 1.072867, price: 139.81, fee: 1.48 })),
    ).toBeCloseTo(1.072867 * (1 - 1.48 / 150), 6)
    expect(sharesIn(t({ side: 'sell', shares: 2 }))).toBe(-2)
    expect(sharesIn(t({ side: 'reward', shares: 0.11, price: 0 }))).toBe(0.11)
  })
})

describe('checkCryptoStatement', () => {
  it('holds, deals, staking, sold out — and whether the trades add up', () => {
    const c = checkCryptoStatement(
      [
        t({
          name: 'ADA',
          shares: 400,
          price: 0.25,
          currency: 'USD',
          occurredAt: at(2026, 1, 5),
        }),
        t({ name: 'ADA', side: 'reward', shares: 0.1, price: 0 }),
        t({ name: 'ADA', side: 'reward', shares: 0.1, price: 0 }),
        t({
          name: 'XLM',
          shares: 10,
          price: 0.1,
          occurredAt: at(2020, 11, 24),
        }),
        t({ name: 'XLM', side: 'sell', shares: 10, price: 0.12 }),
        t({ name: 'ETH', shares: 0.0538, price: 2000 }),
      ],
      [
        { name: 'ADA', shares: 400.2, valueEur: 87 },
        { name: 'ETH', shares: 0.0527, valueEur: 126 },
      ],
    )
    expect(c.held.map((h) => h.coin)).toEqual(['ADA', 'ETH'])
    expect(c.worthEur).toBe(213)
    expect(c.deals).toBe(4)
    expect(c.from).toBe(at(2020, 11, 24))
    expect(c.currencies).toEqual(['EUR', 'USD'])
    expect(c.rewards).toBe(2)
    expect(c.staked).toEqual([{ coin: 'ADA', shares: 0.2 }])
    expect(c.soldOut).toEqual(['XLM'])
    /* ADA adds up; ETH's trades say 0.0011 more than the statement. */
    expect(c.differs.map((d) => d.coin)).toEqual(['ETH'])
    expect(c.differs[0].diff).toBeCloseTo(-0.0011, 6)
  })
})
