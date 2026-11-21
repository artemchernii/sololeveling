/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { investedInputs, readPositions } from './reads/positions'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000

/* The screens of what is held read only the ledgers that can hold shares
   (10 Nov): 155 of his 199 positions are sold out, and their trades were
   74% of the ledger bytes on every run of worth, positions and dayClose.
   Built as his account stands — many positions sold out long ago, one
   sold inside the chart, one the trades call sold and a screen calls
   held, one only a screen knows — and read twice: from every trade (no
   ledger yet, the read before this change) and from the marked ledgers.
   Every number must be the same. */
async function world() {
  const t = convexTest(schema, modules)
  const now = Date.now()
  const ids = await t.run(async (ctx) => {
    const account = (ownerId: string, name: string, order: number) =>
      ctx.db.insert('accounts', {
        ownerId,
        name,
        kinds: ['broker'],
        currencies: ['EUR'],
        ibanTails: [],
        cardTails: [],
        order,
      })
    const thing = async (
      ownerId: string,
      symbol: string,
      price: number,
      currency = 'EUR',
      priced = true,
    ) => {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId,
        symbol,
        name: symbol,
        exchange: 'NMS',
        currency,
        type: 'EQUITY',
      })
      if (priced)
        for (let d = 1; d <= 230; d += d < 20 ? 1 : 7)
          await ctx.db.insert('prices', {
            ownerId,
            instrumentId,
            price: price + (d % 9),
            currency,
            asOf: now - d * DAY,
            fetchedAt: now,
            source: 'Yahoo Finance',
          })
      return instrumentId
    }
    for (let d = 0; d <= 700; d += 1)
      await ctx.db.insert('fxRates', {
        ownerId: ME,
        currency: 'USD',
        rate: 0.9 + (d % 7) / 100,
        asOf: now - d * DAY,
        fetchedAt: now,
        source: 'ECB',
      })
    const longGone = []
    for (let i = 0; i < 30; i++)
      longGone.push(await thing(ME, `OLD${i}`, 10 + i, 'EUR', i < 3))
    return {
      revolut: await account(ME, 'Revolut', 0),
      tr: await account(ME, 'Trade Republic', 1),
      /* Holds nothing now: everything in it was sold long ago. */
      past: await account(ME, 'Past broker', 2),
      theirs: await account(OTHER, 'Revolut', 0),
      held: await thing(ME, 'HELD', 118),
      usd: await thing(ME, 'USD1', 100, 'USD'),
      before: await thing(ME, 'BEFORE', 40),
      inside: await thing(ME, 'INSIDE', 50),
      seen: await thing(ME, 'SEEN', 60),
      screen: await thing(ME, 'SCREEN', 70),
      early: await thing(ME, 'EARLY', 80),
      dust: await thing(ME, 'DUST', 0.001),
      longGone,
      theirShop: await thing(OTHER, 'HELD', 118),
    }
  })
  const trade = (
    ownerId: string,
    accountId: Id<'accounts'>,
    instrumentId: Id<'instruments'>,
    side: 'buy' | 'sell',
    shares: number,
    priceEur: number,
    daysAgo: number,
  ) =>
    t.run((ctx) =>
      ctx.db.insert('trades', {
        ownerId,
        accountId,
        instrumentId,
        side,
        shares,
        priceEur,
        occurredAt: now - daysAgo * DAY,
      }),
    )
  const look = (
    accountId: Id<'accounts'>,
    instrumentId: Id<'instruments'>,
    shares: number,
    daysAgo: number,
  ) =>
    t.run((ctx) =>
      ctx.db.insert('holdings', {
        ownerId: ME,
        accountId,
        instrumentId,
        shares,
        paidEur: shares * 50,
        asOf: now - daysAgo * DAY,
      }),
    )
  const { revolut, tr, past } = ids
  await trade(ME, revolut, ids.held, 'buy', 2, 100, 190)
  await trade(ME, revolut, ids.held, 'sell', 0.5, 115, 30)
  await trade(ME, tr, ids.held, 'buy', 1, 105, 120)
  for (let d = 150; d >= 5; d -= 5)
    await trade(ME, revolut, ids.usd, 'buy', 0.2, 80 + d / 10, d)
  /* Sold out before the chart's first day. */
  await trade(ME, revolut, ids.before, 'buy', 3, 30, 400)
  await trade(ME, revolut, ids.before, 'sell', 3, 45, 300)
  /* Sold out inside it: held on its early days. */
  await trade(ME, tr, ids.inside, 'buy', 4, 40, 180)
  await trade(ME, tr, ids.inside, 'sell', 4, 55, 60)
  /* The trades say sold out, a later screen says one is held. */
  await trade(ME, revolut, ids.seen, 'buy', 2, 50, 170)
  await trade(ME, revolut, ids.seen, 'sell', 2, 65, 90)
  await look(revolut, ids.seen, 1, 20)
  /* Only a screen knows it. */
  await look(tr, ids.screen, 5, 25)
  /* A screen before the sale: sold out all the same. */
  await look(revolut, ids.early, 2, 160)
  await trade(ME, revolut, ids.early, 'buy', 2, 70, 175)
  await trade(ME, revolut, ids.early, 'sell', 2, 85, 110)
  /* Shares left worth under a euro: not a position. */
  await trade(ME, revolut, ids.dust, 'buy', 10, 0.001, 100)
  await trade(ME, revolut, ids.dust, 'sell', 9.5, 0.001, 50)
  for (const [i, id] of ids.longGone.entries()) {
    for (let k = 0; k < 12; k++)
      await trade(ME, past, id, 'buy', 1, 10 + k, 700 - i - k * 8)
    await trade(ME, past, id, 'sell', 12, 30, 420 - i)
  }
  await trade(OTHER, ids.theirs, ids.theirShop, 'buy', 50, 100, 30)

  const me = t.withIdentity({ tokenIdentifier: ME })
  const dayEnds = [...Array(41).keys()].map((k) => now - (200 - k * 5) * DAY)
  const screens = async () => {
    const worthPast = drawn(
      await me.query(api.aggregate.worthPast, { dayEnds }),
    )
    return {
      positions: await me.query(api.aggregate.positions, {}),
      sold: await me.query(api.aggregate.positionsSold, {}),
      worth: await me.query(api.aggregate.worth, {}),
      dayClose: await me.query(api.aggregate.dayClose, { since: now - DAY }),
      held: await t.query(internal.aggregate.heldInstruments, {
        ownerId: ME,
      }),
      worthPast,
      worthToday: await me.query(api.aggregate.worthToday, worthPast.today),
    }
  }
  return { t, now, ids, me, dayEnds, screens }
}

/* worthPast as the chart draws it: an account that held nothing on any
   day drawn is an all-empty line, which the chart adds to nothing
   (accountLines) — read or not, it is the same picture. The order of the
   lines is the order positions were first read in, not a number. */
function drawn<
  T extends {
    investedAccounts: Array<{ accountId: string; values: Array<unknown> }>
    today: {
      accounts: Array<{ accountId: string; before: boolean }>
      positions: Array<{ accountId: string; instrumentId: string }>
    }
  },
>(w: T) {
  const lines = w.investedAccounts
    .filter((a) => a.values.some((x) => x !== null))
    .sort((a, b) => a.accountId.localeCompare(b.accountId))
  const has = new Set(lines.map((a) => a.accountId))
  return {
    ...w,
    investedAccounts: lines,
    today: {
      ...w.today,
      accounts: w.today.accounts
        .filter((a) => has.has(a.accountId))
        .sort((a, b) => a.accountId.localeCompare(b.accountId)),
      positions: [...w.today.positions].sort((a, b) =>
        `${a.accountId}${a.instrumentId}`.localeCompare(
          `${b.accountId}${b.instrumentId}`,
        ),
      ),
    },
  }
}

test('every screen says the same read from all trades and from the held ledgers', async () => {
  const w = await world()
  const fromTrades = await w.screens()
  expect(fromTrades.positions.rows.map((r) => r.symbol).sort()).toEqual([
    'HELD',
    'HELD',
    'SCREEN',
    'SEEN',
    'USD1',
  ])
  expect(fromTrades.sold).toHaveLength(34)
  expect(
    fromTrades.positions.rows.find((r) => r.symbol === 'USD1')?.paidUsd,
  ).not.toBeNull()

  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  expect(await w.screens()).toEqual(fromTrades)
})

test('a sold-out position that holds shares again is read again, and sold again is not', async () => {
  const w = await world()
  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  const marks = () =>
    w.t.run(async (ctx) =>
      (
        await ctx.db
          .query('ledgers')
          .withIndex('by_owner_account_instrument_part', (q) =>
            q
              .eq('ownerId', ME)
              .eq('accountId', w.ids.revolut)
              .eq('instrumentId', w.ids.before),
          )
          .collect()
      ).map((l) => l.soldAt ?? null),
    )
  expect(await marks()).toEqual([w.now - 300 * DAY])

  /* Its sale taken off: it holds shares, and is read again. */
  const sell = await w.t.run(
    async (ctx) =>
      (await ctx.db.query('trades').collect()).find(
        (x) => x.side === 'sell' && x.instrumentId === w.ids.before,
      )!._id,
  )
  const removed = await w.me.mutation(api.invest.removeTrade, {
    tradeId: sell,
  })
  expect(await marks()).toEqual([null])
  const p = await w.me.query(api.aggregate.positions, {})
  expect(p.rows.find((r) => r.symbol === 'BEFORE')?.shares).toBe(3)

  await w.me.mutation(api.invest.restoreTrade, { removedId: removed })
  expect(await marks()).toEqual([w.now - 300 * DAY])
  const q = await w.me.query(api.aggregate.positions, {})
  expect(q.rows.find((r) => r.symbol === 'BEFORE')).toBeUndefined()
})

/* What one run reads, counted at the database: documents and their
   bytes as JSON. */
function counting(ctx: QueryCtx) {
  let docs = 0
  let bytes = 0
  const see = <T>(x: T): T => {
    if (Array.isArray(x)) x.forEach(see)
    else if (x !== null && x !== undefined) {
      docs++
      bytes += JSON.stringify(x).length
    }
    return x
  }
  const wrap = (q: object): object =>
    new Proxy(q, {
      get(target, key) {
        const value = Reflect.get(target, key)
        if (typeof value !== 'function') return value
        return (...args: Array<unknown>) => {
          const r = value.apply(target, args)
          if (r !== null && typeof r === 'object' && 'then' in r)
            return (r as Promise<unknown>).then(see)
          return wrap(r as object)
        }
      },
    })
  const db = {
    get: async (id: Id<'instruments'>) => see(await ctx.db.get(id)),
    query: (name: 'ledgers') => wrap(ctx.db.query(name)),
  }
  return {
    ctx: { ...ctx, db } as unknown as QueryCtx,
    read: () => ({ docs, bytes }),
  }
}

test('one run reads less: the sold-out ledgers, prices and dollar days are not read', async () => {
  const w = await world()
  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  const read = await w.t.run(async (base) => {
    const run = async (f: (ctx: QueryCtx) => Promise<unknown>) => {
      const c = counting(base)
      await f(c.ctx)
      return c.read()
    }
    return {
      /* Before: every ledger and every trade day's dollar rate. */
      before: await run((ctx) =>
        readPositions(ctx, ME, { usd: true, sold: true }),
      ),
      worth: await run((ctx) => readPositions(ctx, ME)),
      positions: await run((ctx) => readPositions(ctx, ME, { usd: true })),
      chartBefore: await run((ctx) => investedInputs(ctx, ME, w.dayEnds, true)),
      chart: await run((ctx) => investedInputs(ctx, ME, w.dayEnds)),
    }
  })
  process.stdout.write(`reads of one run ${JSON.stringify(read)}\n`)
  expect(read.worth.bytes).toBeLessThan(read.before.bytes * 0.3)
  expect(read.positions.bytes).toBeLessThan(read.before.bytes * 0.5)
  expect(read.chart.bytes).toBeLessThan(read.chartBefore.bytes * 0.5)
})
