/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* Finances F2–F4: balances, bills, investments. Fake timers so a new
   ticker's scheduled price reading never reaches the network. */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 8, 26, 12) })
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

function stored(t: ReturnType<typeof setup>['t'], storageId: Id<'_storage'>) {
  return t.run(async (ctx) => (await ctx.db.system.get(storageId)) !== null)
}

const TODAY = new Date(2026, 8, 26).getTime()
const TSLA = {
  symbol: 'TSLA',
  name: 'Tesla, Inc.',
  exchange: 'NASDAQ',
  type: 'EQUITY',
}
const VWCE = {
  symbol: 'VWCE.DE',
  name: 'Vanguard FTSE All-World',
  exchange: 'XETRA',
  type: 'ETF',
}

describe('balances', () => {
  test('latest reading per account, a total in euros, and its oldest as-of', async () => {
    const { me } = setup()
    const revolut = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
    })

    await me.mutation(api.accounts.setBalance, {
      accountId: tr,
      currency: 'EUR',
      value: 5000,
      dayStart: TODAY,
    })
    vi.advanceTimersByTime(60_000)
    await me.mutation(api.accounts.setBalance, {
      accountId: revolut,
      currency: 'EUR',
      value: 30000,
      dayStart: TODAY,
    })

    const b = await me.query(api.aggregate.balances, {})
    expect(b.accounts.map((a) => [a.name, a.pockets[0].value])).toEqual([
      ['Revolut', 30000],
      ['TR', 5000],
      ['BPI', null],
    ])
    expect(b.total).toBe(35000)
    expect(b.unread).toBe(1)
    expect(b.oldestAt).toBe(b.accounts[1].pockets[0].recordedAt)
  })

  test('a second reading the same day replaces it; another day adds history', async () => {
    const { me } = setup()
    const a = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      currency: 'EUR',
      value: 100,
      dayStart: TODAY,
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      currency: 'EUR',
      value: 120,
      dayStart: TODAY,
    })
    const tomorrow = TODAY + 86_400_000
    vi.setSystemTime(tomorrow + 3_600_000)
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      currency: 'EUR',
      value: 150,
      dayStart: tomorrow,
    })
    const line = await me.query(api.aggregate.stateHistory, {
      key: `balance:${a}:EUR`,
      start: 0,
      end: Date.now() + 1,
    })
    expect(line.rows.map((r) => r.value)).toEqual([120, 150])
  })

  test('a retired account leaves the total', async () => {
    const { me } = setup()
    const a = await me.mutation(api.accounts.create, {
      name: 'Old',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      currency: 'EUR',
      value: 10,
      dayStart: TODAY,
    })
    await me.mutation(api.accounts.remove, { accountId: a })
    expect((await me.query(api.aggregate.balances, {})).total).toBe(0)
  })

  test("another owner's account is neither listed nor writable", async () => {
    const { me, them } = setup()
    const theirs = await them.mutation(api.accounts.create, {
      name: 'Theirs',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await them.mutation(api.accounts.setBalance, {
      accountId: theirs,
      currency: 'EUR',
      value: 9,
      dayStart: TODAY,
    })
    expect((await me.query(api.aggregate.balances, {})).accounts).toEqual([])
    await expect(
      me.mutation(api.accounts.setBalance, {
        accountId: theirs,
        currency: 'EUR',
        value: 1,
        dayStart: TODAY,
      }),
    ).rejects.toThrow('No such account')
  })

  test('a duplicate name is refused', async () => {
    const { me } = setup()
    await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await expect(
      me.mutation(api.accounts.create, {
        name: 'revolut',
        kinds: ['bank'],
        currencies: ['EUR'],
      }),
    ).rejects.toThrow('already')
  })
})

describe('bills', () => {
  const SEP = {
    year: 2026,
    month: 8,
    start: new Date(2026, 8, 1).getTime(),
    end: new Date(2026, 9, 1).getTime(),
  }

  test('each on its day; paid is a log he tapped, and removing it makes it due again', async () => {
    const { me } = setup()
    const mortgage = await me.mutation(api.recurring.create, {
      name: 'Mortgage',
      kind: 'expense',
      amount: 750,
      category: 'home',
      cadence: 'monthly',
      day: 0,
    })
    await me.mutation(api.recurring.create, {
      name: 'Salary',
      kind: 'income',
      amount: 3000,
      category: 'salary',
      cadence: 'monthly',
      day: 28,
    })
    await me.mutation(api.recurring.create, {
      name: 'Insurance',
      kind: 'expense',
      amount: 200,
      cadence: 'yearly',
      day: 12,
      month: 2,
    })

    let month = await me.query(api.recurring.month, SEP)
    expect(month.map((m) => [m.item.name, m.day, m.paid])).toEqual([
      ['Salary', 28, null],
      ['Mortgage', 30, null],
    ])

    const logId = await me.mutation(api.recurring.markPaid, {
      id: mortgage,
      occurredAt: Date.now(),
    })
    month = await me.query(api.recurring.month, SEP)
    expect(month[1].paid?.value).toBe(750)

    const sums = await me.query(api.aggregate.moneySums, {
      start: SEP.start,
      end: SEP.end,
    })
    expect(sums.out).toEqual({ sum: 750, count: 1 })
    expect(sums.buckets[0].category).toBe('home')

    await me.mutation(api.logs.remove, { logId })
    month = await me.query(api.recurring.month, SEP)
    expect(month[1].paid).toBeNull()
  })

  test('remove: only a bill never paid', async () => {
    const { me } = setup()
    const trial = await me.mutation(api.recurring.create, {
      name: 'Trial',
      kind: 'expense',
      amount: 5,
      cadence: 'monthly',
      day: 3,
    })
    await me.mutation(api.recurring.remove, { id: trial })
    expect(await me.query(api.recurring.month, SEP)).toEqual([])
    const gym = await me.mutation(api.recurring.create, {
      name: 'Gym',
      kind: 'expense',
      amount: 30,
      cadence: 'monthly',
      day: 1,
    })
    await me.mutation(api.recurring.markPaid, {
      id: gym,
      occurredAt: Date.now(),
    })
    await expect(
      me.mutation(api.recurring.remove, { id: gym }),
    ).rejects.toThrow('end it')
  })

  test('nothing is logged until he taps', async () => {
    const { me } = setup()
    await me.mutation(api.recurring.create, {
      name: 'Netflix',
      kind: 'expense',
      amount: 13.99,
      cadence: 'monthly',
      day: 1,
    })
    const sums = await me.query(api.aggregate.moneySums, {
      start: SEP.start,
      end: SEP.end,
    })
    expect(sums.out.count).toBe(0)
  })

  test('a paid amount can differ from the plan', async () => {
    const { me } = setup()
    const id = await me.mutation(api.recurring.create, {
      name: 'Electricity',
      kind: 'expense',
      amount: 60,
      cadence: 'monthly',
      day: 15,
    })
    await me.mutation(api.recurring.markPaid, {
      id,
      occurredAt: Date.now(),
      amount: 71.3,
    })
    const month = await me.query(api.recurring.month, SEP)
    expect(month[0].paid?.value).toBe(71.3)
  })

  test("refuses a bad day, a future payment, another owner's bill", async () => {
    const { me, them } = setup()
    await expect(
      me.mutation(api.recurring.create, {
        name: 'X',
        kind: 'expense',
        amount: 1,
        cadence: 'monthly',
        day: 40,
      }),
    ).rejects.toThrow('1 to 31')
    const mine = await me.mutation(api.recurring.create, {
      name: 'Gym',
      kind: 'expense',
      amount: 30,
      cadence: 'monthly',
      day: 1,
    })
    await expect(
      me.mutation(api.recurring.markPaid, {
        id: mine,
        occurredAt: Date.now() + 86_400_000,
      }),
    ).rejects.toThrow('happened')
    await expect(
      them.mutation(api.recurring.markPaid, {
        id: mine,
        occurredAt: Date.now(),
      }),
    ).rejects.toThrow('No such bill')
    expect(await them.query(api.recurring.month, SEP)).toEqual([])
  })
})

describe('investments', () => {
  async function withPrices(t: ReturnType<typeof setup>['t'], ownerId: string) {
    const [tsla] = await t.run(async (ctx) =>
      ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', 'TSLA'),
        )
        .collect(),
    )
    await t.mutation(internal.market.storePrices, {
      ownerId,
      instrumentId: tsla._id,
      currency: 'USD',
      rows: [{ asOf: Date.now() - 3_600_000, price: 400 }],
      fetchedAt: Date.now(),
    })
    await t.mutation(internal.market.storeRate, {
      ownerIds: [ownerId],
      currency: 'USD',
      rate: 0.9,
      asOf: Date.now() - 86_400_000,
      fetchedAt: Date.now(),
    })
  }

  test('a position is the sum of its trades, valued at the stored price and rate', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const base = { accountId: tr, candidate: TSLA, occurredAt: Date.now() }
    await me.mutation(api.invest.addTrade, {
      ...base,
      side: 'buy',
      shares: 2,
      priceEur: 300,
    })
    await me.mutation(api.invest.addTrade, {
      ...base,
      side: 'buy',
      shares: 1,
      priceEur: 330,
    })
    await me.mutation(api.invest.addTrade, {
      ...base,
      side: 'sell',
      shares: 0.5,
      priceEur: 350,
    })

    let p = await me.query(api.aggregate.positions, {})
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0].shares).toBe(2.5)
    expect(p.rows[0].putIn).toBe(755)
    expect(p.rows[0].valueEur).toBeNull()
    expect(p.totalEur).toBe(0)
    expect(p.unvalued).toBe(1)

    await withPrices(t, ME)
    p = await me.query(api.aggregate.positions, {})
    expect(p.rows[0].valueEur).toBe(900)
    expect(p.totalEur).toBe(900)
    expect(p.unvalued).toBe(0)
    expect(p.rows[0].priceAsOf).not.toBeNull()
    expect(p.rows[0].rateAsOf).not.toBeNull()
  })

  test('a euro ETF needs no rate', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await me.mutation(api.invest.addTrade, {
      accountId: tr,
      candidate: VWCE,
      side: 'buy',
      shares: 10,
      priceEur: 120,
      occurredAt: Date.now(),
    })
    const [inst] = await t.run(async (ctx) =>
      ctx.db.query('instruments').collect(),
    )
    await t.mutation(internal.market.storePrices, {
      ownerId: ME,
      instrumentId: inst._id,
      currency: 'EUR',
      rows: [{ asOf: Date.now() - 1000, price: 169.74 }],
      fetchedAt: Date.now(),
    })
    const p = await me.query(api.aggregate.positions, {})
    expect(p.rows[0].valueEur).toBe(1697.4)
  })

  test('a sell cannot exceed what is held in that account', async () => {
    const { me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const t212 = await me.mutation(api.accounts.create, {
      name: '212',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await me.mutation(api.invest.addTrade, {
      accountId: tr,
      candidate: TSLA,
      side: 'buy',
      shares: 1,
      priceEur: 300,
      occurredAt: Date.now(),
    })
    await expect(
      me.mutation(api.invest.addTrade, {
        accountId: t212,
        candidate: TSLA,
        side: 'sell',
        shares: 1,
        priceEur: 300,
        occurredAt: Date.now(),
      }),
    ).rejects.toThrow('only 0 shares')
  })

  test('storing the same close twice adds one row; a later same-day price replaces it', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await me.mutation(api.invest.addTrade, {
      accountId: tr,
      candidate: VWCE,
      side: 'buy',
      shares: 1,
      priceEur: 1,
      occurredAt: Date.now(),
    })
    const [inst] = await t.run(async (ctx) =>
      ctx.db.query('instruments').collect(),
    )
    const at = Date.now() - 5 * 3_600_000
    const store = (rows: Array<{ asOf: number; price: number }>) =>
      t.mutation(internal.market.storePrices, {
        ownerId: ME,
        instrumentId: inst._id,
        currency: 'EUR',
        rows,
        fetchedAt: Date.now(),
      })
    await store([{ asOf: at, price: 100 }])
    await store([{ asOf: at, price: 100 }])
    await store([
      { asOf: at + 60_000, price: 101 },
      { asOf: at + 120_000, price: 102 },
    ])
    const rows = await t.run(async (ctx) => ctx.db.query('prices').collect())
    expect(rows.map((r) => r.price)).toEqual([102])
  })

  test("another owner's trades and positions are never read", async () => {
    const { me, them } = setup()
    const theirs = await them.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const tradeId = await them.mutation(api.invest.addTrade, {
      accountId: theirs,
      candidate: TSLA,
      side: 'buy',
      shares: 1,
      priceEur: 1,
      occurredAt: Date.now(),
    })
    expect((await me.query(api.aggregate.positions, {})).rows).toEqual([])
    await expect(
      me.mutation(api.invest.removeTrade, { tradeId }),
    ).rejects.toThrow('No such trade')
    await expect(
      me.mutation(api.invest.addTrade, {
        accountId: theirs,
        candidate: TSLA,
        side: 'buy',
        shares: 1,
        priceEur: 1,
        occurredAt: Date.now(),
      }),
    ).rejects.toThrow('No such account')
  })
})

describe('worth: free cash and investments, apart', () => {
  test('one account can hold both, and nothing is counted twice', async () => {
    const { t, me } = setup()
    const revolut = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: revolut,
      currency: 'EUR',
      value: 2000,
      dayStart: TODAY,
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: tr,
      currency: 'EUR',
      value: 150,
      dayStart: TODAY,
    })
    await me.mutation(api.invest.addTrade, {
      accountId: revolut,
      candidate: VWCE,
      side: 'buy',
      shares: 10,
      priceEur: 120,
      occurredAt: Date.now(),
    })
    const [inst] = await t.run(async (ctx) =>
      ctx.db.query('instruments').collect(),
    )
    await t.mutation(internal.market.storePrices, {
      ownerId: ME,
      instrumentId: inst._id,
      currency: 'EUR',
      rows: [{ asOf: Date.now() - 1000, price: 170 }],
      fetchedAt: Date.now(),
    })

    const w = await me.query(api.aggregate.worth, {})
    expect(w.cash.total).toBe(2150)
    expect(w.invested.total).toBe(1700)
    expect(w.total).toBe(3850)
    expect(w.byAccount).toEqual([
      { accountId: revolut, cash: 2000, invested: 1700, positions: 1 },
      { accountId: tr, cash: 150, invested: null, positions: 0 },
    ])
  })

  test("another owner's money is in neither half", async () => {
    const { me, them } = setup()
    const theirs = await them.mutation(api.accounts.create, {
      name: 'X',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await them.mutation(api.accounts.setBalance, {
      accountId: theirs,
      currency: 'EUR',
      value: 9,
      dayStart: TODAY,
    })
    const w = await me.query(api.aggregate.worth, {})
    expect([w.total, w.byAccount.length]).toEqual([0, 0])
  })
})

describe('accounts: kinds, currencies, delete', () => {
  test('Revolut is a bank and a broker, with a USD pocket shown in euros', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank', 'broker'],
      currencies: ['EUR', 'usd'],
      domain: 'https://www.revolut.com/',
    })
    const [row] = await me.query(api.accounts.list, {})
    expect([row.kinds, row.currencies, row.domain]).toEqual([
      ['bank', 'broker'],
      ['EUR', 'USD'],
      'revolut.com',
    ])
    await me.mutation(api.accounts.setBalance, {
      accountId: rev,
      currency: 'EUR',
      value: 799.47,
      dayStart: TODAY,
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: rev,
      currency: 'USD',
      value: 1200,
      dayStart: TODAY,
    })
    let b = await me.query(api.aggregate.balances, {})
    /* No USD rate stored yet: the pocket is shown as read, not guessed. */
    expect(b.total).toBe(799.47)
    expect(b.unread).toBe(1)
    await t.mutation(internal.market.storeRate, {
      ownerIds: [ME],
      currency: 'USD',
      rate: 0.87696,
      asOf: Date.now() - 3_600_000,
      fetchedAt: Date.now(),
    })
    b = await me.query(api.aggregate.balances, {})
    expect(
      b.accounts[0].pockets.map((p) => [p.currency, p.value, p.eur]),
    ).toEqual([
      ['EUR', 799.47, 799.47],
      ['USD', 1200, 1052.35],
    ])
    expect(b.total).toBe(1851.82)
  })

  test('a currency with no daily rate, or no kind at all, is refused', async () => {
    const { me } = setup()
    await expect(
      me.mutation(api.accounts.create, {
        name: 'X',
        kinds: ['bank'],
        currencies: ['UAH'],
      }),
    ).rejects.toThrow('no daily euro rate')
    await expect(
      me.mutation(api.accounts.create, {
        name: 'X',
        kinds: [],
        currencies: ['EUR'],
      }),
    ).rejects.toThrow('a bank, a broker, or cash')
  })

  test('a balance in a currency the account does not hold is refused', async () => {
    const { me } = setup()
    const a = await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await expect(
      me.mutation(api.accounts.setBalance, {
        accountId: a,
        currency: 'USD',
        value: 1,
        dayStart: TODAY,
      }),
    ).rejects.toThrow('does not hold USD')
  })

  test('delete: gone for good when nothing hangs off it, retired when something does', async () => {
    const { me } = setup()
    const typo = await me.mutation(api.accounts.create, {
      name: 'Revoult',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    expect(await me.mutation(api.accounts.remove, { accountId: typo })).toBe(
      'deleted',
    )
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await me.mutation(api.invest.addTrade, {
      accountId: tr,
      candidate: TSLA,
      side: 'buy',
      shares: 1,
      priceEur: 1,
      occurredAt: Date.now(),
    })
    expect(await me.mutation(api.accounts.remove, { accountId: tr })).toBe(
      'retired',
    )
    expect(await me.query(api.accounts.list, {})).toEqual([])
  })

  test('update: rename, add a currency, not onto another account’s name', async () => {
    const { me } = setup()
    const a = await me.mutation(api.accounts.create, {
      name: 'Rev',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await me.mutation(api.accounts.update, {
      accountId: a,
      name: 'Revolut',
      kinds: ['bank', 'broker'],
      currencies: ['EUR', 'USD'],
    })
    expect((await me.query(api.accounts.list, {}))[0].name).toBe('Revolut')
    await expect(
      me.mutation(api.accounts.update, {
        accountId: a,
        name: 'bpi',
        kinds: ['bank'],
        currencies: ['EUR'],
      }),
    ).rejects.toThrow('already')
  })
})

/* The intake, with his real Revolut statement's shape (27 Sep). */
describe('intake: transactions', () => {
  const day = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime()
  const tx = (
    m: number,
    d: number,
    merchant: string,
    amount: number,
    extra: Record<string, unknown> = {},
  ) => ({
    occurredAt: day(m, d),
    merchant,
    raw: merchant,
    amount,
    currency: 'EUR',
    pending: false,
    self: false,
    ...extra,
  })

  async function ready(
    t: ReturnType<typeof setup>['t'],
    me: ReturnType<typeof setup>['me'],
    rows: Array<ReturnType<typeof tx>>,
    balance?: number,
  ) {
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(['pdf'], { type: 'application/pdf' })),
    )
    const started = await me.mutation(api.intake.start, {
      files: [
        {
          storageId,
          contentType: 'application/pdf',
          name: 'statement.pdf',
          size: 3,
        },
      ],
    })
    if (!started.ok) throw new Error(started.error)
    await t.mutation(internal.intake.finish, {
      intakeId: started.intakeId,
      kind: 'transactions',
      title: 'Revolut statement · EUR',
      institution: 'Revolut',
      transactions: rows,
      positions: undefined,
      balance:
        balance === undefined
          ? undefined
          : { currency: 'EUR', value: balance, asOf: day(9, 26) },
    })
    return { intakeId: started.intakeId, storageId }
  }

  test('moves are set apart, his own broker matched; the institution picks the account', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank', 'broker'],
      currencies: ['EUR'],
      domain: 'revolut.com',
    })
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const { intakeId } = await ready(t, me, [
      tx(8, 18, 'Trade Republic', -2424.96, {
        self: true,
        counterparty: 'Trade Republic, Berlin',
      }),
      tx(8, 23, 'To investment account', -1500, {
        self: true,
        counterparty: 'To investment account',
      }),
      tx(8, 18, 'Payment from ARTEM', 4400, {
        self: true,
        counterparty: 'ARTEM, PT50…0120',
      }),
      tx(9, 5, 'GANT', -108, { category: 'clothes' }),
      tx(9, 26, 'Cinemas NOS', -8.75, { pending: true, category: 'fun' }),
    ])
    const r = await me.query(api.intake.review, { intakeId })
    if (r === null) throw new Error('no review')
    expect(r.guessedAccountId).toBe(rev)
    expect(r.rows.map((x) => [x.merchant, x.kind, x.otherAccountId])).toEqual([
      ['Trade Republic', 'move', tr],
      ['To investment account', 'move', rev],
      ['Payment from ARTEM', 'move', null],
      ['GANT', 'spend', null],
      ['Cinemas NOS', 'spend', null],
    ])
  })

  test('confirm: spends, a move, the balance; pending never written; spending sums only spending', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const { intakeId, storageId } = await ready(
      t,
      me,
      [
        tx(8, 18, 'Trade Republic', -2424.96, { self: true }),
        tx(9, 5, 'GANT', -108, { category: 'clothes' }),
        tx(9, 15, 'Bnp Toc', -6.7),
        tx(9, 26, 'Cinemas NOS', -8.75, { pending: true }),
      ],
      799.47,
    )
    const done = await me.mutation(api.intake.confirmTransactions, {
      intakeId,
      accountId: rev,
      dayStart: TODAY,
      keepBalance: true,
      rows: [
        { index: 0, kind: 'move', otherAccountId: tr },
        { index: 1, kind: 'spend', category: 'clothes' },
        { index: 2, kind: 'spend', category: 'eating out' },
        { index: 3, kind: 'spend', category: 'fun' },
      ],
    })
    expect(done).toEqual({ written: 3 })
    const sums = await me.query(api.aggregate.moneySums, {
      start: day(8, 1),
      end: day(9, 27) + 86_400_000,
    })
    expect(sums.out).toEqual({ sum: 114.7, count: 2 })
    const b = await me.query(api.aggregate.balances, {})
    expect(b.accounts[0].pockets[0].value).toBe(799.47)
    expect(await stored(t, storageId)).toBe(false)
    expect(await me.query(api.intake.open, {})).toEqual([])
  })

  test('a merchant taught once files itself next time; a second read of the same rows is all duplicates', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const first = await ready(t, me, [
      tx(9, 15, 'Bnp Toc', -6.7, { category: 'shopping' }),
    ])
    await me.mutation(api.intake.setAccount, {
      intakeId: first.intakeId,
      accountId: rev,
    })
    await me.mutation(api.intake.confirmTransactions, {
      intakeId: first.intakeId,
      accountId: rev,
      dayStart: TODAY,
      keepBalance: false,
      rows: [{ index: 0, kind: 'spend', category: 'eating out' }],
    })
    const second = await ready(t, me, [
      tx(9, 14, 'BNP TOC', -6.7, { category: 'shopping' }),
      tx(9, 18, 'Bnp Toc', -6.7, { category: 'shopping' }),
    ])
    await me.mutation(api.intake.setAccount, {
      intakeId: second.intakeId,
      accountId: rev,
    })
    const r = await me.query(api.intake.review, { intakeId: second.intakeId })
    if (r === null) throw new Error('no review')
    expect(
      r.rows.map((x) => [x.category, x.categorySource, x.duplicateOf !== null]),
    ).toEqual([
      ['eating out', 'rule', true],
      ['eating out', 'rule', false],
    ])
  })

  test('a statement row that pays a bill on its day ticks it', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    await me.mutation(api.recurring.create, {
      name: 'Claude',
      kind: 'expense',
      amount: 22.14,
      cadence: 'monthly',
      day: 5,
    })
    const { intakeId } = await ready(t, me, [
      tx(9, 5, 'Anthropic* Claude Sub', -22.14),
    ])
    await me.mutation(api.intake.setAccount, { intakeId, accountId: rev })
    const r = await me.query(api.intake.review, { intakeId })
    if (r === null) throw new Error('no review')
    expect(r.rows[0].recurringId).not.toBeNull()
    await me.mutation(api.intake.confirmTransactions, {
      intakeId,
      accountId: rev,
      dayStart: TODAY,
      keepBalance: false,
      rows: [
        {
          index: 0,
          kind: 'spend',
          category: 'subscriptions',
          recurringId: r.rows[0].recurringId ?? undefined,
        },
      ],
    })
    const month = await me.query(api.recurring.month, {
      year: 2026,
      month: 8,
      start: new Date(2026, 8, 1).getTime(),
      end: new Date(2026, 9, 1).getTime(),
    })
    expect(month[0].paid?.value).toBe(22.14)
  })

  test('what comes round is offered as a bill', async () => {
    const { t, me } = setup()
    await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const { intakeId } = await ready(t, me, [
      tx(8, 5, 'Anthropic* Claude Sub', -22.14),
      tx(9, 5, 'Anthropic* Claude Sub', -22.14),
      tx(9, 15, 'Bnp Toc', -6.7),
    ])
    const r = await me.query(api.intake.review, { intakeId })
    expect(r?.recurring).toEqual([
      {
        merchant: 'Anthropic* Claude Sub',
        amount: -22.14,
        day: 5,
        months: 2,
        alreadyABill: false,
      },
    ])
  })

  test("another owner's intake is neither readable nor confirmable; a non-statement file is refused and not kept", async () => {
    const { t, me, them } = setup()
    const theirs = await them.mutation(api.accounts.create, {
      name: 'X',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const { intakeId } = await ready(t, them, [tx(9, 5, 'GANT', -108)])
    await expect(me.query(api.intake.review, { intakeId })).rejects.toThrow(
      'No such intake',
    )
    await expect(
      me.mutation(api.intake.confirmTransactions, {
        intakeId,
        accountId: theirs,
        dayStart: TODAY,
        keepBalance: false,
        rows: [],
      }),
    ).rejects.toThrow()
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(['x'])),
    )
    const result = await me.mutation(api.intake.start, {
      files: [
        { storageId, contentType: 'application/zip', name: 'x.zip', size: 1 },
      ],
    })
    expect(result.ok).toBe(false)
    expect(await stored(t, storageId)).toBe(false)
  })
})

describe('intake: holdings', () => {
  async function ready(
    t: ReturnType<typeof setup>['t'],
    me: ReturnType<typeof setup>['me'],
  ) {
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(['png'], { type: 'image/png' })),
    )
    const started = await me.mutation(api.intake.start, {
      files: [{ storageId, contentType: 'image/png', name: 'tr.png', size: 3 }],
    })
    if (!started.ok) throw new Error(started.error)
    await t.mutation(internal.intake.finish, {
      intakeId: started.intakeId,
      kind: 'holdings',
      title: 'Trade Republic · holdings',
      institution: 'Trade Republic',
      transactions: undefined,
      positions: [
        {
          name: 'Microsoft',
          valueEur: 336.52,
          changePct: 34.07,
          candidates: [{ ...TSLA, symbol: 'MSFT', name: 'Microsoft' }],
          preferred: 0,
          todayPriceEur: 452.66,
        },
      ],
    })
    return started.intakeId
  }

  test('a screenshot replaces what the account held; the cash becomes its balance', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await me.mutation(api.invest.addTrade, {
      accountId: tr,
      candidate: TSLA,
      side: 'buy',
      shares: 1,
      priceEur: 300,
      occurredAt: Date.now() - 86_400_000,
    })
    const intakeId = await ready(t, me)
    const done = await me.mutation(api.intake.confirmHoldings, {
      intakeId,
      accountId: tr,
      mode: 'opening',
      occurredAt: Date.now(),
      dayStart: TODAY,
      cashEur: 1000,
      rows: [
        {
          candidate: {
            symbol: 'MSFT',
            name: 'Microsoft',
            exchange: 'NASDAQ',
            type: 'EQUITY',
          },
          side: 'buy',
          shares: 0.743427,
          priceEur: 337.63,
        },
      ],
    })
    expect(done).toEqual({ positions: 1, replaced: 1 })
    const p = await me.query(api.aggregate.positions, {})
    expect(p.rows.map((r) => r.symbol)).toEqual(['MSFT'])
    const w = await me.query(api.aggregate.worth, {})
    expect(w.cash.total).toBe(1000)
  })

  test('cannot be confirmed twice; the same ticker twice is refused', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const intakeId = await ready(t, me)
    const row = {
      candidate: {
        symbol: 'MSFT',
        name: 'Microsoft',
        exchange: 'NASDAQ',
        type: 'EQUITY',
      },
      side: 'buy' as const,
      shares: 1,
      priceEur: 1,
    }
    await expect(
      me.mutation(api.intake.confirmHoldings, {
        intakeId,
        accountId: tr,
        mode: 'opening',
        occurredAt: Date.now(),
        dayStart: TODAY,
        rows: [row, row],
      }),
    ).rejects.toThrow('same ticker')
    await me.mutation(api.intake.confirmHoldings, {
      intakeId,
      accountId: tr,
      mode: 'opening',
      occurredAt: Date.now(),
      dayStart: TODAY,
      rows: [row],
    })
    await expect(
      me.mutation(api.intake.confirmHoldings, {
        intakeId,
        accountId: tr,
        mode: 'opening',
        occurredAt: Date.now(),
        dayStart: TODAY,
        rows: [row],
      }),
    ).rejects.toThrow('not ready')
  })

  test('a later screenshot adds the buys and sells he ticked, and they move the cash', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const msft = {
      symbol: 'MSFT',
      name: 'Microsoft',
      exchange: 'NASDAQ',
      type: 'EQUITY',
    }
    await me.mutation(api.intake.confirmHoldings, {
      intakeId: await ready(t, me),
      accountId: tr,
      mode: 'opening',
      occurredAt: Date.now(),
      dayStart: TODAY,
      cashEur: 1000,
      rows: [{ candidate: msft, side: 'buy', shares: 2, priceEur: 300 }],
    })
    /* The opening positions did not touch the cash. */
    let b = await me.query(api.aggregate.balances, {})
    expect(b.accounts[0].pockets[0].value).toBe(1000)

    vi.setSystemTime(Date.now() + 60_000)
    const second = await ready(t, me)
    await expect(
      me.mutation(api.intake.confirmHoldings, {
        intakeId: second,
        accountId: tr,
        mode: 'changes',
        occurredAt: Date.now(),
        dayStart: TODAY,
        rows: [{ candidate: msft, side: 'sell', shares: 5, priceEur: 400 }],
      }),
    ).rejects.toThrow('holds only 2')
    await me.mutation(api.intake.confirmHoldings, {
      intakeId: second,
      accountId: tr,
      mode: 'changes',
      occurredAt: Date.now(),
      dayStart: TODAY,
      rows: [{ candidate: msft, side: 'buy', shares: 1, priceEur: 400 }],
    })
    b = await me.query(api.aggregate.balances, {})
    expect(b.accounts[0].pockets[0]).toMatchObject({ value: 600, movedRows: 1 })
    const p = await me.query(api.aggregate.positions, {})
    expect(p.rows[0]).toMatchObject({ shares: 3, putIn: 1000 })
  })

  test('discard throws it away, files and all', async () => {
    const { t, me } = setup()
    const intakeId = await ready(t, me)
    await me.mutation(api.intake.discard, { intakeId })
    expect(await me.query(api.intake.open, {})).toEqual([])
  })
})

describe('adding money — typed lines', () => {
  async function two(me: ReturnType<typeof setup>['me']) {
    const bpi = await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const tr = await me.mutation(api.accounts.create, {
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    for (const id of [bpi, tr]) {
      await me.mutation(api.accounts.setBalance, {
        accountId: id,
        currency: 'EUR',
        value: 1000,
        dayStart: TODAY,
      })
    }
    return { bpi, tr }
  }
  const later = () => Date.now() + 60_000

  test('a transfer moves both balances and is neither spending nor income', async () => {
    const { t, me } = setup()
    const { bpi, tr } = await two(me)
    vi.setSystemTime(later())
    await me.mutation(api.money.record, {
      lines: [
        {
          kind: 'transfer',
          fromAccountId: bpi,
          toAccountId: tr,
          amount: 400,
          currency: 'EUR',
          occurredAt: Date.now(),
        },
        {
          kind: 'out',
          accountId: bpi,
          amount: 120,
          currency: 'EUR',
          category: 'shopping',
          note: 'boots',
          occurredAt: Date.now(),
        },
        {
          kind: 'in',
          accountId: bpi,
          amount: 350,
          currency: 'EUR',
          category: 'irs return',
          occurredAt: Date.now(),
        },
      ],
    })
    const b = await me.query(api.aggregate.balances, {})
    const pocket = (id: Id<'accounts'>) =>
      b.accounts.find((a) => a.accountId === id)?.pockets[0]
    expect(pocket(bpi)).toMatchObject({
      read: 1000,
      value: 830,
      moved: -170,
      movedRows: 3,
    })
    expect(pocket(tr)).toMatchObject({ read: 1000, value: 1400, movedRows: 1 })
    const sums = await me.query(api.aggregate.moneySums, {
      start: TODAY,
      end: TODAY + 86_400_000,
    })
    expect([sums.out, sums.in]).toEqual([
      { sum: 120, count: 1 },
      { sum: 350, count: 1 },
    ])
    /* Removing one side removes the pair. */
    const moves = await t.run((ctx) =>
      ctx.db
        .query('logs')
        .filter((q) => q.eq(q.field('kind'), 'move'))
        .collect(),
    )
    expect(moves).toHaveLength(2)
    await me.mutation(api.logs.remove, { logId: moves[1]._id })
    const after = await me.query(api.aggregate.balances, {})
    expect(after.accounts.map((a) => a.pockets[0].value)).toEqual([1230, 1000])
  })

  test('a buy takes its cost out of the broker cash; a sell puts it back', async () => {
    const { me } = setup()
    const { tr } = await two(me)
    vi.setSystemTime(later())
    await me.mutation(api.money.record, {
      lines: [
        {
          kind: 'buy',
          accountId: tr,
          candidate: TSLA,
          shares: 2,
          price: 300,
          priceCurrency: 'EUR',
          occurredAt: Date.now(),
        },
      ],
    })
    await me.mutation(api.money.record, {
      lines: [
        {
          kind: 'sell',
          accountId: tr,
          candidate: TSLA,
          shares: 1,
          price: 350,
          priceCurrency: 'EUR',
          occurredAt: Date.now(),
        },
      ],
    })
    const b = await me.query(api.aggregate.balances, {})
    expect(b.accounts[1].pockets[0]).toMatchObject({ value: 750, movedRows: 2 })
  })

  test('a reading after the movements resets the pocket — the reading wins', async () => {
    const { me } = setup()
    const { bpi, tr } = await two(me)
    vi.setSystemTime(later())
    await me.mutation(api.money.record, {
      lines: [
        {
          kind: 'transfer',
          fromAccountId: bpi,
          toAccountId: tr,
          amount: 400,
          currency: 'EUR',
          occurredAt: Date.now(),
        },
      ],
    })
    vi.setSystemTime(later())
    await me.mutation(api.accounts.setBalance, {
      accountId: bpi,
      currency: 'EUR',
      value: 555,
      dayStart: TODAY,
    })
    const b = await me.query(api.aggregate.balances, {})
    expect(b.accounts[0].pockets[0]).toMatchObject({ value: 555, moved: 0 })
  })

  test('refuses the same account twice, a currency it does not hold, selling what is not held, the future, another owner', async () => {
    const { me, them } = setup()
    const { bpi, tr } = await two(me)
    const theirs = await them.mutation(api.accounts.create, {
      name: 'X',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const move = {
      kind: 'transfer' as const,
      amount: 1,
      currency: 'EUR',
      occurredAt: Date.now(),
    }
    await expect(
      me.mutation(api.money.record, {
        lines: [{ ...move, fromAccountId: bpi, toAccountId: bpi }],
      }),
    ).rejects.toThrow('same account')
    await expect(
      me.mutation(api.money.record, {
        lines: [
          { ...move, currency: 'USD', fromAccountId: bpi, toAccountId: tr },
        ],
      }),
    ).rejects.toThrow('does not hold USD')
    await expect(
      me.mutation(api.money.record, {
        lines: [
          {
            kind: 'sell',
            accountId: tr,
            candidate: TSLA,
            shares: 1,
            price: 1,
            priceCurrency: 'EUR',
            occurredAt: Date.now(),
          },
        ],
      }),
    ).rejects.toThrow('holds only 0')
    await expect(
      me.mutation(api.money.record, {
        lines: [
          {
            kind: 'buy',
            accountId: bpi,
            candidate: TSLA,
            shares: 1,
            price: 1,
            priceCurrency: 'EUR',
            occurredAt: Date.now(),
          },
        ],
      }),
    ).rejects.toThrow('not a broker')
    await expect(
      me.mutation(api.money.record, {
        lines: [
          {
            kind: 'out',
            accountId: bpi,
            amount: 1,
            currency: 'EUR',
            category: 'x',
            occurredAt: Date.now() + 86_400_000,
          },
        ],
      }),
    ).rejects.toThrow('happened')
    await expect(
      me.mutation(api.money.record, {
        lines: [
          {
            kind: 'in',
            accountId: theirs,
            amount: 1,
            currency: 'EUR',
            category: 'gift',
            occurredAt: Date.now(),
          },
        ],
      }),
    ).rejects.toThrow('No such account')
    /* All or nothing: the refused call wrote no half of itself. */
    const b = await me.query(api.aggregate.balances, {})
    expect(b.accounts.map((a) => a.pockets[0].movedRows)).toEqual([0, 0])
  })

  test('an account knows its bank and its IBAN and card endings', async () => {
    const { me } = setup()
    const id = await me.mutation(api.accounts.create, {
      name: 'Revolut Invest',
      kinds: ['broker'],
      currencies: ['EUR'],
      product: 'revolut-invest',
      ibanTails: ['0120'],
      cardTails: ['•• 2789'],
    })
    const [a] = await me.query(api.accounts.list, {})
    expect(a).toMatchObject({
      _id: id,
      institution: 'revolut',
      ibanTails: ['0120'],
      cardTails: ['2789'],
    })
    await expect(
      me.mutation(api.accounts.create, {
        name: 'Y',
        kinds: ['bank'],
        currencies: ['EUR'],
        ibanTails: ['12'],
      }),
    ).rejects.toThrow('last four digits')
    await expect(
      me.mutation(api.accounts.create, {
        name: 'Z',
        kinds: ['bank'],
        currencies: ['EUR'],
        product: 'nope',
      }),
    ).rejects.toThrow('not one the app knows')
  })

  test('a balance typed as of an earlier day counts what moved after it', async () => {
    const { me } = setup()
    const { bpi } = await two(me)
    vi.setSystemTime(later())
    await me.mutation(api.money.record, {
      lines: [
        {
          kind: 'out',
          accountId: bpi,
          amount: 50,
          currency: 'EUR',
          category: 'home',
          occurredAt: TODAY - 86_400_000 + 3_600_000 * 15,
        },
      ],
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: bpi,
      currency: 'EUR',
      value: 900,
      dayStart: TODAY,
      asOf: TODAY - 2 * 86_400_000 + 3_600_000 * 20,
    })
    /* Today's reading of 1000 still wins — it is the latest. */
    const b = await me.query(api.aggregate.balances, {})
    expect(b.accounts[0].pockets[0].value).toBe(1000)
  })
})

describe('migrations.addingMoney', () => {
  test('splits bank+broker, learns institutions, marks opening positions, pairs transfers — and twice changes nothing', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank', 'broker'],
      currencies: ['EUR'],
      domain: 'revolut.com',
    })
    const tr = await me.mutation(api.accounts.create, {
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    await t.run(async (ctx) => {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol: 'TSLA',
        name: 'Tesla',
        exchange: 'NASDAQ',
        currency: 'USD',
        type: 'EQUITY',
      })
      const intakeId = await ctx.db.insert('intakes', {
        ownerId: ME,
        storageIds: [],
        status: 'done',
      })
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId: rev,
        instrumentId,
        side: 'buy',
        shares: 1,
        priceEur: 100,
        occurredAt: Date.now(),
        importId: intakeId,
      })
      const base = {
        ownerId: ME,
        kind: 'move' as const,
        area: 'money',
        occurredAt: Date.now() - 86_400_000,
        unit: 'eur',
        accountId: rev,
      }
      await ctx.db.insert('logs', {
        ...base,
        value: -300,
        text: 'To investment account',
        meta: { otherAccountId: rev },
      })
      await ctx.db.insert('logs', {
        ...base,
        value: -4400,
        text: 'To Trade Republic',
        meta: { otherAccountId: tr },
      })
    })
    const first = await t.mutation(internal.migrations.addingMoney, {
      ownerId: ME,
    })
    expect(first).toEqual({ institutions: 2, split: 1, opening: 1, paired: 2 })
    const accounts = await me.query(api.accounts.list, {})
    expect(
      accounts.map((a) => [a.name, a.kinds.join('+'), a.institution]),
    ).toEqual([
      ['Revolut', 'bank', 'revolut'],
      ['Revolut Invest', 'broker', 'revolut'],
      ['Trade Republic', 'broker', 'trade-republic'],
    ])
    const invest = accounts[1]._id
    const positions = await me.query(api.aggregate.positions, {})
    expect(positions.rows.map((r) => r.accountId)).toEqual([invest])
    const again = await t.mutation(internal.migrations.addingMoney, {
      ownerId: ME,
    })
    expect(again).toEqual({ institutions: 0, split: 0, opening: 0, paired: 0 })
    const sides = await t.run((ctx) =>
      ctx.db
        .query('logs')
        .filter((q) => q.eq(q.field('kind'), 'move'))
        .collect(),
    )
    expect(
      sides.map((l) => [
        l.accountId === rev ? 'rev' : l.accountId === tr ? 'tr' : 'inv',
        l.value,
      ]),
    ).toEqual([
      ['rev', -300],
      ['rev', -4400],
      ['inv', 300],
      ['tr', 4400],
    ])
  })
})

describe('the reader says what it is — trades, and whose account', () => {
  async function read(
    t: ReturnType<typeof setup>['t'],
    me: ReturnType<typeof setup>['me'],
    finish: Record<string, unknown>,
  ) {
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(['x'], { type: 'image/png' })),
    )
    const started = await me.mutation(api.intake.start, {
      files: [{ storageId, contentType: 'image/png', name: 'x.png', size: 1 }],
    })
    if (!started.ok) throw new Error(started.error)
    await t.mutation(internal.intake.finish, {
      intakeId: started.intakeId,
      transactions: undefined,
      positions: undefined,
      trades: undefined,
      ...finish,
    } as never)
    return started.intakeId
  }
  const MSFT = {
    symbol: 'MSFT',
    name: 'Microsoft',
    exchange: 'NASDAQ',
    type: 'EQUITY',
  }

  test('a trade history lands with its own dates and prices, once', async () => {
    const { t, me } = setup()
    const t212 = await me.mutation(api.accounts.create, {
      name: 'Trading 212',
      kinds: ['broker'],
      currencies: ['EUR'],
      product: 'trading-212',
    })
    await t.run((ctx) =>
      ctx.db.insert('fxRates', {
        ownerId: ME,
        currency: 'USD',
        rate: 0.9,
        asOf: Date.now(),
        fetchedAt: Date.now(),
        source: 'test',
      }),
    )
    const history = {
      kind: 'trades',
      title: 'Trading 212 · orders',
      institution: 'Trading 212',
      trades: [
        {
          occurredAt: TODAY - 5 * 86_400_000,
          name: 'Microsoft',
          side: 'buy',
          shares: 2,
          price: 400,
          currency: 'USD',
          candidates: [MSFT],
          preferred: 0,
        },
        {
          occurredAt: TODAY - 2 * 86_400_000,
          name: 'Microsoft',
          side: 'sell',
          shares: 1,
          price: 420,
          currency: 'USD',
          candidates: [MSFT],
          preferred: 0,
        },
      ],
    }
    const first = await read(t, me, history)
    expect(await me.query(api.intake.whose, { intakeId: first })).toEqual({
      guessedAccountId: t212,
      suggest: null,
    })
    expect(
      await me.mutation(api.intake.confirmTrades, {
        intakeId: first,
        accountId: t212,
        rows: [
          { index: 1, candidate: MSFT },
          { index: 0, candidate: MSFT },
        ],
      }),
    ).toEqual({ written: 2, skipped: 0 })
    const p = await me.query(api.aggregate.positions, {})
    expect(p.rows[0]).toMatchObject({ shares: 1, putIn: 720 - 378 })
    /* The same export dropped again adds nothing. */
    const again = await read(t, me, history)
    expect(
      await me.mutation(api.intake.confirmTrades, {
        intakeId: again,
        accountId: t212,
        rows: [{ index: 0, candidate: MSFT }],
      }),
    ).toEqual({ written: 0, skipped: 1 })
  })

  test('refuses a bank as the broker, and another owner’s account', async () => {
    const { t, me, them } = setup()
    const bpi = await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const theirs = await them.mutation(api.accounts.create, {
      name: 'X',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const intakeId = await read(t, me, {
      kind: 'trades',
      title: 'orders',
      trades: [
        {
          occurredAt: TODAY,
          name: 'Microsoft',
          side: 'buy',
          shares: 1,
          price: 1,
          currency: 'EUR',
          candidates: [MSFT],
        },
      ],
    })
    const rows = [{ index: 0, candidate: MSFT }]
    await expect(
      me.mutation(api.intake.confirmTrades, { intakeId, accountId: bpi, rows }),
    ).rejects.toThrow('not a broker')
    await expect(
      me.mutation(api.intake.confirmTrades, {
        intakeId,
        accountId: theirs,
        rows,
      }),
    ).rejects.toThrow('No such account')
  })

  test('a statement finds its account by IBAN ending, pairs a transfer by ending, and learns the endings it is told', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
      ibanTails: ['4455'],
    })
    const bpi = await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
      ibanTails: ['0120'],
    })
    const intakeId = await read(t, me, {
      kind: 'transactions',
      title: 'statement',
      institution: 'Some Bank',
      accountTail: '4455',
      transactions: [
        {
          occurredAt: TODAY,
          merchant: 'Transfer from Artem',
          raw: 'From PT50…0120',
          amount: 4400,
          currency: 'EUR',
          pending: false,
          self: true,
        },
        {
          occurredAt: TODAY,
          merchant: 'Top-up',
          raw: 'Top-up by card ••2789',
          amount: 100,
          currency: 'EUR',
          pending: false,
          self: true,
        },
      ],
    })
    const review = await me.query(api.intake.review, { intakeId })
    expect(review?.guessedAccountId).toBe(rev)
    expect(review?.rows.map((r) => r.otherAccountId)).toEqual([bpi, null])
    await me.mutation(api.intake.confirmTransactions, {
      intakeId,
      accountId: rev,
      dayStart: TODAY,
      keepBalance: false,
      rows: [
        { index: 0, kind: 'move', otherAccountId: bpi },
        { index: 1, kind: 'move', otherAccountId: bpi },
      ],
    })
    const accounts = await me.query(api.accounts.list, {})
    expect(accounts.find((a) => a._id === bpi)?.ibanTails).toEqual([
      '0120',
      '2789',
    ])
  })

  test('a Revolut holdings screen is Revolut Invest, a Revolut statement is Revolut', async () => {
    const { t, me } = setup()
    const rev = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
      product: 'revolut',
    })
    const inv = await me.mutation(api.accounts.create, {
      name: 'Revolut Invest',
      kinds: ['broker'],
      currencies: ['EUR'],
      product: 'revolut-invest',
    })
    const screen = await read(t, me, {
      kind: 'holdings',
      title: 'Revolut · portfolio',
      institution: 'Revolut',
      positions: [{ name: 'Microsoft', candidates: [MSFT], preferred: 0 }],
    })
    expect(
      (await me.query(api.intake.whose, { intakeId: screen })).guessedAccountId,
    ).toBe(inv)
    const statement = await read(t, me, {
      kind: 'transactions',
      title: 'Revolut statement',
      institution: 'Revolut',
      transactions: [
        {
          occurredAt: TODAY,
          merchant: 'Bolt',
          raw: 'Bolt',
          amount: -5,
          currency: 'EUR',
          pending: false,
          self: false,
        },
      ],
    })
    expect(
      (await me.query(api.intake.review, { intakeId: statement }))
        ?.guessedAccountId,
    ).toBe(rev)
  })

  test('a file from a bank he has not added suggests it', async () => {
    const { t, me } = setup()
    const intakeId = await read(t, me, {
      kind: 'holdings',
      title: 'Revolut · portfolio',
      institution: 'Revolut',
      accountTail: '9911',
      positions: [{ name: 'Microsoft', candidates: [MSFT], preferred: 0 }],
    })
    expect(await me.query(api.intake.whose, { intakeId })).toEqual({
      guessedAccountId: null,
      suggest: {
        product: 'revolut-invest',
        name: 'Revolut Invest',
        accountTail: '9911',
      },
    })
  })
})
