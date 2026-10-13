import { describe, expect, it } from 'vitest'

import { combine, gainOf, ordered } from './owned'
import type { Held } from './owned'

const held = (over: Partial<Held>): Held => ({
  accountId: 'revolut',
  instrumentId: 'amzn',
  symbol: 'AMZN',
  name: 'Amazon.com, Inc.',
  type: 'EQUITY',
  shares: 1,
  paid: 100,
  valueEur: 120,
  staked: 0,
  ...over,
})

describe('combine', () => {
  it('makes one row of a company two accounts own', () => {
    const [o, ...rest] = combine([
      held({ shares: 3.3, paid: 580, valueEur: 615.2 }),
      held({ accountId: 'tr', shares: 2.2, paid: 430, valueEur: 410 }),
    ])
    expect(rest).toHaveLength(0)
    expect(o.shares).toBe(5.5)
    expect(o.paid).toBe(1010)
    expect(o.valueEur).toBe(1025.2)
    expect(o.at.map((r) => r.accountId)).toEqual(['revolut', 'tr'])
    expect(gainOf(o)).toEqual({ eur: 15.2, pct: (15.2 / 1010) * 100 })
  })

  it('makes one row of a company bought on three exchanges', () => {
    const novo = { name: 'Novo Nordisk A/S' }
    const [o, ...rest] = combine([
      held({ ...novo, instrumentId: 'f', symbol: 'NOV1.F', valueEur: 50 }),
      held({ ...novo, instrumentId: 'ny', symbol: 'NVO', valueEur: 300 }),
      held({ ...novo, instrumentId: 'co', symbol: 'NOVO-B.CO', valueEur: 80 }),
      held({ ...novo, instrumentId: 'ny', accountId: 'tr', valueEur: 10 }),
    ])
    expect(rest).toHaveLength(0)
    /* The listing worth the most leads, with every account it is in. */
    expect(o.instrumentId).toBe('ny')
    expect(o.symbol).toBe('NVO')
    expect(o.at.map((r) => r.instrumentId)).toEqual(['ny', 'ny', 'f', 'co'])
    expect(o.valueEur).toBe(440)
    expect(o.paid).toBe(400)
  })

  it('keeps a fund and a company of one name apart', () => {
    expect(
      combine([held({}), held({ instrumentId: 'etf', type: 'ETF' })]),
    ).toHaveLength(2)
  })

  it('keeps two things apart and says what kind each is', () => {
    const list = combine([
      held({}),
      held({ instrumentId: 'sol', symbol: 'SOL-EUR', type: 'CRYPTOCURRENCY' }),
    ])
    expect(list.map((o) => o.kind)).toEqual(['stock', 'crypto'])
  })

  it('shows no gain when one account has no cost', () => {
    const [o] = combine([held({}), held({ accountId: 'tr', paid: null })])
    expect(o.paid).toBeNull()
    expect(o.valueEur).toBe(240)
    expect(gainOf(o)).toBeNull()
  })

  it('has no worth while a part has no price', () => {
    const [o] = combine([held({}), held({ accountId: 'tr', valueEur: null })])
    expect(o.valueEur).toBeNull()
    expect(gainOf(o)).toBeNull()
  })

  it('prices staked coins like the rest of the coin', () => {
    const [o] = combine([
      held({ type: 'CRYPTOCURRENCY', shares: 4, valueEur: 600, staked: 0.5 }),
    ])
    expect(o.stakedEur).toBe(75)
    expect(combine([held({})])[0].stakedEur).toBeNull()
  })
})

describe('ordered', () => {
  const list = combine([
    held({ instrumentId: 'big', name: 'big', paid: 900, valueEur: 1000 }),
    held({ instrumentId: 'winner', name: 'winner', paid: 100, valueEur: 200 }),
    held({ instrumentId: 'loser', name: 'loser', paid: 500, valueEur: 400 }),
    held({
      instrumentId: 'unknown',
      name: 'unknown',
      paid: null,
      valueEur: 50,
    }),
    held({ instrumentId: 'unpriced', name: 'unpriced', valueEur: null }),
  ])
  const ids = (by: 'worth' | 'up' | 'down') =>
    ordered(list, by).map((o) => o.instrumentId)

  it('puts the biggest first, one with no worth last', () => {
    expect(ids('worth')).toEqual([
      'big',
      'loser',
      'winner',
      'unknown',
      'unpriced',
    ])
  })

  it('orders by gain, those with none known last', () => {
    expect(ids('up').slice(0, 3)).toEqual(['winner', 'big', 'loser'])
    expect(ids('down').slice(0, 3)).toEqual(['loser', 'big', 'winner'])
    expect(ids('up').slice(3)).toEqual(['unknown', 'unpriced'])
  })
})
