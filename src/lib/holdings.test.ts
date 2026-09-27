import { describe, expect, it } from 'vitest'

import { notSeenSince, reconcile } from './holdings'
import type { LedgerTrade, Observation } from './holdings'

const DAY = 86_400_000
const d = (n: number) => Date.UTC(2026, 0, 1) + n * DAY
const buy = (at: number, shares: number, priceEur: number): LedgerTrade => ({
  side: 'buy',
  shares,
  priceEur,
  occurredAt: d(at),
})
const sell = (at: number, shares: number, priceEur: number): LedgerTrade => ({
  side: 'sell',
  shares,
  priceEur,
  occurredAt: d(at),
})
const seen = (at: number, shares: number, paidEur?: number): Observation => ({
  shares,
  paidEur,
  asOf: d(at),
})

describe('reconcile', () => {
  it('trades alone: their sum, and what they cost', () => {
    expect(reconcile([buy(1, 2, 100), sell(5, 0.5, 120)], [])).toEqual({
      shares: 1.5,
      paid: 140,
      status: 'trades',
      seenAt: null,
      gap: 0,
    })
  })

  it('a screen alone: its shares, and paid unknown — never zero', () => {
    const r = reconcile([], [seen(10, 0.3057)])
    expect(r).toMatchObject({ shares: 0.3057, paid: null, status: 'screen' })
    expect(r.gap).toBeCloseTo(0.3057)
  })

  it('a screen that printed a % since buy carries what was paid', () => {
    expect(reconcile([], [seen(10, 1, 139)])).toMatchObject({
      shares: 1,
      paid: 139,
      status: 'screen',
    })
  })

  it('a statement dropped after the screen fills in paid, adds no shares', () => {
    const r = reconcile([buy(2, 1, 100), buy(4, 1, 110)], [seen(10, 2)])
    expect(r).toMatchObject({ shares: 2, paid: 210, status: 'match', gap: 0 })
  })

  it('is the same whatever order the files came in', () => {
    const trades = [buy(2, 1, 100), buy(4, 1, 110), sell(12, 0.5, 130)]
    const looks = [seen(10, 2), seen(3, 1)]
    const a = reconcile(trades, looks)
    const b = reconcile([...trades].reverse(), [...looks].reverse())
    expect(a).toEqual(b)
    expect(a).toMatchObject({ shares: 1.5, status: 'match', paid: 145 })
  })

  it('screen shares worked out from value ÷ price still match', () => {
    expect(reconcile([buy(2, 2, 100)], [seen(10, 2.02)])).toMatchObject({
      shares: 2,
      status: 'match',
    })
  })

  it('more on the screen than in the trades is a gap, cost unknown', () => {
    const r = reconcile([buy(2, 1, 100)], [seen(10, 3)])
    expect(r).toMatchObject({ shares: 3, paid: null, status: 'gap', gap: 2 })
  })

  it('more in the trades than on the screen is over (a sell is missing)', () => {
    expect(reconcile([buy(2, 3, 100)], [seen(10, 1)])).toMatchObject({
      shares: 1,
      status: 'over',
      gap: -2,
    })
  })

  it('trades after the screen move it on', () => {
    expect(reconcile([buy(12, 1, 150)], [seen(10, 2, 200)])).toMatchObject({
      shares: 3,
      paid: 350,
      status: 'screen',
    })
  })

  it('the latest screen is the one compared', () => {
    const r = reconcile([buy(2, 1, 100)], [seen(5, 4), seen(10, 1)])
    expect(r).toMatchObject({ shares: 1, status: 'match', seenAt: d(10) })
  })

  it('a statement dropped twice is the dedupe’s job, not this', () => {
    /* Two identical rows would count twice here — confirmTrades skips the
       second before it is stored. */
    expect(reconcile([buy(2, 1, 100), buy(2, 1, 100)], []).shares).toBe(2)
  })
})

describe('notSeenSince', () => {
  it('a later day’s screen without it flags it', () => {
    expect(notSeenSince(d(1), d(3))).toBe(true)
  })
  it('two screens the same day are one look', () => {
    expect(notSeenSince(d(1), d(1) + 3_600_000)).toBe(false)
  })
  it('never seen on a screen: nothing to flag', () => {
    expect(notSeenSince(null, d(3))).toBe(false)
  })
})
