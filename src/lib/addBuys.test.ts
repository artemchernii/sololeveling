import { describe, expect, it } from 'vitest'

import { buysCheck } from './addBuys'
import type { ReadBuy } from './addBuys'

const at = (m: number, d: number) => Date.UTC(2026, m - 1, d, 12)
const buy = (m: number, d: number, shares: number, price: number): ReadBuy => ({
  occurredAt: at(m, d),
  side: 'buy',
  shares,
  price,
  currency: 'EUR',
  symbol: 'GC=F',
})
/* His screenshot of 13 Oct: four buys of gold at Revolut. */
const SHOT = [
  buy(7, 23, 0.08275, 3607.63),
  buy(6, 10, 0.069022, 3604.38),
  buy(4, 30, 0.074456, 4009.46),
  buy(4, 16, 0.059985, 4147.38),
]
const HELD = 0.408365

describe('buysCheck', () => {
  it('his four buys: what they come to, and what is still missing', () => {
    const c = buysCheck(SHOT, [], ['GC=F'], HELD)
    expect(c.fresh).toBe(4)
    /* Units × the price printed: €5.38 under the €1,100 he paid — the
       fee Revolut takes is in the amount, not in the price. */
    expect(c.totalEur).toBe(1094.62)
    expect(c.units).toBe(0.286213)
    expect(c.missing).toBe(0.122152)
    expect(c.state).toBe('missing')
    expect(c.rows.map((r) => r.eur)).toEqual([298.53, 248.78, 298.53, 248.78])
  })

  it('the same screenshot again: every row is saved, nothing new', () => {
    const c = buysCheck(
      SHOT,
      SHOT.map((r) => ({ ...r, side: 'buy' as const })),
      ['GC=F'],
      HELD,
    )
    expect(c.fresh).toBe(0)
    expect(c.rows.every((r) => r.had)).toBe(true)
    /* Counted once: saved, not saved and read. */
    expect(c.units).toBe(0.286213)
  })

  it('two buys alike on one day are two, one saved answers for one', () => {
    const two = [buy(4, 16, 0.05, 4000), buy(4, 16, 0.05, 4000)]
    const c = buysCheck(
      two,
      [{ occurredAt: at(4, 16), side: 'buy', shares: 0.05 }],
      ['GC=F'],
      0.1,
    )
    expect(c.rows.map((r) => r.had).sort()).toEqual([false, true])
    expect(c.state).toBe('reaches')
  })

  it('with the older buys too, they reach what is held', () => {
    const c = buysCheck(
      [...SHOT, buy(2, 12, 0.122152, 4000)],
      [],
      ['GC=F'],
      HELD,
    )
    expect(c.state).toBe('reaches')
    expect(buysCheck(SHOT, [], ['GC=F'], 0.2).state).toBe('over')
  })

  it('rows for something else are not counted here', () => {
    const c = buysCheck(
      [...SHOT, { ...buy(5, 5, 2, 10), symbol: 'AAPL' }],
      [],
      ['GC=F'],
      HELD,
    )
    expect(c.others).toBe(1)
    expect(c.rows).toHaveLength(4)
  })

  it('a price not in euros has no euro total made up', () => {
    const c = buysCheck(
      [{ ...buy(5, 5, 1, 10), currency: 'USD' }],
      [],
      ['GC=F'],
      1,
    )
    expect(c.totalEur).toBeNull()
  })
})
