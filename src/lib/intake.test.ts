import { describe, expect, test } from 'vitest'

import {
  completePosition,
  dayToMs,
  diffHoldings,
  findDuplicates,
  findRecurring,
  matchAccount,
  merchantKey,
  parseReading,
  preferClass,
  readableFile,
  searchableName,
} from './intake'

/* Shaped on his real examples (27 Sep): a Revolut statement, a Revolut
   history screenshot, a Trade Republic holdings screenshot. */

const at = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime()

describe('merchantKey', () => {
  test('one merchant, however the bank prints it', () => {
    expect(merchantKey('Bolt.euo2609161656')).toBe('bolt')
    expect(merchantKey('Bolt.euo2609161932, Tallinn')).toBe('bolt')
    expect(merchantKey('Bolt')).toBe('bolt')
    expect(merchantKey('Bnp Toc, Lisboa')).toBe('bnp toc')
    expect(merchantKey('BNP TOC')).toBe('bnp toc')
    expect(merchantKey('Anthropic* Claude Sub, Dublin 4')).toBe('anthropic')
    expect(merchantKey('Www.amazon*jn0dg0fq5, Luxembourg')).toBe('www amazon')
  })
})

describe('findDuplicates', () => {
  const statement = [
    { occurredAt: at(9, 26), amount: -10.81, merchant: 'Li Yuan' },
    { occurredAt: at(9, 24), amount: -14.1, merchant: 'Bullguer Saldanha' },
    { occurredAt: at(9, 24), amount: -6.7, merchant: 'Bnp Toc' },
    { occurredAt: at(9, 22), amount: -0.63, merchant: 'Bnp Toc' },
  ]
  test('the screenshot shows the spending day, the statement the posting day', () => {
    const screenshot = [
      { occurredAt: at(9, 25), amount: -10.81, merchant: 'Li Yuan' },
      { occurredAt: at(9, 23), amount: -14.1, merchant: 'Bullguer Saldanha' },
      { occurredAt: at(9, 23), amount: -6.7, merchant: 'BNP TOC' },
      { occurredAt: at(9, 21), amount: -0.63, merchant: 'Bnp Toc' },
    ]
    expect(findDuplicates(screenshot, statement)).toEqual([0, 1, 2, 3])
  })
  test('two real lunches of the same price stay two', () => {
    const two = [
      { occurredAt: at(9, 24), amount: -6.7, merchant: 'Bnp Toc' },
      { occurredAt: at(9, 25), amount: -6.7, merchant: 'Bnp Toc' },
    ]
    expect(findDuplicates(two, [statement[2]])).toEqual([0, null])
  })
  test('same amount elsewhere, or three days off, is not a duplicate', () => {
    expect(
      findDuplicates(
        [{ occurredAt: at(9, 24), amount: -6.7, merchant: 'Galeto' }],
        statement,
      ),
    ).toEqual([null])
    expect(
      findDuplicates(
        [{ occurredAt: at(9, 20), amount: -6.7, merchant: 'Bnp Toc' }],
        statement,
      ),
    ).toEqual([null])
  })
})

describe('findRecurring', () => {
  test('the Claude subscription on the 5th comes round; Bnp Toc lunches do not', () => {
    const rows = [
      {
        occurredAt: at(8, 5),
        amount: -22.14,
        merchant: 'Anthropic* Claude Sub, Dublin',
      },
      {
        occurredAt: at(9, 5),
        amount: -22.14,
        merchant: 'Anthropic* Claude Sub, Dublin 4',
      },
      {
        occurredAt: at(9, 3),
        amount: -5.34,
        merchant: 'Anthropic, San Francisco',
      },
      { occurredAt: at(8, 15), amount: -6.7, merchant: 'Bnp Toc' },
      { occurredAt: at(8, 20), amount: -6.7, merchant: 'Bnp Toc' },
      { occurredAt: at(9, 5), amount: -6.7, merchant: 'Bnp Toc' },
      { occurredAt: at(9, 15), amount: -6.7, merchant: 'Bnp Toc' },
      { occurredAt: at(8, 18), amount: 4400, merchant: 'Payment from ARTEM' },
    ]
    expect(findRecurring(rows)).toEqual([
      {
        key: 'anthropic',
        merchant: 'Anthropic* Claude Sub, Dublin',
        amount: -22.14,
        day: 5,
        months: 2,
      },
    ])
  })
})

describe('matchAccount', () => {
  const accounts = [
    { id: 'rev', name: 'Revolut', domain: 'revolut.com' },
    { id: 'tr', name: 'TR' },
    { id: '212', name: '212' },
    { id: 'bpi', name: 'BPI' },
  ]
  test('brokers by their real names, the same bank’s investment account', () => {
    expect(matchAccount('Trade Republic, Berlin', accounts)).toBe('tr')
    expect(matchAccount('Trading 212, London', accounts)).toBe('212')
    expect(matchAccount('To investment account', accounts, 'rev')).toBe('rev')
    expect(matchAccount('BPI', accounts)).toBe('bpi')
  })
  test('cannot tell → null, and he picks once', () => {
    expect(matchAccount('ARTEM CHERNII, PT50…0120', accounts)).toBeNull()
    expect(matchAccount(undefined, accounts)).toBeNull()
  })
})

describe('completePosition', () => {
  test("TR's list: value and % since buy → shares and what he paid, marked as worked out", () => {
    const msft = completePosition(
      { name: 'Microsoft', valueEur: 336.52, changePct: 34.07 },
      452.66,
    )
    expect(msft.sharesCalculated).toBe(true)
    expect(msft.priceCalculated).toBe(true)
    expect(msft.shares).toBeCloseTo(0.743427, 5)
    expect((msft.shares ?? 0) * (msft.priceEur ?? 0)).toBeCloseTo(251.0, 1)
  })
  test('printed numbers are kept as printed', () => {
    const p = completePosition(
      { name: 'X', shares: 2, priceEur: 100, valueEur: 300 },
      150,
    )
    expect(p).toEqual({
      shares: 2,
      priceEur: 100,
      sharesCalculated: false,
      priceCalculated: false,
    })
  })
  test('no price today → nothing is guessed', () => {
    expect(
      completePosition({ name: 'X', valueEur: 300, changePct: 5 }, undefined),
    ).toEqual({
      shares: undefined,
      priceEur: undefined,
      sharesCalculated: false,
      priceCalculated: false,
    })
  })
})

describe('share class and search', () => {
  const alphabet = [
    { symbol: 'GOOG', exchange: 'NASDAQ', type: 'EQUITY' },
    { symbol: 'GOOGL', exchange: 'NASDAQ', type: 'EQUITY' },
    { symbol: 'SGOOG=F', exchange: 'CME', type: 'FUTURE' },
  ]
  test('Alphabet (A) is GOOGL, though search lists GOOG first', () => {
    expect(alphabet[preferClass('Alphabet (A)', alphabet)].symbol).toBe('GOOGL')
  })
  test('a Toronto receipt and a future lose to the share', () => {
    const pltr = [
      { symbol: 'PLTR.TO', exchange: 'Toronto', type: 'ETF' },
      { symbol: 'PLTR', exchange: 'NASDAQ', type: 'EQUITY' },
    ]
    expect(pltr[preferClass('Palantir Technologies', pltr)].symbol).toBe('PLTR')
  })
  test('names a search can find', () => {
    expect(searchableName('Alphabet (A)')).toBe('Alphabet')
    expect(searchableName('Meta Platforms (A)')).toBe('Meta Platforms')
    expect(searchableName('Amazon.com')).toBe('Amazon')
  })
})

describe('parseReading', () => {
  test('a statement: signed rows, pending kept apart, the closing balance', () => {
    const r = parseReading(
      JSON.stringify({
        kind: 'transactions',
        institution: 'Revolut',
        holder_name: 'ARTEM',
        title: 'Revolut statement',
        currency: 'EUR',
        transactions: [
          {
            date: '2026-09-26',
            merchant: 'Cinemas NOS',
            raw: 'Nos Cinemas Odiv Pq',
            amount: -8.75,
            currency: 'EUR',
            pending: true,
            counterparty: null,
            self_transfer: false,
            category: 'fun',
          },
          {
            date: '2026-08-18',
            merchant: 'Trade Republic',
            raw: 'To: Trade Republic, Berlin',
            amount: -2424.96,
            currency: 'EUR',
            pending: false,
            counterparty: 'Trade Republic',
            self_transfer: true,
            category: null,
          },
          {
            date: 'nonsense',
            merchant: 'x',
            raw: 'x',
            amount: -1,
            currency: 'EUR',
            pending: false,
            counterparty: null,
            self_transfer: false,
            category: null,
          },
          {
            date: '2026-09-05',
            merchant: 'GANT',
            raw: 'Gant Store',
            amount: -108,
            currency: 'EUR',
            pending: false,
            counterparty: null,
            self_transfer: false,
            category: 'made up',
          },
        ],
        positions: [],
        closing_balance: 799.47,
        closing_balance_date: '2026-09-26',
        cash_eur: null,
        total_eur: null,
      }),
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.kind).toBe('transactions')
    expect(
      r.transactions.map((t) => [
        t.merchant,
        t.amount,
        t.pending,
        t.self,
        t.category,
      ]),
    ).toEqual([
      ['Cinemas NOS', -8.75, true, false, 'fun'],
      ['Trade Republic', -2424.96, false, true, undefined],
      ['GANT', -108, false, false, undefined],
    ])
    expect(r.balance).toEqual({ value: 799.47, asOf: dayToMs('2026-09-26') })
  })
  test('holdings: value and % since buy, no shares invented', () => {
    const r = parseReading(
      JSON.stringify({
        kind: 'holdings',
        institution: 'Trade Republic',
        holder_name: null,
        title: 'Trade Republic · holdings',
        currency: 'EUR',
        transactions: [],
        positions: [
          {
            name: 'Alphabet (A)',
            isin: null,
            shares: null,
            average_price_eur: null,
            value_eur: 375.7,
            change_pct: -0.62,
          },
        ],
        closing_balance: null,
        closing_balance_date: null,
        cash_eur: null,
        total_eur: null,
      }),
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.positions).toEqual([
      {
        name: 'Alphabet (A)',
        isin: undefined,
        shares: undefined,
        priceEur: undefined,
        valueEur: 375.7,
        changePct: -0.62,
      },
    ])
  })
  test('refuses what it cannot use', () => {
    expect(parseReading('nope').ok).toBe(false)
    expect(parseReading(JSON.stringify({ kind: 'unknown' })).ok).toBe(false)
    expect(
      parseReading(JSON.stringify({ kind: 'transactions', transactions: [] }))
        .ok,
    ).toBe(false)
  })
})

describe('readableFile', () => {
  test('PDF, screenshots, CSV — and nothing else', () => {
    expect(readableFile('application/pdf')?.block).toBe('document')
    expect(readableFile('image/png')?.block).toBe('image')
    expect(readableFile('', 'statement.csv')?.block).toBe('text')
    expect(readableFile('application/zip')).toBeNull()
  })
})

describe('diffHoldings', () => {
  const held = [
    { symbol: 'MSFT', shares: 3, putIn: 1200, priceEur: 410 },
    { symbol: 'GOOGL', shares: 5, putIn: 800, priceEur: 250 },
    { symbol: 'NVDA', shares: 10, putIn: 1000, priceEur: 150 },
  ]

  test('printed shares: the difference is the trade, at today’s price', () => {
    expect(
      diffHoldings(held, [
        {
          symbol: 'MSFT',
          shares: 5,
          sharesCalculated: false,
          priceEurToday: 400,
        },
      ])[0],
    ).toEqual({
      symbol: 'MSFT',
      change: 'more',
      side: 'buy',
      shares: 2,
      priceEur: 400,
      by: 'shares',
    })
  })

  test('TR: calculated shares drift with the price; what was paid does not', () => {
    const [same, more, less] = diffHoldings(held, [
      /* Price moved, nothing bought: shares "changed", paid did not. */
      {
        symbol: 'MSFT',
        shares: 3.07,
        sharesCalculated: true,
        paidEur: 1203,
        priceEurToday: 420,
      },
      /* €500 more paid at €250: two shares bought. */
      {
        symbol: 'GOOGL',
        shares: 7,
        sharesCalculated: true,
        paidEur: 1300,
        priceEurToday: 250,
      },
      /* €300 less paid at an average of €100: three shares sold. */
      {
        symbol: 'NVDA',
        shares: 7,
        sharesCalculated: true,
        paidEur: 700,
        priceEurToday: 160,
      },
    ])
    expect(same).toEqual({ symbol: 'MSFT', change: 'same' })
    expect(more).toMatchObject({
      change: 'more',
      side: 'buy',
      shares: 2,
      priceEur: 250,
      by: 'paid',
    })
    expect(less).toMatchObject({
      change: 'less',
      side: 'sell',
      shares: 3,
      priceEur: 160,
    })
  })

  test('a new position is a buy at what was paid; a missing one is offered as sold', () => {
    const changes = diffHoldings(held.slice(0, 1), [
      {
        symbol: 'MSFT',
        shares: 3,
        sharesCalculated: false,
        priceEurToday: 410,
      },
      {
        symbol: 'META',
        shares: 2,
        sharesCalculated: true,
        paidEur: 1000,
        priceEurToday: 600,
      },
    ])
    expect(changes).toEqual([
      { symbol: 'MSFT', change: 'same' },
      {
        symbol: 'META',
        change: 'new',
        side: 'buy',
        shares: 2,
        priceEur: 500,
        by: 'paid',
      },
    ])
    expect(diffHoldings(held.slice(1, 2), [])).toEqual([
      {
        symbol: 'GOOGL',
        change: 'gone',
        side: 'sell',
        shares: 5,
        priceEur: 250,
      },
    ])
  })
})
