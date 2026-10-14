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

  it('rows for another thing are named, by file, with their bank', () => {
    const fund = (intakeId: string, institution: string | null) => ({
      ...buy(5, 2, 2, 36),
      symbol: 'IGLN.L',
      name: 'iShares Physical Gold',
      intakeId,
      institution,
    })
    const c = buysCheck(
      [
        ...SHOT,
        fund('a', 'trading 212'),
        fund('a', 'trading 212'),
        fund('b', null),
      ],
      [],
      ['GC=F'],
      HELD,
    )
    expect(c.fresh).toBe(4)
    expect(c.elsewhere).toEqual([
      {
        intakeId: 'a',
        names: ['iShares Physical Gold'],
        rows: 2,
        institution: 'trading 212',
      },
      {
        intakeId: 'b',
        names: ['iShares Physical Gold'],
        rows: 1,
        institution: null,
      },
    ])
  })

  it('with the fee printed beside each buy: what was paid, €1,100', () => {
    const fees = [1.47, 1.22, 1.47, 1.22]
    const c = buysCheck(
      SHOT.map((r, i) => ({ ...r, fee: fees[i] })),
      [],
      ['GC=F'],
      HELD,
    )
    expect(c.totalEur).toBe(1100)
    expect(c.rows.map((r) => r.eur)).toEqual([300, 250, 300, 250])
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

/* His drop of 14 Oct: four Revolut screenshots of gold, scrolled down
   one after another, so IMG_9290's last three rows are IMG_9291's first
   three. The save counted each once; the check said "too much". */
describe('buysCheck across one drop', () => {
  const row = (
    intakeId: string,
    side: 'buy' | 'sell',
    day: string,
    shares: number,
    price: number,
    currency = 'EUR',
  ): ReadBuy => ({
    occurredAt: Date.parse(`${day}T12:00:00Z`),
    side,
    shares,
    price,
    currency,
    symbol: 'GC=F',
    intakeId,
  })
  const IMG_9290 = [
    row('9290', 'buy', '2022-09-27', 0.029292, 1698.37),
    row('9290', 'buy', '2022-09-27', 0.041007, 1698.45),
    row('9290', 'buy', '2022-09-15', 0.02978, 1670.56),
    row('9290', 'buy', '2022-09-15', 0.029789, 1670.06),
    row('9290', 'buy', '2022-08-23', 0.028378, 1753.16),
  ]
  const IMG_9291 = [
    row('9291', 'buy', '2022-09-15', 0.02978, 1670.56),
    row('9291', 'buy', '2022-09-15', 0.029789, 1670.06),
    row('9291', 'buy', '2022-08-23', 0.028378, 1753.16),
    row('9291', 'buy', '2022-07-28', 0.144481, 1721.68),
  ]

  it('a buy in two overlapping screenshots is counted once', () => {
    const c = buysCheck([...IMG_9290, ...IMG_9291], [], ['GC=F'], 0.302727)
    expect(c.rows).toHaveLength(6)
    expect(c.fresh).toBe(6)
    expect(c.units).toBe(0.302727)
    expect(c.state).toBe('reaches')
  })

  it('two alike in one file stay two', () => {
    const twice = [IMG_9291[3], { ...IMG_9291[3] }]
    expect(buysCheck(twice, [], ['GC=F'], 1).rows).toHaveLength(2)
  })

  it('a twin already saved is in already, once', () => {
    const saved = [
      {
        occurredAt: IMG_9291[2].occurredAt,
        side: 'buy' as const,
        shares: 0.028378,
      },
    ]
    const c = buysCheck([...IMG_9290, ...IMG_9291], saved, ['GC=F'], 0.302727)
    expect(c.rows.filter((r) => r.had)).toHaveLength(1)
    expect(c.fresh).toBe(5)
    expect(c.units).toBe(0.302727)
  })
})
