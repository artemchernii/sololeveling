import { describe, expect, test } from 'vitest'

import {
  brokerName,
  ownMoney,
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
  INTAKE_SCHEMA,
  MAX_NULLABLE_FIELDS,
  parseReading,
  printedAmount,
  storedDuplicates,
  fitByPrice,
  settleFrozen,
  preferClass,
  readableFile,
  searchableName,
} from './intake'
import { LAYOUT_SCHEMA } from './csvLayout'
import { READING_SCHEMA } from './reading'

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
  test("212's SHLD is iShares Digital Security, not the US defence ETF", () => {
    // 21.868 shares printed at €284.01: €12.99 a share.
    const printed = 284.01 / 21.86787796
    const bySymbol = [{ symbol: 'SHLD' }, { symbol: 'SHLD.TO' }]
    expect(fitByPrice(printed, bySymbol, [53.66, 40.1], 'SHLD')).toBe(-1)
    const byName = [{ symbol: 'LOCK.L' }, { symbol: 'SHLD.L' }]
    expect(fitByPrice(printed, byName, [11.88, 13.02], 'SHLD')).toBe(1)
  })
  test('frozen only when the market answered for the rest of the screen', () => {
    const lukoy = {
      symbol: 'LUKOY',
      name: 'LUKOIL',
      exchange: 'Trading 212',
      type: 'UNPRICED',
    }
    const igln = { symbol: 'IGLN.L', name: 'Gold', exchange: 'L', type: 'ETF' }
    const screen = () => [
      { candidates: [igln], preferred: 0, todayPriceEur: 71.4 },
      { candidates: [] as Array<typeof igln>, preferred: -1 },
    ]
    const live = screen()
    settleFrozen(live, [{ at: 1, candidate: lukoy, priceEur: 6.27 }], 1)
    expect(live[1]).toMatchObject({
      candidates: [lukoy],
      preferred: 0,
      todayPriceEur: 6.27,
    })
    // Yahoo down: nothing priced, so nothing is frozen — it is asked.
    const down = screen().map((p) => ({ ...p, todayPriceEur: undefined }))
    settleFrozen(down, [{ at: 1, candidate: lukoy, priceEur: 6.27 }], 1)
    expect(down[1]).toMatchObject({ candidates: [], preferred: -1 })
  })
  test('without a printed ticker the closest price wins; none, -1', () => {
    const list = [{ symbol: 'A' }, { symbol: 'B' }, { symbol: 'C' }]
    expect(fitByPrice(100, list, [110, 97, undefined])).toBe(1)
    expect(fitByPrice(100, list, [undefined, 300, 0])).toBe(-1)
  })
  test('names a search can find', () => {
    expect(searchableName('Alphabet (A)')).toBe('Alphabet')
    expect(searchableName('Meta Platforms (A)')).toBe('Meta Platforms')
    expect(searchableName('Amazon.com')).toBe('Amazon')
  })
})

test.each([
  ['intake', INTAKE_SCHEMA],
  ['CSV layout', LAYOUT_SCHEMA],
  ['reading', READING_SCHEMA],
])(
  "the %s schema stays inside the API's limit on nullable fields",
  (_, schema) => {
    let n = 0
    const walk = (x: unknown) => {
      if (Array.isArray(x)) return x.forEach(walk)
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        if (Array.isArray(o.type) && o.type.includes('null')) n++
        Object.values(o).forEach(walk)
      }
    }
    walk(schema)
    expect(n).toBeLessThanOrEqual(MAX_NULLABLE_FIELDS)
  },
)

test('printedAmount: what a bank prints, whatever the grouping (3 Oct)', () => {
  expect(printedAmount('1 100.00')).toBe(1100)
  expect(printedAmount('1.100,00')).toBe(1100)
  expect(printedAmount('1,100.00')).toBe(1100)
  expect(printedAmount('-1.205,20')).toBe(1205.2)
  expect(printedAmount('€ 1 277,35')).toBe(1277.35)
  expect(printedAmount('1 100')).toBe(1100)
  expect(printedAmount('1.100')).toBe(1100)
  expect(printedAmount('12,5')).toBe(12.5)
  expect(printedAmount('100.00')).toBe(100)
  expect(printedAmount('—')).toBeUndefined()
})

test("BPI's screens (3 Oct): 'P/ <IBAN> ARTEM CHERNII' is to him; 'P/O' by him", () => {
  const names = ['ARTEM CHERNII']
  expect(
    ownMoney(
      {
        amount: -1100,
        merchant: 'SEPA Transfer',
        raw: 'TRF SEPA+ INST 20 P/ PT50002300004547874109 8894 ARTEM CHERNII',
        counterparty: 'PT50002300004547874109',
      },
      names,
    ),
  ).toBe(true)
  expect(
    ownMoney(
      { amount: 1000, merchant: 'Transfer', raw: 'TRF. P/O ARTEM CHERNII' },
      names,
    ),
  ).toBe(true)
  /* A payment to someone else with his name elsewhere is not his. */
  expect(
    ownMoney(
      {
        amount: -50,
        merchant: 'MB WAY',
        raw: 'TRF MB WAY P/ OLEKSANDR SAKHNO',
      },
      names,
    ),
  ).toBe(false)
})

test("the same row named twice is one row, by the bank's own line (3 Oct)", () => {
  const day = new Date(2026, 8, 1, 12).getTime()
  expect(
    findDuplicates(
      [
        {
          occurredAt: day,
          amount: -24.95,
          merchant: 'Insurance',
          raw: 'SEGURO ALLIANZ - MULTI-RISCOS-HABITACAO',
        },
        { occurredAt: day, amount: -24.95, merchant: 'Gym', raw: 'SOLINCA' },
      ],
      [
        {
          occurredAt: day,
          amount: -24.95,
          merchant: 'Seguro Allianz',
          raw: 'SEGURO ALLIANZ MULTI-RISCOS',
        },
      ],
    ),
  ).toEqual([0, null])
})

test('storedDuplicates: his ActivoBank rows written twice, the later goes (3 Oct)', () => {
  const d = (m: number, day: number) => new Date(2026, m - 1, day, 13).getTime()
  const rows = [
    {
      id: 'a',
      written: 1,
      occurredAt: d(9, 1),
      amount: -121.47,
      merchant: 'PayPal Europe',
      raw: 'PayPal Europe',
    },
    {
      id: 'b',
      written: 2,
      occurredAt: d(9, 1),
      amount: -121.47,
      merchant: 'DD PAYPAL EUROPE 5D4J2254EVNWL',
      raw: 'DD PAYPAL EUROPE 5D4J2254EVNWL LU96',
    },
    {
      id: 'c',
      written: 1,
      occurredAt: d(9, 9),
      amount: -57.47,
      merchant: 'COMPRA 2789 EST SERVICO VEIGA E SEABRA SA',
      raw: 'COMPRA 2789 EST SERVICO VEIGA E SEABRA SA CAS',
    },
    {
      id: 'd',
      written: 2,
      occurredAt: d(9, 14),
      amount: -57.47,
      merchant: 'Est Servico Veiga e Seabra SA',
      raw: 'Est Servico Veiga e Seabra SA',
    },
    /* Two real coffees of the same price, a day apart, stay. */
    {
      id: 'e',
      written: 1,
      occurredAt: d(9, 15),
      amount: -6.7,
      merchant: 'Bnp Toc',
      raw: 'Bnp Toc',
    },
    {
      id: 'f',
      written: 1,
      occurredAt: d(9, 16),
      amount: -6.7,
      merchant: 'Cinema',
      raw: 'Cinemas NOS',
    },
  ]
  expect(storedDuplicates(rows)).toEqual(['b', 'd'])
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
  test("Trading 212's screens (3 Oct): shares and ticker under the name; a summary with no positions", () => {
    const base = {
      kind: 'holdings',
      institution: null,
      holder_name: null,
      title: 'Invest',
      currency: 'EUR',
      transactions: [],
      closing_balance: null,
      closing_balance_date: null,
    }
    const list = parseReading(
      JSON.stringify({
        ...base,
        positions: [
          {
            name: 'iShares Physical Gold',
            isin: null,
            symbol: 'IGLN',
            shares: 7.36542714,
            average_price_eur: null,
            value_eur: 526.21,
            change_pct: -4.01,
          },
        ],
        cash_eur: null,
        total_eur: null,
      }),
    )
    if (!list.ok) throw new Error(list.error)
    expect(list.positions[0]).toMatchObject({
      symbol: 'IGLN',
      shares: 7.36542714,
    })
    const summary = parseReading(
      JSON.stringify({
        ...base,
        positions: [],
        cash_eur: 12994.22,
        total_eur: 15008.26,
      }),
    )
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.positions).toEqual([])
    expect(
      parseReading(
        JSON.stringify({
          ...base,
          positions: [],
          cash_eur: null,
          total_eur: null,
        }),
      ).ok,
    ).toBe(false)
  })
  test("the printed amount wins over the model's number; its sign stays", () => {
    const r = parseReading(
      JSON.stringify({
        kind: 'transactions',
        institution: 'ActivoBank',
        account_tail: null,
        holder_name: 'ARTEM CHERNII',
        title: 'ActivoBank · Sep',
        currency: 'EUR',
        transactions: [
          {
            date: '2026-09-01',
            merchant: 'ARTEM CHERNII',
            raw: 'TRF. P/O ARTEM CHERNII',
            amount: 100,
            amount_text: '1 100.00',
            currency: 'EUR',
            pending: false,
            counterparty: 'ARTEM CHERNII',
            self_transfer: true,
            category: null,
          },
          {
            date: '2026-09-03',
            merchant: 'Revolut',
            raw: 'COMPRA 2789 Revolut',
            amount: -1000,
            amount_text: '1 000.00',
            currency: 'EUR',
            pending: false,
            counterparty: null,
            self_transfer: true,
            category: null,
          },
        ],
        positions: [],
        trades: [],
        closing_balance: 435.66,
        closing_balance_date: '2026-09-30',
        cash_eur: null,
        total_eur: null,
      }),
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.transactions.map((x) => x.amount)).toEqual([1100, -1000])
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

describe('his own money', () => {
  const me = ['Artem Chernii']
  const row = (amount: number, merchant: string, raw?: string) => ({
    amount,
    merchant,
    raw,
  })

  test('a transfer from his own name is his money (ActivoBank, 1 Oct)', () => {
    expect(ownMoney(row(400, 'TRF. P/O ARTEM CHERNII'), me)).toBe(true)
    expect(
      ownMoney(
        row(4400, 'Payment from ARTEM CHERNII', 'From: ARTEM CHERNII'),
        me,
      ),
    ).toBe(true)
  })

  test('a name counts only whole', () => {
    expect(ownMoney(row(50, 'TRF. P/O ARTEM SILVA'), me)).toBe(false)
    expect(ownMoney(row(50, 'TRF. P/O ARTEM CHERNII'), ['Artem'])).toBe(false)
    expect(ownMoney(row(50, 'CHERNII ARTEM'), me)).toBe(true)
  })

  test('going out, the sender printed on the line is not where it went', () => {
    expect(
      ownMoney(row(-30, 'Pingo Doce', 'Pingo Doce From: ARTEM CHERNII'), me),
    ).toBe(false)
    expect(ownMoney(row(-300, 'To ARTEM CHERNII'), me)).toBe(true)
  })

  test('an ATM withdrawal, either side of it', () => {
    expect(ownMoney(row(20, 'withdraw'), [])).toBe(true)
    expect(ownMoney(row(-60, 'LEVANTAMENTO MB'), [])).toBe(true)
  })

  test('a top-up arriving is his card; a phone top-up going out is spending', () => {
    expect(ownMoney(row(500, 'Apple Pay Top up'), [])).toBe(true)
    expect(ownMoney(row(1000, 'Top-up by *2789'), [])).toBe(true)
    expect(ownMoney(row(-10, 'Vodafone carregamento'), [])).toBe(false)
  })

  test('a salary printing him as its receiver stays income', () => {
    expect(
      ownMoney(
        row(1800, 'ACME LDA', 'SALARIO SET ACME LDA To: ARTEM CHERNII'),
        me,
      ),
    ).toBe(false)
  })

  test('income stays income', () => {
    expect(ownMoney(row(139.5, 'PAYPAL EUROPE S.A.R.L.'), me)).toBe(false)
    expect(ownMoney(row(0.14, 'Cash Dividend US02079K3059'), me)).toBe(false)
  })
})

describe('a crypto statement read (4 Oct)', () => {
  test('keeps staking rewards at price 0, the fee and the coin flag', () => {
    const r = parseReading(
      JSON.stringify({
        kind: 'trades',
        title: 'Crypto Account Statement',
        institution: 'Revolut Digital Assets Europe',
        account_tail: null,
        holder_name: null,
        currency: 'EUR',
        transactions: [],
        positions: [
          {
            name: 'ADA',
            isin: null,
            symbol: 'ADA',
            shares: 398.26,
            average_price_eur: null,
            value_eur: 86.99,
            change_pct: null,
          },
        ],
        trades: [
          {
            date: '2026-02-05',
            name: 'ADA',
            isin: null,
            side: 'buy',
            shares: 400.39,
            price: 0.25,
            currency: 'USD',
            fee: 1.75,
            crypto: true,
          },
          {
            date: '2026-02-24',
            name: 'ADA',
            isin: null,
            side: 'reward',
            shares: 0.114553,
            price: 0,
            currency: 'EUR',
            fee: null,
            crypto: true,
          },
        ],
        closing_balance: 569.07,
        closing_balance_date: '2026-10-03',
        cash_eur: null,
        total_eur: null,
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.trades.map((t) => [t.side, t.price, t.fee, t.crypto])).toEqual([
      ['buy', 0.25, 1.75, true],
      ['reward', 0, undefined, true],
    ])
    expect(r.positions.map((p) => [p.name, p.shares])).toEqual([
      ['ADA', 398.26],
    ])
  })
})
