import { describe, expect, it } from 'vitest'

import { costPrice, feeInside } from './tradeCost'

describe('the fee inside the amount paid', () => {
  it('his gold buy: €300 paid for 0.08275 oz at €3,607.63 is a €1.47 fee', () => {
    expect(feeInside('buy', 0.08275, 3607.63, 300)).toBe(1.47)
    expect(feeInside('buy', 0.069022, 3604.38, 250)).toBe(1.22)
  })
  it('a sale brings in less than units × price', () => {
    expect(feeInside('sell', 2, 100, 198.5)).toBe(1.5)
  })
  it('no fee where they agree, none made up where they are far apart', () => {
    expect(feeInside('buy', 2, 100, 200)).toBeUndefined()
    expect(feeInside('buy', 2, 100, 199)).toBeUndefined()
    expect(feeInside('buy', 2, 100, 260)).toBeUndefined()
  })
})

describe('what a unit cost, fee and all', () => {
  it('his four gold buys come to the €1,100 he paid', () => {
    const buys = [
      [0.08275, 3607.63, 300],
      [0.069022, 3604.38, 250],
      [0.074456, 4009.46, 300],
      [0.059985, 4147.38, 250],
    ]
    const total = buys.reduce((t, [shares, price, paid]) => {
      const fee = feeInside('buy', shares, price, paid)
      return t + shares * costPrice({ side: 'buy', shares, price, fee })
    }, 0)
    expect(Math.round(total * 100) / 100).toBe(1100)
  })
  it('a sale counts what it brought after the fee', () => {
    expect(costPrice({ side: 'sell', shares: 2, price: 100, fee: 1.5 })).toBe(
      99.25,
    )
  })
  it('no fee, a coin, a reward: the price as printed', () => {
    expect(costPrice({ side: 'buy', shares: 2, price: 100 })).toBe(100)
    expect(
      costPrice({ side: 'buy', shares: 2, price: 100, fee: 1, crypto: true }),
    ).toBe(100)
    expect(costPrice({ side: 'reward', shares: 2, price: 0, fee: 1 })).toBe(0)
  })
})
