import { describe, expect, it } from 'vitest'

import { soldPart, soldSums } from './sold'

const DAY = 86_400_000
const buy = (shares: number, priceEur: number, day: number) => ({
  side: 'buy' as const,
  shares,
  priceEur,
  occurredAt: day * DAY,
})
const sell = (shares: number, priceEur: number, day: number) => ({
  side: 'sell' as const,
  shares,
  priceEur,
  occurredAt: day * DAY,
})

describe('soldPart', () => {
  it('sums the buys and the sales of a thing sold out', () => {
    expect(
      soldPart([buy(2, 50, 1), buy(1, 80.6, 5), sell(3, 78.97, 9)], []),
    ).toEqual({ boughtFor: 180.6, soldFor: 236.91, soldAt: 9 * DAY })
  })

  it('takes the last sale as the day', () => {
    const s = soldPart([buy(2, 10, 1), sell(1, 12, 4), sell(1, 9, 7)], [])
    expect(s?.soldAt).toBe(7 * DAY)
    expect(s?.soldFor).toBe(21)
  })

  it('does not know what was paid when the buys are not in the files', () => {
    const s = soldPart(
      [sell(4, 25, 9)],
      [{ shares: 4, asOf: 3 * DAY, paidEur: undefined }],
    )
    expect(s).toEqual({ boughtFor: null, soldFor: 100, soldAt: 9 * DAY })
    /* Half the shares bought in the files is not the cost of all sold. */
    expect(soldPart([buy(2, 10, 1), sell(4, 25, 9)], [])?.boughtFor).toBeNull()
  })

  it('counts shares a split or staking added as covered, at no cost', () => {
    const s = soldPart(
      [buy(1, 100, 1), { ...buy(1, 0, 2) }, sell(2, 70, 9)],
      [],
    )
    expect(s?.boughtFor).toBe(100)
  })

  it('is sold with no sale when the broker stops listing it', () => {
    expect(
      soldPart(
        [buy(3, 20, 1)],
        [
          { shares: 3, asOf: 2 * DAY },
          { shares: 0, asOf: 8 * DAY },
        ],
      ),
    ).toEqual({ boughtFor: 60, soldFor: null, soldAt: 8 * DAY })
  })

  it('is not sold when nothing says so', () => {
    /* Dust that was only ever bought. */
    expect(soldPart([buy(0.06, 0.2, 1)], [])).toBeNull()
    expect(soldPart([], [{ shares: 2, asOf: DAY }])).toBeNull()
  })
})

describe('soldSums', () => {
  const part = (soldFor: number | null, soldAt: number) => ({ soldFor, soldAt })

  it('adds the accounts and gives the gain when both sides are known', () => {
    expect(soldSums(180.6, [part(136.9, 3), part(100, 7)])).toEqual({
      day: 7,
      got: 236.9,
      bought: 180.6,
      gain: { eur: 56.3, pct: (56.3 / 180.6) * 100 },
    })
  })

  it('gives no gain when a side is not known', () => {
    expect(soldSums(null, [part(50, 3)]).gain).toBeNull()
    const s = soldSums(40, [part(50, 3), part(null, 4)])
    expect(s.got).toBeNull()
    expect(s.gain).toBeNull()
  })
})
