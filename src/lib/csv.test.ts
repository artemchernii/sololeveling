import { describe, expect, test } from 'vitest'

import { headerKey, parseClock, parseCsv, parseDay, parseMoney } from './csv'
import {
  applyLayout,
  cleanMerchant,
  csvTitle,
  parseLayout,
  sampleRows,
  shortColumns,
  skippedNote,
} from './csvLayout'
import type { CsvLayout } from './csvLayout'

/* His real Revolut trading export's header and row shapes (27 Sep). */
const TRADING = `Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate
2020-06-08T17:44:05.588105Z,WMB,BUY - MARKET,1.39860139,USD 21.45,USD 30,USD,1.1297
2020-06-09T07:13:50.935201Z,,CASH TOP-UP,,,USD 14,USD,1.1270
2020-08-31T08:18:01.895925Z,AAPL,STOCK SPLIT,3.00077676,,USD 0,USD,1.1898
2021-02-01T14:00:00.000Z,WMB,SELL - MARKET,0.5,USD 24.10,USD 12.05,USD,1.2100
2022-03-04T10:00:00.000Z,WMB,DIVIDEND,,,USD 0.40,USD,1.1000
2024-05-06T09:00:00.000Z,VUAA,BUY - LIMIT,2,EUR 90.12,EUR 180.24,EUR,1.0000
`

const BANK = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-09-01 10:11:12,2026-09-02 08:00:00,Bolt.euo2609161656,-6.70,0.00,EUR,COMPLETED,993.30
TRANSFER,Current,2026-09-03 09:00:00,2026-09-03 09:00:01,To Trade Republic,-200.00,0.00,EUR,COMPLETED,793.30
TOPUP,Current,2026-09-05 09:00:00,,Top-Up by *2789,50.00,0.00,EUR,PENDING,
CARD_PAYMENT,Current,2026-09-06 12:00:00,,"Pingo Doce, Lisboa",-12.40,0.00,EUR,REVERTED,
EXCHANGE,Current,2026-09-07 12:00:00,2026-09-07 12:00:01,Exchanged to USD,-100.00,0.50,EUR,COMPLETED,692.80
`

const TRADES_LAYOUT: CsvLayout = {
  kind: 'trades',
  institution: 'Revolut',
  dateColumn: 0,
  dateOrder: 'ymd',
  decimal: '.',
  currencyColumn: 6,
  pendingValues: [],
  skipValues: [],
  tickerColumn: 1,
  typeColumn: 2,
  buyPrefixes: ['BUY'],
  sellPrefixes: ['SELL'],
  splitPrefixes: ['STOCK SPLIT'],
  quantityColumn: 3,
  priceColumn: 4,
}

const BANK_LAYOUT: CsvLayout = {
  kind: 'transactions',
  institution: 'Revolut',
  dateColumn: 2,
  dateOrder: 'ymd',
  decimal: '.',
  descriptionColumn: 4,
  amountColumn: 5,
  feeColumn: 6,
  currencyColumn: 7,
  stateColumn: 8,
  balanceColumn: 9,
  pendingValues: ['PENDING'],
  skipValues: ['REVERTED', 'DECLINED'],
  buyPrefixes: [],
  sellPrefixes: [],
  splitPrefixes: [],
}

describe('parseCsv', () => {
  test('quotes, doubled quotes, CRLF, blank lines', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,2')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['1', '2'],
    ])
  })

  test('a European export with ; and a BOM', () => {
    expect(parseCsv('﻿Data;Valor\n01/09/2026;-12,40\n')).toEqual([
      ['Data', 'Valor'],
      ['01/09/2026', '-12,40'],
    ])
  })

  test('his trading file reads as 7 rows of 8 columns', () => {
    const rows = parseCsv(TRADING)
    expect(rows).toHaveLength(7)
    expect(rows.every((r) => r.length === 8)).toBe(true)
  })
})

describe('cells', () => {
  test('money as exports print it', () => {
    expect(parseMoney('USD 21.45')).toEqual({ value: 21.45, currency: 'USD' })
    expect(parseMoney('-€12,40', ',')).toEqual({
      value: -12.4,
      currency: 'EUR',
    })
    expect(parseMoney('1.234,56', ',')?.value).toBe(1234.56)
    expect(parseMoney('1,234.56')?.value).toBe(1234.56)
    expect(parseMoney('(15.00)')?.value).toBe(-15)
    expect(parseMoney('12.40 EUR')).toEqual({ value: 12.4, currency: 'EUR' })
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('n/a')).toBeNull()
  })

  test('days in every order, ISO with a time, and nonsense refused', () => {
    const noon = (y: number, m: number, d: number) =>
      new Date(y, m - 1, d, 12).getTime()
    expect(parseDay('2020-06-08T17:44:05.588105Z', 'ymd')).toBe(
      noon(2020, 6, 8),
    )
    expect(parseDay('01/09/2026', 'dmy')).toBe(noon(2026, 9, 1))
    expect(parseDay('09/01/2026', 'mdy')).toBe(noon(2026, 9, 1))
    expect(parseDay('1.9.26', 'dmy')).toBe(noon(2026, 9, 1))
    expect(parseDay('31/02/2026', 'dmy')).toBeUndefined()
    expect(parseDay('yesterday', 'ymd')).toBeUndefined()
  })

  test('the time beside a date is kept as printed, and only a real one', () => {
    expect(parseClock('2026-10-01 13:20:45')).toBe('13:20')
    expect(parseClock('2020-06-08T07:44:05.588105')).toBe('07:44')
    expect(parseClock('01/10/2026 9:05')).toBe('09:05')
    expect(parseClock('01/10/2026')).toBeUndefined()
    expect(parseClock('2026-10-01 25:10')).toBeUndefined()
  })

  test('the same header is the same key, whatever its spacing or case', () => {
    expect(headerKey(['Date', ' Ticker '])).toBe(headerKey(['date', 'ticker']))
  })

  test('merchants lose their references', () => {
    expect(cleanMerchant('Bolt.euo2609161656')).toBe('Bolt')
    expect(cleanMerchant('Pingo Doce')).toBe('Pingo Doce')
  })
})

describe('what the model is shown', () => {
  test('the start, middle and end of a long file', () => {
    const rows = Array.from({ length: 100 }, (_, i) => [String(i)])
    const shown = sampleRows(rows).map((r) => r[0])
    expect(shown).toHaveLength(25)
    expect(shown).toContain('0')
    expect(shown).toContain('50')
    expect(shown).toContain('99')
  })

  test('every value of a short column, so a split seen once is not missed', () => {
    const rows = parseCsv(TRADING)
    const types = shortColumns(rows[0], rows.slice(1)).find(
      (c) => c.name === 'Type',
    )
    expect(types?.values).toContain('STOCK SPLIT')
    expect(types?.values).toContain('DIVIDEND')
  })
})

describe('parseLayout', () => {
  const answer = (over: Record<string, unknown>) =>
    JSON.stringify({
      kind: 'trades',
      institution: 'Revolut',
      account_tail: null,
      currency: null,
      date_column: 0,
      date_order: 'ymd',
      decimal: '.',
      description_column: null,
      amount_column: null,
      out_column: null,
      in_column: null,
      fee_column: null,
      currency_column: 6,
      balance_column: null,
      state_column: null,
      pending_values: [],
      skip_values: [],
      ticker_column: 1,
      name_column: null,
      isin_column: null,
      type_column: 2,
      buy_prefixes: ['buy'],
      sell_prefixes: ['SELL'],
      split_prefixes: ['STOCK SPLIT'],
      quantity_column: 3,
      price_column: 4,
      ...over,
    })

  test('a good answer, prefixes in capitals', () => {
    const r = parseLayout(answer({}), 8)
    expect(r.ok && r.layout.buyPrefixes).toEqual(['BUY'])
  })

  test('refusals: not money, no date, a column past the edge, no price', () => {
    expect(parseLayout(answer({ kind: 'unknown' }), 8).ok).toBe(false)
    expect(parseLayout(answer({ date_column: null }), 8).ok).toBe(false)
    expect(parseLayout(answer({ price_column: 12 }), 8).ok).toBe(false)
    expect(parseLayout('{nope', 8).ok).toBe(false)
  })
})

describe('applyLayout', () => {
  test('his trading history: buys, sells and splits kept; cash and dividends named', () => {
    const rows = parseCsv(TRADING).slice(1)
    const r = applyLayout(rows, TRADES_LAYOUT)
    expect(
      r.trades.map((t) => [t.name, t.side, t.shares, t.price, t.currency]),
    ).toEqual([
      ['WMB', 'buy', 1.39860139, 21.45, 'USD'],
      ['WMB', 'sell', 0.5, 24.1, 'USD'],
      ['VUAA', 'buy', 2, 90.12, 'EUR'],
    ])
    expect(r.splits).toEqual([
      expect.objectContaining({ name: 'AAPL', shares: 3.00077676 }),
    ])
    expect(r.skipped).toEqual({ 'CASH TOP-UP': 1, DIVIDEND: 1 })
    expect(r.tickers).toBe(2)
    expect(skippedNote(r.skipped)).toBe('Left out: 1 cash top-up, 1 dividend.')
    expect(csvTitle('Revolut', r)).toBe(
      'Revolut · trades · Jun 8, 2020 → May 6, 2024',
    )
  })

  test('a bank export: fee in the amount, pending held, reverted left out, the balance', () => {
    const rows = parseCsv(BANK).slice(1)
    const r = applyLayout(rows, BANK_LAYOUT)
    expect(
      r.transactions.map((t) => [
        t.merchant,
        t.amount,
        t.pending,
        t.self,
        t.time,
      ]),
    ).toEqual([
      ['Bolt', -6.7, false, false, '10:11'],
      ['To Trade Republic', -200, false, false, '09:00'],
      ['Top-Up by *2789', 50, true, true, '09:00'],
      ['Exchanged to USD', -100.5, false, true, '12:00'],
    ])
    expect(r.skipped).toEqual({ REVERTED: 1 })
    expect(r.balance).toMatchObject({ value: 692.8, currency: 'EUR' })
  })

  test('a split in and out column bank', () => {
    const rows = parseCsv(
      'Date;Desc;Debit;Credit\n01/09/2026;Rent;850,00;\n02/09/2026;Salary;;2.140,00\n',
    )
    const r = applyLayout(rows.slice(1), {
      ...BANK_LAYOUT,
      dateColumn: 0,
      dateOrder: 'dmy',
      decimal: ',',
      descriptionColumn: 1,
      amountColumn: undefined,
      outColumn: 2,
      inColumn: 3,
      feeColumn: undefined,
      currencyColumn: undefined,
      stateColumn: undefined,
      balanceColumn: undefined,
      currency: 'EUR',
    })
    expect(r.transactions.map((t) => t.amount)).toEqual([-850, 2140])
  })
})
