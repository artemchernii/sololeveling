import { describe, expect, it } from 'vitest'

import { rounds } from './rounds'

const t = (
  side: 'buy' | 'sell',
  day: string,
  shares: number,
  priceEur: number,
) => ({ side, occurredAt: Date.parse(`${day}T12:00:00Z`), shares, priceEur })

/* His iShares Physical Gold, as saved on 14 Oct. */
const igln = [
  t('buy', '2026-07-27', 1.43383919, 69.74),
  t('buy', '2026-07-01', 0.70249577, 69.75),
  t('buy', '2026-06-09', 2.0825794, 72.03),
  t('buy', '2026-04-16', 3.14651278, 79.45),
  t('sell', '2023-07-12', 1.491915, 34.16),
  t('sell', '2023-06-21', 0.578343, 34.48),
  t('sell', '2023-05-19', 1.412178, 35.3),
  t('buy', '2023-04-26', 0.708912, 35.27),
  t('buy', '2023-04-06', 2.773524, 36.05),
]

describe('rounds', () => {
  it('cuts where the position was held at zero, newest first', () => {
    const [now, closed] = rounds(igln)
    expect(now).toMatchObject({ open: true, buys: 4, sells: 0 })
    expect(now.buyEur).toBeCloseTo(549, 0)
    expect(new Date(now.from).toISOString().slice(0, 10)).toBe('2026-04-16')
    expect(now.trades[0].occurredAt).toBe(igln[0].occurredAt)
    expect(closed).toMatchObject({ open: false, buys: 2, sells: 3 })
    expect(closed.buyEur).toBeCloseTo(125, 0)
    expect(closed.sellEur).toBeCloseTo(120.75, 0)
    expect(new Date(closed.to).toISOString().slice(0, 10)).toBe('2023-07-12')
  })

  it('keeps a part sold inside the round now', () => {
    const r = rounds([
      t('buy', '2026-01-01', 2, 10),
      t('sell', '2026-02-01', 1, 12),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ open: true, buys: 1, sells: 1 })
  })

  it('has no open round when everything was sold', () => {
    const r = rounds([
      t('buy', '2026-01-01', 2, 10),
      t('sell', '2026-02-01', 2, 12),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].open).toBe(false)
  })

  it('adds each trade to the cent, as PAID does', () => {
    /* His MSFT round: €436.03 + €219.42 + €251.00 = €906.45 summed raw,
       €906.44 cent by cent. */
    const [r] = rounds([
      t('buy', '2026-06-22', 1.31940046, 330.48),
      t('buy', '2026-07-01', 0.64990974, 337.61),
      t('buy', '2026-07-01', 0.741729, 338.398526),
    ])
    expect(r.buyEur).toBe(
      [1.31940046 * 330.48, 0.64990974 * 337.61, 0.741729 * 338.398526]
        .map((n) => Math.round(n * 100) / 100)
        .reduce((a, b) => Math.round((a + b) * 100) / 100),
    )
  })

  it('is empty with no trade', () => {
    expect(rounds([])).toEqual([])
  })
})
