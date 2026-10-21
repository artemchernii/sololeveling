/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { closes } from './e2eFundamentals'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'
const DAY = 86_400_000

/* Insights I2 (19 Oct): band 3's action gives each position its
   Portfolio verdict from the stored closes, the period's moves and what
   Yahoo opens up — and writes nothing. Another user's instrument is not
   read; no one signed in is refused. */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function seed(
  t: ReturnType<typeof convexTest>,
  owner: string,
  symbol: string,
  shape: 'add' | 'hold' | 'wait' | null,
) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('instruments', {
      ownerId: owner,
      symbol,
      name: symbol,
      exchange: 'NMS',
      currency: 'USD',
      type: shape === null ? 'UNPRICED' : 'EQUITY',
    })
    const today = Math.floor(Date.now() / DAY) * DAY
    if (shape)
      for (const [k, price] of closes(shape).entries())
        await ctx.db.insert('prices', {
          ownerId: owner,
          instrumentId: id,
          price,
          currency: 'USD',
          asOf: today - (300 - k) * DAY,
          fetchedAt: Date.now(),
          source: 'Yahoo Finance',
        })
    return id
  })
}

const count = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    let n = 0
    for (const table of ['prices', 'instruments', 'fundamentals'] as const)
      n += (await ctx.db.query(table).collect()).length
    return n
  })

test('S1 verdicts from stored closes, moves for the period, nothing written', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const add = await seed(t, ME, 'AVGO', 'add')
  const wait = await seed(t, ME, 'NVDA', 'wait')
  const frozen = await seed(t, ME, 'OZON', null)
  const theirs = await seed(t, THEM, 'MSFT', 'hold')
  const before = await count(t)
  const item = (instrumentId: typeof add, symbol: string, type = 'EQUITY') => ({
    instrumentId,
    symbol,
    type,
    name: symbol,
  })
  const a = await me.action(api.insightsMine.mine, {
    period: '1M',
    first: true,
    items: [
      item(add, 'AVGO'),
      item(wait, 'NVDA'),
      item(frozen, 'OZON', 'UNPRICED'),
      item(theirs, 'MSFT'),
    ],
  })
  expect(a.calls).toEqual([
    { instrumentId: add, call: 'add' },
    { instrumentId: wait, call: 'wait' },
    { instrumentId: frozen, call: null },
  ])
  /* A frozen share has no market to ask. */
  expect(a.changes.map((c) => c.symbol)).toEqual(['AVGO', 'NVDA', 'MSFT'])
  expect(a.changes.every((c) => c.change !== null)).toBe(true)
  expect(a.opened?.world?.sectors?.technology).toBe(0.26)
  expect(await count(t)).toBe(before)

  /* A later period: the moves alone. */
  const b = await me.action(api.insightsMine.mine, {
    period: '1Y',
    first: false,
    items: [item(add, 'AVGO')],
  })
  expect(b.calls).toBeNull()
  expect(b.opened).toBeNull()
  expect(Math.abs(b.changes[0].change ?? 0)).toBeGreaterThan(
    Math.abs(a.changes[0].change ?? 0),
  )
})

test('no one signed in is refused', async () => {
  const t = convexTest(schema, modules)
  await expect(
    t.action(api.insightsMine.mine, { period: '1M', first: true, items: [] }),
  ).rejects.toThrow()
})
