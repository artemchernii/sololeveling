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
    expect(files.map((f) => [f.id, f.saved, f.had])).toEqual([
      [again, 0, 4],
      [first, 4, 0],
    ])
    expect(files[1].names).toEqual(['IMG_9285.PNG'])
    expect(files[1].things).toEqual([
      { symbol: 'GC=F', name: 'Gold', type: 'FUTURE' },
    ])
    expect(files[1].rows.map((r) => [r.side, r.shares])).toEqual(
      BUYS.map(([, s]) => ['buy', s]),
    )
    expect(files[1].from).toBe(at(4, 16))
    expect(files[1].to).toBe(at(7, 23))
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
})
