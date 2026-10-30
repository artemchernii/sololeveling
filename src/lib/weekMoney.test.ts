import { describe, expect, test } from 'vitest'

import { weekMoney } from './weekMoney'
import type { MoneyHeld, MoneyInput } from './weekMoney'

const h = (
  symbol: string,
  valueEur: number,
  region: MoneyHeld['region'],
  kind: MoneyHeld['kind'] = 'stock',
): MoneyHeld => ({ symbol, name: symbol, kind, valueEur, region })

const held = [
  h('GOOGL', 1240, 'us'),
  h('META', 610, 'us'),
  h('MSFT', 900, 'us'),
  h('VEUR.AS', 377, 'europe', 'etf'),
  h('IGLN.L', 2071, 'world', 'gold'),
  h('VUAA.L', 13630, 'us', 'etf'),
]
const input = (over: Partial<MoneyInput> = {}): MoneyInput => ({
  held,
  cash: 45858,
  reported: new Set(['GOOGL', 'META', 'MSFT']),
  ...over,
})

describe('weekMoney', () => {
  test('rates: cash in euros', () => {
    const m = weekMoney('rates', [], input())
    expect(m?.chips).toEqual([
      { symbol: null, name: 'Cash in euros', eur: 45858, share: null },
    ])
    expect(m?.zero).toBe(false)
  })

  test('earn: the held companies that reported, biggest first, and their total', () => {
    const m = weekMoney('earn', ['res-GOOGL'], input())
    expect(m?.chips.map((c) => c.symbol)).toEqual(['GOOGL', 'MSFT', 'META'])
    expect(m?.total).toBe('€2,750 in companies that reported')
  })

  test('earn: none reported is a grey row', () => {
    const m = weekMoney('earn', [], input({ reported: new Set() }))
    expect(m).toEqual({
      chips: [],
      total: 'no company held reported',
      zero: true,
    })
  })

  test('eu: European holdings and euro cash, with the share of investments', () => {
    const m = weekMoney('eu', [], input())
    expect(m?.chips.map((c) => c.name)).toEqual(['VEUR.AS', 'Cash in euros'])
    expect(m?.chips[0].share).toBe(2)
    expect(m?.total).toBe('2% of investments in Europe')
  })

  test('gold: gold holdings and their share', () => {
    const m = weekMoney('gold', [], input())
    expect(m?.chips.map((c) => c.symbol)).toEqual(['IGLN.L'])
    expect(m?.total).toBe('11% of investments in gold')
  })

  test('em: nothing held names the place of the story', () => {
    expect(weekMoney('em', ['reg-brazil', 'reg-emerging'], input())).toEqual({
      chips: [],
      total: 'nothing in Brazil · 0% in emerging markets',
      zero: true,
    })
    expect(weekMoney('em', ['reg-emerging'], input())?.total).toBe(
      'nothing in emerging markets · 0% of investments',
    )
  })

  test('em: emerging holdings when held', () => {
    const m = weekMoney(
      'em',
      ['reg-brazil'],
      input({ held: [...held, h('VFEG.L', 300, 'emerging', 'etf')] }),
    )
    expect(m?.zero).toBe(false)
    expect(m?.chips.map((c) => c.symbol)).toEqual(['VFEG.L'])
    expect(m?.total).toBe('2% in emerging markets')
  })

  test('mkt: all investments and the US part', () => {
    const m = weekMoney('mkt', [], input())
    expect(m?.chips[0]).toEqual({
      symbol: null,
      name: 'Investments',
      eur: 18828,
      share: null,
    })
    expect(m?.total).toBe('87% in the US')
  })

  test('none, or money not read yet: no row', () => {
    expect(weekMoney('none', [], input())).toBeNull()
    expect(weekMoney('gold', [], input({ held: null }))).toBeNull()
  })

  test('a holding with no value is left out', () => {
    const m = weekMoney(
      'earn',
      [],
      input({ held: [h('GOOGL', 1240, 'us'), { ...h('META', 0, 'us') }] }),
    )
    expect(m?.chips.map((c) => c.symbol)).toEqual(['GOOGL'])
  })
})
