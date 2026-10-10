import { describe, expect, it } from 'vitest'

import { holdingLine, unitOf } from './holdingLine'
import type { HoldingRow } from './holdingLine'

const day = () => 'Oct 3'
const row = (over: Partial<HoldingRow> = {}): HoldingRow => ({
  symbol: 'GOOG',
  type: 'EQUITY',
  paid: 100,
  status: 'match',
  seenAt: 1,
  gap: 0,
  notSeen: false,
  priceAsOf: null,
  ...over,
})

describe('holdingLine', () => {
  it('says nothing when the row is fine', () => {
    expect(holdingLine(row(), 'Trade Republic', day)).toBeNull()
    expect(holdingLine(row({ status: 'trades' }), 'X', day)).toBeNull()
    expect(holdingLine(row({ status: 'screen' }), 'X', day)).toBeNull()
  })

  it('says nothing for gold, even without what was paid', () => {
    expect(
      holdingLine(
        row({ symbol: 'GC=F', type: 'FUTURE', status: 'screen', paid: null }),
        'Revolut',
        day,
      ),
    ).toBeNull()
  })

  it('says nothing for a coin whose statement differs from its trades', () => {
    expect(
      holdingLine(
        row({
          symbol: 'SOL-EUR',
          type: 'CRYPTOCURRENCY',
          status: 'gap',
          gap: 2,
        }),
        'Revolut',
        day,
      ),
    ).toBeNull()
  })

  it('asks for a statement when only a screenshot knows the shares', () => {
    expect(
      holdingLine(row({ status: 'screen', paid: null }), 'Trading 212', day),
    ).toEqual({
      text: 'Upload a Trading 212 statement to see what you paid',
      warn: false,
    })
  })

  it('names a missing buy or sell in shares', () => {
    expect(
      holdingLine(row({ status: 'gap', gap: 2 }), 'Trading 212', day),
    ).toEqual({
      text: 'Trading 212 shows 2 shares more than your statements — a buy is missing',
      warn: true,
    })
    expect(
      holdingLine(row({ status: 'over', gap: -1 }), 'Trading 212', day)?.text,
    ).toBe(
      'Your statements show 1 share more than Trading 212 — a sell is missing',
    )
  })

  it('warns when the latest upload no longer has it', () => {
    expect(holdingLine(row({ notSeen: true }), 'Revolut', day)).toEqual({
      text: 'Not in your latest Revolut upload — last there Oct 3',
      warn: true,
    })
  })

  it('says a holding without a live price is the screenshot value', () => {
    expect(
      holdingLine(row({ type: 'UNPRICED' }), 'Trading 212', day)?.text,
    ).toBe('No live price — value from your Trading 212 screenshot of Oct 3')
  })

  it('never uses the old words', () => {
    const all = (['trades', 'match', 'screen', 'gap', 'over'] as const)
      .map((status) =>
        holdingLine(row({ status, gap: 1, paid: null }), 'A', day),
      )
      .map((l) => l?.text ?? '')
      .join(' ')
    expect(all).not.toMatch(/\bsh\b|agree|not known|screen\b|GC=F/)
  })
})

describe('unitOf', () => {
  it('spells shares out, ounces for a metal, the coin for a coin', () => {
    expect(unitOf({ symbol: 'GOOG', type: 'EQUITY' }, 1.24)).toBe('shares')
    expect(unitOf({ symbol: 'GOOG', type: 'EQUITY' }, 1)).toBe('share')
    expect(unitOf({ symbol: 'GC=F', type: 'FUTURE' }, 0.4)).toBe('oz')
    expect(unitOf({ symbol: 'SOL-EUR', type: 'CRYPTOCURRENCY' }, 3)).toBe('SOL')
  })
})
