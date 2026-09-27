import { describe, expect, test } from 'vitest'

import { parseLine, parseLines } from './money-lines'
import type { LineAccount } from './money-lines'

/* Sun 27 Sep 2026, 15:00 local. */
const TODAY = new Date(2026, 8, 27).getTime()
const NOW = new Date(2026, 8, 27, 15).getTime()
const noon = (m: number, d: number) => new Date(2026, m, d, 12).getTime()

const ACCOUNTS: Array<LineAccount> = [
  { id: 'rev', name: 'Revolut', kinds: ['bank'], currencies: ['EUR', 'USD'] },
  {
    id: 'inv',
    name: 'Revolut Invest',
    kinds: ['broker'],
    currencies: ['EUR'],
  },
  { id: 'bpi', name: 'BPI', kinds: ['bank'], currencies: ['EUR'] },
  { id: 'tr', name: 'Trade Republic', kinds: ['broker'], currencies: ['EUR'] },
  { id: 't212', name: 'Trading 212', kinds: ['broker'], currencies: ['EUR'] },
]
const opts = { accounts: ACCOUNTS, today: TODAY, now: NOW }
const p = (s: string) => parseLine(s, opts)

describe('parseLine', () => {
  test('money in: salary, the IRS, a sign', () => {
    expect(p('in 2900 salary bpi')).toMatchObject({
      kind: 'in',
      amount: 2900,
      category: 'salary',
      accountId: 'bpi',
      occurredAt: NOW,
      missing: [],
    })
    expect(p('+350 irs return bpi')).toMatchObject({
      kind: 'in',
      amount: 350,
      category: 'irs return',
    })
    expect(p('bonus 1500 revolut')).toMatchObject({
      kind: 'in',
      category: 'bonus',
      accountId: 'rev',
    })
  })

  test('money out: a category from its words, or asked for', () => {
    expect(p('-48 groceries revolut')).toMatchObject({
      kind: 'out',
      amount: 48,
      category: 'groceries',
      accountId: 'rev',
      missing: [],
    })
    expect(p('out 1200 laptop revolut')).toMatchObject({
      kind: 'out',
      amount: 1200,
      note: 'laptop',
      category: 'shopping',
      missing: [],
    })
    expect(p('out 80 wedding gift bpi')).toMatchObject({
      missing: ['what it was'],
    })
    expect(p('spent 35 dinner')).toMatchObject({
      kind: 'out',
      category: 'eating out',
      missing: ['from which account'],
    })
  })

  test('a transfer, however it is said', () => {
    for (const line of [
      'bpi → tr 2000',
      'bpi -> tr 2000',
      'bpi > tr 2000',
      'transfer 2000 from bpi to trade republic',
      '2000 bpi to tr',
      'moved 2000 to tr from bpi',
    ]) {
      expect(p(line), line).toMatchObject({
        kind: 'transfer',
        amount: 2000,
        fromId: 'bpi',
        toId: 'tr',
        missing: [],
      })
    }
  })

  test('Revolut Invest is its own account; plain "revolut" is the current one', () => {
    expect(p('revolut → revolut invest 300')).toMatchObject({
      fromId: 'rev',
      toId: 'inv',
    })
    expect(p('transfer 500 revolut invest')).toMatchObject({
      kind: 'transfer',
      fromId: 'inv',
      missing: ['to which account'],
    })
  })

  test('a buy and a sell: shares, ticker, price, broker — 212 is the broker, not a number', () => {
    expect(p('bought 3 msft 402 tr')).toMatchObject({
      kind: 'buy',
      symbol: 'MSFT',
      shares: 3,
      price: 402,
      accountId: 'tr',
      missing: [],
    })
    expect(p('sold 2 aapl @ 210 212')).toMatchObject({
      kind: 'sell',
      symbol: 'AAPL',
      shares: 2,
      price: 210,
      accountId: 't212',
    })
    expect(p('buy 0.5 vwce.de at 118,40 trading 212')).toMatchObject({
      kind: 'buy',
      symbol: 'VWCE.DE',
      shares: 0.5,
      price: 118.4,
      accountId: 't212',
    })
    /* "bought" with one number is a purchase, not a trade. */
    expect(p('bought laptop 1200 revolut')).toMatchObject({
      kind: 'out',
      amount: 1200,
    })
    expect(p('bought 3 msft tr').missing).toContain('the price per share')
  })

  test('when: yesterday, a weekday, a date — noon that day', () => {
    expect(p('out 20 fuel bpi yesterday').occurredAt).toBe(noon(8, 26))
    expect(p('out 20 fuel bpi fri').occurredAt).toBe(noon(8, 25))
    expect(p('out 20 fuel bpi sun').occurredAt).toBe(noon(8, 20))
    expect(p('out 20 fuel bpi 12 sep').occurredAt).toBe(noon(8, 12))
    expect(p('out 20 fuel bpi sep 3').occurredAt).toBe(noon(8, 3))
    expect(p('out 20 fuel bpi 2026-08-31').occurredAt).toBe(noon(7, 31))
    /* A date after today is last year's. */
    expect(p('out 20 fuel bpi 24 dec').occurredAt).toBe(
      new Date(2025, 11, 24, 12).getTime(),
    )
    /* Words that start like a day are words. */
    expect(p('out 90 wedding gift bpi').occurredAt).toBe(NOW)
  })

  test('currencies and number formats', () => {
    expect(p('$50 spotify revolut')).toMatchObject({
      amount: 50,
      currency: 'USD',
    })
    expect(p('out 50 usd spotify revolut').currency).toBe('USD')
    expect(p('out 1.234,56 rent bpi').amount).toBe(1234.56)
    expect(p('out 1,234.56 rent bpi').amount).toBe(1234.56)
    expect(p('out 12,5 lunch bpi').amount).toBe(12.5)
  })

  test('nothing to read is said so', () => {
    expect(p('hello there')).toMatchObject({
      kind: null,
      missing: ['an amount'],
    })
  })
})

test('parseLines: one row a line, blanks skipped', () => {
  const rows = parseLines('in 2900 salary bpi\n\n  bpi → tr 500 \n', opts)
  expect(rows.map((r) => r.kind)).toEqual(['in', 'transfer'])
})
