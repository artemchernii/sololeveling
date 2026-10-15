/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOON = new Date(2026, 9, 15, 12).getTime()

/* Removing a file whose trades another file read too (15 Oct, mockup
   remove-clash.html), from his drop of 14 Oct: five Revolut screenshots
   of gold, IMG_9290's last three rows IMG_9291's first three. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days: [] })
  await me.mutation(api.e2ePortfolio.goldBuys, { drop: true })
  const batchId = await t.run(
    async (ctx) => (await ctx.db.query('batches').collect()).at(-1)!._id,
  )
  await me.mutation(api.intake.applyBatch, {
    batchId,
    dayStart: new Date(2026, 9, 15).getTime(),
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const state = async () => {
    const { intakes, trades } = await t.run(async (ctx) => ({
      intakes: await ctx.db.query('intakes').collect(),
      trades: await ctx.db.query('trades').collect(),
    }))
    const named = (n: string) => {
      const i = intakes.find((x) => x.files?.[0]?.name === n)
      if (!i) throw new Error(`no ${n}`)
      return i
    }
    const of = (n: string) =>
      trades.filter((x) => x.importId === named(n)._id).length
    return {
      nine0: named('IMG_9290.PNG')._id,
      nine1: named('IMG_9291.PNG')._id,
      of,
      buys: trades.filter((x) => x.side === 'buy').length,
    }
  }
  return { t, me, state }
}

test('IMG_9290 and IMG_9291 share three rows: one file saved them', async () => {
  const { state } = await setup()
  const s = await state()
  /* Whichever was saved first holds the three. */
  expect(s.of('IMG_9290.PNG') + s.of('IMG_9291.PNG')).toBe(6)
  expect(s.buys).toBe(17)
})

test('removing the file that saved them: the three stay, now on the other', async () => {
  const { me, state } = await setup()
  const s = await state()
  const first = s.of('IMG_9290.PNG') === 5 ? s.nine0 : s.nine1
  const other = first === s.nine0 ? s.nine1 : s.nine0
  const only = first === s.nine0 ? 2 : 1

  /* Said before the press: what goes, what stays and where. */
  const p = await me.query(api.undoFile.preview, { intakeId: first })
  expect(p?.trades).toBe(only)
  expect(p?.stay).toEqual({
    trades: 3,
    in: first === s.nine0 ? 'IMG_9291.PNG' : 'IMG_9290.PNG',
  })

  await me.mutation(api.undoFile.takeBack, { intakeId: first })
  const after = await state()
  /* Only the rows no other file read went. */
  expect(after.buys).toBe(17 - only)
  const name = (id: typeof first) =>
    id === s.nine0 ? 'IMG_9290.PNG' : 'IMG_9291.PNG'
  expect(after.of(name(first))).toBe(0)
  expect(after.of(name(other))).toBe(first === s.nine0 ? 4 : 5)

  /* Removing the other then takes them: nobody else read them. */
  await me.mutation(api.undoFile.takeBack, { intakeId: other })
  expect((await state()).buys).toBe(17 - 6)
})

test('just added marks the shared rows STAYS with the other file', async () => {
  const { me, state } = await setup()
  const s = await state()
  const first = s.of('IMG_9290.PNG') === 5 ? s.nine0 : s.nine1
  const files = await me.query(api.justAdded.list, {
    since: new Date(2026, 9, 15).getTime(),
    intakeIds: [s.nine0, s.nine1],
  })
  const f = files.find((x) => x.id === first)
  expect(f?.stay?.buys).toBe(3)
  expect(f?.rows.filter((r) => r.stays !== null)).toHaveLength(3)
})

test('the whole drop undone: nothing is handed between its own files', async () => {
  const { t, me, state } = await setup()
  const batchId = await t.run(
    async (ctx) => (await ctx.db.query('batches').collect()).at(-1)!._id,
  )
  await me.mutation(api.undoFile.takeBackBatch, { batchId })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await state()).buys).toBe(0)
})

test("refused: another owner's file", async () => {
  const { t, state } = await setup()
  const s = await state()
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  await expect(
    other.mutation(api.undoFile.takeBack, { intakeId: s.nine0 }),
  ).rejects.toThrow('No such file')
  await expect(
    other.query(api.undoFile.preview, { intakeId: s.nine0 }),
  ).rejects.toThrow('No such file')
  expect((await state()).buys).toBe(17)
})
