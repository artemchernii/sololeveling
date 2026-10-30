import { expect, test } from 'vitest'

import { ideasFacts, shareOfMine, spendOf } from './ideasFacts'

test('a month of spending: bills at their monthly size, the rest over whole months', () => {
  expect(
    spendOf({
      bills: [
        { kind: 'expense', amount: -1200, cadence: 'monthly' },
        { kind: 'expense', amount: -240, cadence: 'yearly' },
        { kind: 'expense', amount: -60, cadence: 'monthly', everyMonths: 3 },
        { kind: 'income', amount: 3000, cadence: 'monthly' },
      ],
      rest: [
        { sum: -400, partial: [] },
        { sum: -380, partial: [] },
        { sum: -50, partial: [{}] },
      ],
    }),
  ).toEqual({ bills: 1240, rest: 390 })
})

test('each holding as a share of MINE; one with no price has none', () => {
  const s = shareOfMine([
    { symbol: 'avgo', name: 'A', valueEur: 750 },
    { symbol: 'NVDA', name: 'N', valueEur: 250 },
    { symbol: 'OZON', name: 'O', valueEur: null },
  ])
  expect(s.get('AVGO')).toBe(75)
  expect(s.get('OZON')).toBeNull()
})

test('facts: cash, spending, holdings by pos-, tickers by tk-, strip and movers', () => {
  const f = ideasFacts({
    cash: { idle: 45_858, banks: 13_425, broker: 32_433, worth: 64_686 },
    spend: { bills: 1535, rest: 391 },
    held: [{ symbol: 'GOOGL', name: 'Alphabet', valueEur: 1180 }],
    tickers: [],
    strip: [{ id: 'sp500', cell: { price: 7720, change: -0.3 } }],
    movers: {
      trending: [{ symbol: 'CAT', name: 'CAT', change: -9.25 }],
      gainers: null,
      losers: [],
    },
    extra: [{ key: 'alloc-us', label: 'US', value: 'MINE 72%', tone: null }],
  })
  const by = new Map(f.map((x) => [x.key, x.value]))
  expect(by.get('cash-idle')).toBe('€45,858 · 71% of €64,686')
  expect(by.get('spend-month')).toBe('€1,926 (bills €1,535 · day-to-day €391)')
  expect(by.get('pos-GOOGL')).toBe('€1,180 · 100% of MINE')
  expect(by.get('mk-sp500')).toBe('7,720 (-0.3% today)')
  expect(by.get('mv-trending')).toBe('CAT -9.25%')
  expect(by.has('mv-losers')).toBe(false)
  expect(by.get('alloc-us')).toBe('MINE 72%')
})
