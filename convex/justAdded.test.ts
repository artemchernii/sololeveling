import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 14, 12)
const at = (m: number, d: number) => Date.UTC(2026, m - 1, d, 12)
const GOLD = { symbol: 'GC=F', name: 'Gold', exchange: 'CMX', type: 'FUTURE' }
const BUYS = [
  [at(7, 23), 0.08275],
  [at(6, 10), 0.069022],
  [at(4, 30), 0.074456],
  [at(4, 16), 0.059985],
] as const

/* His gold buys of 14 Oct: one file saved them; the same screenshot
   dropped again saved none. */
async function setup() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const ids = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Revolut',
      kinds: ['bank', 'broker'],
      currencies: ['EUR'],
      order: 0,
    })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      currency: 'EUR',
      ...GOLD,
    })
    const file = async (name: string, appliedAt: number) => {
      const batchId = await ctx.db.insert('batches', {
        ownerId: ME,
        status: 'done',
        appliedAt,
        leftOut: [],
        quietMonths: [],
        moves: [],
        extras: [],
        dismissed: [],
      })
      return await ctx.db.insert('intakes', {
        ownerId: ME,
        batchId,
        accountId,
        storageIds: [],
        status: 'done',
        kind: 'trades',
        files: [{ name, size: 1, contentType: 'image/png' }],
        trades: BUYS.map(([occurredAt, shares]) => ({
          occurredAt,
          name: 'XAU',
          side: 'buy' as const,
          shares,
          price: 3600,
          currency: 'EUR',
          preferred: 0,
          candidates: [GOLD],
        })),
      })
    }
    const first = await file('IMG_9285.PNG', NOW - DAY / 2)
    for (const [occurredAt, shares] of BUYS)
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side: 'buy',
        shares,
        priceEur: 3600,
        occurredAt,
        importId: first,
      })
    const again = await file('IMG_9301.PNG', NOW - DAY / 4)
    const old = await file('old.png', NOW - 9 * DAY)
    return { accountId, first, again, old }
  })
  return { t, me, ...ids }
}

describe('justAdded.list', () => {
  test('an account: what each file saved, newest first, within the days asked', async () => {
    const { me, accountId, first, again } = await setup()
    const files = await me.query(api.justAdded.list, {
      since: NOW - 7 * DAY,
      accountId,
    })
    /* The same screenshot dropped again saved nothing: not listed. */
    expect(files.map((f) => [f.id, f.saved, f.had])).toEqual([[first, 4, 0]])
    expect(files.some((f) => f.id === again)).toBe(false)
    expect(files[0].names).toEqual(['IMG_9285.PNG'])
    expect(files[0].things).toEqual([
      { symbol: 'GC=F', name: 'Gold', type: 'FUTURE' },
    ])
    expect(files[0].rows.map((r) => [r.side, r.shares])).toEqual(
      BUYS.map(([, s]) => ['buy', s]),
    )
    expect(files[0].from).toBe(at(4, 16))
    expect(files[0].to).toBe(at(7, 23))
  })

  test('IMG_9288: three buys and a sell are counted apart', async () => {
    const { t, me, accountId } = await setup()
    await t.run(async (ctx) => {
      const instrumentId = (await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ME).eq('symbol', 'GC=F'),
        )
        .unique())!._id
      const ROWS = [
        ['buy', at(4, 1), 0.024092],
        ['buy', at(3, 6), 0.047789],
        ['buy', at(2, 17), 0.050271],
        ['sell', at(1, 12), 0.269819],
      ] as const
      const intakeId = await ctx.db.insert('intakes', {
        ownerId: ME,
        accountId,
        storageIds: [],
        status: 'done',
        kind: 'trades',
        readAt: NOW - DAY / 8,
        files: [{ name: 'IMG_9288.PNG', size: 1, contentType: 'image/png' }],
        trades: ROWS.map(([side, occurredAt, shares]) => ({
          occurredAt,
          name: 'XAU',
          side,
          shares,
          price: 4100,
          currency: 'EUR',
          preferred: 0,
          candidates: [GOLD],
        })),
      })
      for (const [side, occurredAt, shares] of ROWS)
        await ctx.db.insert('trades', {
          ownerId: ME,
          accountId,
          instrumentId,
          side,
          shares,
          priceEur: 4100,
          occurredAt,
          importId: intakeId,
        })
    })
    const files = await me.query(api.justAdded.list, {
      since: NOW - 7 * DAY,
      accountId,
    })
    expect(files.map((f) => [f.names[0], f.saved, f.buys, f.sells])).toEqual([
      ['IMG_9288.PNG', 4, 3, 1],
      ['IMG_9285.PNG', 4, 4, 0],
    ])
  })

  test('a trades file opened: its buys, saved by it or in already', async () => {
    const { me, first, again } = await setup()
    const saved = await me.query(api.intake.fileRows, { intakeId: first })
    expect(saved.rows).toEqual([])
    expect(saved.trades.map((r) => [r.side, r.shares, r.landed])).toEqual(
      BUYS.map(([, s]) => ['buy', s, true]),
    )
    expect(saved.trades[0].value).toBe(Math.round(0.08275 * 3600 * 100) / 100)
    const had = await me.query(api.intake.fileRows, { intakeId: again })
    expect(had.trades.map((r) => r.landed)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  test('what the bank sent on its own, and yesterday, are not listed', async () => {
    const { t, me, accountId } = await setup()
    await t.run(async (ctx) => {
      const intakeId = await ctx.db.insert('intakes', {
        ownerId: ME,
        accountId,
        storageIds: [],
        status: 'done',
        via: 'bank',
        readAt: NOW - DAY / 8,
        transactions: [],
      })
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: 'expense',
        area: 'finance',
        value: 12,
        unit: 'eur',
        occurredAt: NOW - DAY,
        accountId,
        meta: { intakeId },
      })
    })
    const files = await me.query(api.justAdded.list, {
      since: NOW - DAY / 2,
      accountId,
    })
    expect(files.map((f) => f.names[0])).toEqual(['IMG_9285.PNG'])
    /* Since the start of today: the file saved 12 hours before NOW is
       still listed; one before it is not. */
    const later = await me.query(api.justAdded.list, {
      since: NOW - DAY / 4,
      accountId,
    })
    expect(later).toEqual([])
  })

  test('a thing: only the files asked for', async () => {
    const { me, first } = await setup()
    const files = await me.query(api.justAdded.list, {
      since: NOW - 7 * DAY,
      intakeIds: [first],
    })
    expect(files.map((f) => f.id)).toEqual([first])
  })

  test('a removed file, and one saved before the day asked, are not listed', async () => {
    const { t, me, accountId, first, old } = await setup()
    await t.run((ctx) => ctx.db.patch(first, { takenBackAt: NOW }))
    const files = await me.query(api.justAdded.list, {
      since: NOW - 7 * DAY,
      accountId,
    })
    expect(files.map((f) => f.id)).not.toContain(first)
    expect(files.map((f) => f.id)).not.toContain(old)
  })

  test("another person's files are never listed", async () => {
    const { t, accountId, first } = await setup()
    const them = t.withIdentity({ tokenIdentifier: 'https://clerk.test|x' })
    expect(
      await them.query(api.justAdded.list, {
        since: 0,
        accountId,
        intakeIds: [first],
      }),
    ).toEqual([])
  })

  /* His 14 Oct save: gold read, another thing saved. The card names the
     thing the buys sit on, and what the file printed. */
  test('buys saved on another thing: named where they sit, with what was read', async () => {
    const { t, me, accountId, first } = await setup()
    await t.run(async (ctx) => {
      const digital = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol: 'SHLD.L',
        name: 'iShares Digital Security',
        exchange: 'LSE',
        currency: 'EUR',
        type: 'ETF',
      })
      for (const x of await ctx.db.query('trades').collect())
        await ctx.db.patch(x._id, { instrumentId: digital })
    })
    const files = await me.query(api.justAdded.list, {
      since: NOW - 7 * DAY,
      accountId,
    })
    expect(files.find((f) => f.id === first)?.things).toEqual([
      {
        symbol: 'SHLD.L',
        name: 'iShares Digital Security',
        type: 'ETF',
        read: 'Gold',
      },
    ])
  })

  test("a thing's page also finds a file that read it and saved elsewhere", async () => {
    const { t, me, accountId, first } = await setup()
    const readAs = { symbols: ['GC=F'], accountIds: [accountId] }
    const list = () =>
      me.query(api.justAdded.list, { since: NOW - 7 * DAY, readAs })
    /* Saved on gold itself: nothing extra on gold's page. */
    expect(await list()).toEqual([])
    await t.run(async (ctx) => {
      const digital = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol: 'SHLD.L',
        name: 'iShares Digital Security',
        exchange: 'LSE',
        currency: 'EUR',
        type: 'ETF',
      })
      for (const x of await ctx.db.query('trades').collect())
        await ctx.db.patch(x._id, { instrumentId: digital })
    })
    const files = await list()
    expect(files.map((f) => f.id)).toEqual([first])
    expect(files[0].things[0]).toMatchObject({
      name: 'iShares Digital Security',
      read: 'Gold',
    })
  })
})
