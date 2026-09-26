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
      kind: 'bank',
    })
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kind: 'broker',
    })
    await me.mutation(api.accounts.create, { name: 'BPI', kind: 'bank' })

    await me.mutation(api.accounts.setBalance, {
      accountId: tr,
      value: 5000,
      dayStart: TODAY,
    })
    vi.advanceTimersByTime(60_000)
    await me.mutation(api.accounts.setBalance, {
      accountId: revolut,
      value: 30000,
      dayStart: TODAY,
    })

    const b = await me.query(api.aggregate.balances, {})
    expect(b.accounts.map((a) => [a.name, a.value])).toEqual([
      ['Revolut', 30000],
      ['TR', 5000],
      ['BPI', null],
    ])
    expect(b.total).toBe(35000)
    expect(b.unread).toBe(1)
    expect(b.oldestAt).toBe(b.accounts[1].recordedAt)
  })

  test('a second reading the same day replaces it; another day adds history', async () => {
    const { me } = setup()
    const a = await me.mutation(api.accounts.create, {
      name: 'Revolut',
      kind: 'bank',
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      value: 100,
      dayStart: TODAY,
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      value: 120,
      dayStart: TODAY,
    })
    const tomorrow = TODAY + 86_400_000
    vi.setSystemTime(tomorrow + 3_600_000)
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      value: 150,
      dayStart: tomorrow,
    })
    const line = await me.query(api.aggregate.stateHistory, {
      key: `balance:${a}`,
      start: 0,
      end: Date.now() + 1,
    })
    expect(line.rows.map((r) => r.value)).toEqual([120, 150])
  })

  test('a retired account leaves the total', async () => {
    const { me } = setup()
    const a = await me.mutation(api.accounts.create, {
      name: 'Old',
      kind: 'bank',
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: a,
      value: 10,
      dayStart: TODAY,
    })
    await me.mutation(api.accounts.retire, { accountId: a })
    expect((await me.query(api.aggregate.balances, {})).total).toBe(0)
  })

  test("another owner's account is neither listed nor writable", async () => {
    const { me, them } = setup()
    const theirs = await them.mutation(api.accounts.create, {
      name: 'Theirs',
      kind: 'bank',
    })
    await them.mutation(api.accounts.setBalance, {
      accountId: theirs,
      value: 9,
      dayStart: TODAY,
    })
    expect((await me.query(api.aggregate.balances, {})).accounts).toEqual([])
    await expect(
      me.mutation(api.accounts.setBalance, {
        accountId: theirs,
        value: 1,
        dayStart: TODAY,
      }),
    ).rejects.toThrow('No such account')
  })

  test('a duplicate name is refused', async () => {
    const { me } = setup()
    await me.mutation(api.accounts.create, { name: 'Revolut', kind: 'bank' })
    await expect(
      me.mutation(api.accounts.create, { name: 'revolut', kind: 'bank' }),
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
      kind: 'broker',
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

    await withPrices(t, ME)
    p = await me.query(api.aggregate.positions, {})
    expect(p.rows[0].valueEur).toBe(900)
    expect(p.rows[0].priceAsOf).not.toBeNull()
    expect(p.rows[0].rateAsOf).not.toBeNull()
  })

  test('a euro ETF needs no rate', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kind: 'broker',
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
      kind: 'broker',
    })
    const t212 = await me.mutation(api.accounts.create, {
      name: '212',
      kind: 'broker',
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
      kind: 'broker',
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
      kind: 'broker',
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

describe('screenshot import', () => {
  async function readyImport(
    t: ReturnType<typeof setup>['t'],
    me: ReturnType<typeof setup>['me'],
  ) {
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kind: 'broker',
    })
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(['png'], { type: 'image/png' })),
    )
    const started = await me.mutation(api.invest.startImport, {
      accountId: tr,
      files: [{ storageId, contentType: 'image/png', size: 3 }],
    })
    if (!started.ok) throw new Error(started.error)
    const importId = started.importId
    await t.mutation(internal.invest.finishImport, {
      importId,
      rows: [{ name: 'Tesla', shares: 2, priceEur: 250, candidates: [TSLA] }],
    })
    return { tr, importId, storageId }
  }

  test('confirmed rows become buys in its account, and the screenshot goes', async () => {
    const { t, me } = setup()
    const { importId, storageId } = await readyImport(t, me)
    expect((await me.query(api.invest.openImports, {}))[0].status).toBe('ready')
    await me.mutation(api.invest.confirmImport, {
      importId,
      occurredAt: Date.now(),
      rows: [{ candidate: TSLA, shares: 2, priceEur: 250 }],
    })
    const p = await me.query(api.aggregate.positions, {})
    expect(p.rows.map((r) => [r.symbol, r.shares, r.putIn])).toEqual([
      ['TSLA', 2, 500],
    ])
    expect(await me.query(api.invest.openImports, {})).toEqual([])
    expect(await stored(t, storageId)).toBe(false)
  })

  test('cannot be confirmed twice, or by another owner', async () => {
    const { t, me, them } = setup()
    const { importId } = await readyImport(t, me)
    const rows = [{ candidate: TSLA, shares: 2, priceEur: 250 }]
    await expect(
      them.mutation(api.invest.confirmImport, {
        importId,
        occurredAt: Date.now(),
        rows,
      }),
    ).rejects.toThrow('No such import')
    await me.mutation(api.invest.confirmImport, {
      importId,
      occurredAt: Date.now(),
      rows,
    })
    await expect(
      me.mutation(api.invest.confirmImport, {
        importId,
        occurredAt: Date.now(),
        rows,
      }),
    ).rejects.toThrow('not ready')
  })

  test('discard throws it away, screenshots and all', async () => {
    const { t, me } = setup()
    const { importId, storageId } = await readyImport(t, me)
    await me.mutation(api.invest.discardImport, { importId })
    expect(await me.query(api.invest.openImports, {})).toEqual([])
    expect(await stored(t, storageId)).toBe(false)
  })

  test('a file that is not a screenshot is refused and not kept', async () => {
    const { t, me } = setup()
    const tr = await me.mutation(api.accounts.create, {
      name: 'TR',
      kind: 'broker',
    })
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(['x'])),
    )
    const result = await me.mutation(api.invest.startImport, {
      accountId: tr,
      files: [{ storageId, contentType: 'application/pdf', size: 1 }],
    })
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('PNG, JPG or WebP'),
    })
    expect(await stored(t, storageId)).toBe(false)
  })
})
