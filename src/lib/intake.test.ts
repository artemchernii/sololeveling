import { describe, expect, test } from 'vitest'

import {
  brokerName,
  sameCompany,
  hasTradeRows,
  splitStatement,
  tradeInRow,
  partialReading,
  readingCost,
  usd,
  completePosition,
  dayToMs,
  findDuplicates,
  findRecurring,
  intakePrompt,
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

describe('a reading in progress', () => {
  const full = JSON.stringify({
    kind: 'transactions',
    institution: 'Revolut Bank UAB',
    account_tail: 'LT12 …4055',
    holder_name: null,
    title: 'Revolut statement · EUR · Aug 1 → Sep 27',
    currency: 'EUR',
    transactions: [
      {
        date: '2026-09-01',
        merchant: 'Bolt',
        raw: 'Bolt.euo1',
        amount: -6.7,
        currency: 'EUR',
        pending: false,
        counterparty: null,
        self_transfer: false,
        category: 'transport',
      },
      {
        date: '2026-09-03',
        merchant: 'To "TR"',
        raw: 'To TR',
        amount: -200,
        currency: 'EUR',
        pending: false,
        counterparty: 'Trade Republic',
        self_transfer: true,
        category: null,
      },
    ],
    positions: [],
    trades: [],
    closing_balance: 799.47,
    closing_balance_date: '2026-09-27',
    cash_eur: null,
    total_eur: null,
  })

  test('the bank, the title and whole rows only, as the text arrives', () => {
    const cut = full.slice(0, full.indexOf('To \\"TR\\"'))
    const p = partialReading(cut)
    expect(p.kind).toBe('transactions')
    expect(p.institution).toBe('Revolut Bank UAB')
    expect(p.accountTail).toBe('4055')
    expect(p.title).toBe('Revolut statement · EUR · Aug 1 → Sep 27')
    expect(p.transactions.map((t) => t.merchant)).toEqual(['Bolt'])
    expect(p.balance).toBeUndefined()
  })

  test('everything once it is all there, quotes inside strings included', () => {
    const p = partialReading(full)
    expect(p.transactions.map((t) => t.merchant)).toEqual(['Bolt', 'To "TR"'])
    expect(p.balance?.value).toBe(799.47)
  })

  test('nothing yet is nothing', () => {
    expect(partialReading('').transactions).toEqual([])
    expect(partialReading('{"kind": "tra').kind).toBeUndefined()
  })
})

describe('what a reading costs', () => {
  test('his failed CSV: ~65k in, 32k out ≈ $0.23', () => {
    expect(
      readingCost({ input_tokens: 65_000, output_tokens: 32_000 }),
    ).toBeCloseTo(0.225, 3)
    expect(usd(0.225)).toBe('$0.23')
    expect(usd(0.0031)).toBe('$0.003')
    expect(usd(0.0004)).toBe('under $0.001')
    expect(usd(0)).toBe('$0')
  })
})

describe('intakePrompt', () => {
  const base = { files: 1, today: '2026-09-27', accounts: ['Revolut'] }

  test('without a hint it opens on the file', () => {
    expect(intakePrompt(base).startsWith('This is one file')).toBe(true)
  })

  test('his words lead, and cannot close the quote', () => {
    const p = intakePrompt({ ...base, hint: 'Trade Republic "portfolio"' })
    expect(p.split('\n')[0]).toBe(
      'The person says what it is: "Trade Republic \'portfolio\'". Trust it for what the file is and whose it is (institution, kind); it never gives you numbers.',
    )
  })
})

describe('a broker statement’s trades', () => {
  const row = (raw: string, amount: number) => ({
    occurredAt: 1,
    merchant: raw.slice(0, 20),
    raw,
    amount,
    currency: 'EUR',
    pending: false,
    self: true,
  })

  test('reads a buy: shares, ISIN, and the price per share it cost', () => {
    expect(
      tradeInRow(
        row(
          'Buy trade US67066G1040 NVIDIA CORP. DL-,001, quantity: 0.186115',
          -21,
        ),
      ),
    ).toEqual({
      occurredAt: 1,
      name: 'NVIDIA CORP. DL-,001',
      isin: 'US67066G1040',
      side: 'buy',
      shares: 0.186115,
      price: 112.833463,
      currency: 'EUR',
    })
  })

  test('reads a sell, and a whole-share quantity', () => {
    expect(
      tradeInRow(
        row(
          'Sell trade IE00BD8PGZ49 iShares IV plc - iShares $ Treasury Bond 20+yr UCITS ETF EUR Hedged (Dist), quantity: 16',
          44.95,
        ),
      ),
    ).toMatchObject({ side: 'sell', shares: 16, isin: 'IE00BD8PGZ49' })
  })

  test('a savings plan is a buy', () => {
    expect(
      tradeInRow(
        row(
          'Savings plan execution IE00B4L5Y983 iShares Core MSCI World, quantity: 0.5',
          -50,
        ),
      ),
    ).toMatchObject({ side: 'buy', shares: 0.5, price: 100 })
  })

  test('anything else is not a trade', () => {
    expect(tradeInRow(row('Apple Pay Top up', 25))).toBeNull()
    expect(
      tradeInRow(row('Cash Dividend for ISIN IE00BD8PGZ49', 0.92)),
    ).toBeNull()
  })

  test('splits trades out, and a dividend becomes money in', () => {
    const { transactions, trades } = splitStatement([
      row(
        'Buy trade US0231351067 AMAZON.COM INC. DL-,01, quantity: 0.140386',
        -26,
      ),
      row('Cash Dividend for ISIN IE00BD8PGZ49', 0.92),
      row('Apple Pay Top up', 25),
    ])
    expect(trades).toHaveLength(1)
    expect(transactions.map((t) => [t.raw, t.self])).toEqual([
      ['Cash Dividend for ISIN IE00BD8PGZ49', false],
      ['Apple Pay Top up', true],
    ])
    expect(hasTradeRows([row('Apple Pay Top up', 25)])).toBe(false)
  })
})

describe('a broker’s own spelling', () => {
  test('brokerName drops the par value and says the class', () => {
    expect(brokerName('ALPHABET INC.CL.A DL-,001')).toBe(
      'ALPHABET INC. (Class A)',
    )
    expect(brokerName('NVIDIA CORP. DL-,001')).toBe('NVIDIA CORP.')
    expect(brokerName('ASML HOLDING EO -,09')).toBe('ASML HOLDING')
    expect(brokerName('TAIWAN SEMICON.MANU.ADR/5')).toBe('TAIWAN SEMICON.MANU.')
    expect(brokerName('META PLATF. A DL-,000006')).toBe('META PLATF. (Class A)')
  })

  const held = [
    { symbol: 'GOOG', name: 'Alphabet Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'META', name: 'Meta Platforms, Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', isin: 'US67066G1040' },
    { symbol: 'UBER', name: 'Uber Technologies, Inc.' },
  ]

  test('sameCompany finds what the account already holds', () => {
    expect(sameCompany({ name: 'ALPHABET INC.CL.A DL-,001' }, held)).toBe(1)
    expect(sameCompany({ name: 'META PLATF. A DL-,000006' }, held)).toBe(2)
    expect(sameCompany({ name: 'NVIDIA', isin: 'US67066G1040' }, held)).toBe(3)
    expect(sameCompany({ name: 'UBER TECH. DL-,00001' }, held)).toBe(4)
    expect(sameCompany({ name: 'APPLE INC.' }, held)).toBe(-1)
  })
})
