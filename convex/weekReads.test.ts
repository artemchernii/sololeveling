/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'
const DAY = 86_400_000
const MON = new Date(2026, 9, 12).getTime()
const review = {
  dayStarts: Array.from({ length: 14 }, (_, i) => MON - 7 * DAY + i * DAY),
  end: MON + 7 * DAY,
  fourWeeksStart: MON - 21 * DAY,
  languages: [],
}
const run = { week: '2026-10-12', grill: false, day: 3, review }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function setup() {
  vi.useFakeTimers()
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'expense',
      occurredAt: MON + 9 * 3_600_000,
      value: 5.98,
      unit: 'eur',
      text: 'Solinca',
      meta: { merchant: 'Solinca', category: 'subscriptions' },
    })
  })
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: THEM }),
  }
}

test('a press stores the page numbers, reads, and the read stays for the week', async () => {
  const { t, me } = await setup()
  await me.mutation(api.weekReads.run, run)
  const reading =
    (await me.query(api.weekReads.forWeek, { week: run.week })).find(
      (r) => r.grill === false,
    ) ?? null
  expect(reading?.status).toBe('reading')
  expect(reading?.facts.find((f) => f.key === 'spent')?.text).toBe(
    'SPENT €5.98',
  )

  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const read =
    (await me.query(api.weekReads.forWeek, { week: run.week })).find(
      (r) => r.grill === false,
    ) ?? null
  expect(read?.status).toBe('done')
  expect(read?.verdict).toBe('MIXED WEEK')
  expect(read?.lines).toHaveLength(4)
  /* Keys the week does not have (no project here) are dropped. */
  expect(read?.lines?.[0].facts).toEqual([])
  expect(read?.lines?.[1].facts).toEqual(['spent', 'spent-was'])

  /* The other tone is its own read: not read yet. */
  expect(
    (await me.query(api.weekReads.forWeek, { week: run.week })).find(
      (r) => r.grill === true,
    ) ?? null,
  ).toBeNull()
})

test('a second press while reading pays once; RUN AGAIN replaces the read', async () => {
  const { t, me } = await setup()
  const a = await me.mutation(api.weekReads.run, run)
  const b = await me.mutation(api.weekReads.run, run)
  expect(b).toBe(a)
  await t.finishAllScheduledFunctions(vi.runAllTimers)

  const again = await me.mutation(api.weekReads.run, { ...run, grill: true })
  await me.mutation(api.weekReads.run, run)
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const rows = await t.run((ctx) => ctx.db.query('weekReads').collect())
  expect(rows).toHaveLength(2)
  expect(rows.find((r) => r._id === again)?.verdict).toBe('WEAK WEEK')
  expect(rows.every((r) => r.status === 'done')).toBe(true)
})

test('a failed read says so and nothing stays reading', async () => {
  const { t, me } = await setup()
  const readId = await me.mutation(api.weekReads.run, run)
  await t.mutation(internal.weekReads.fail, {
    readId,
    error: 'The reader could not be reached.',
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const read =
    (await me.query(api.weekReads.forWeek, { week: run.week })).find(
      (r) => r.grill === false,
    ) ?? null
  expect(read?.status).toBe('failed')
  expect(read?.error).toBe('The reader could not be reached.')
})

test('without the key, off the test backend, it fails instead of reading', async () => {
  const { t, me } = await setup()
  vi.stubEnv('E2E', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  await me.mutation(api.weekReads.run, run)
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const read =
    (await me.query(api.weekReads.forWeek, { week: run.week })).find(
      (r) => r.grill === false,
    ) ?? null
  expect(read?.status).toBe('failed')
})

test('only mine: signed out is refused, another person sees nothing', async () => {
  const { t, me, them } = await setup()
  await expect(t.mutation(api.weekReads.run, run)).rejects.toThrow()
  await me.mutation(api.weekReads.run, run)
  expect(
    (await them.query(api.weekReads.forWeek, { week: run.week })).find(
      (r) => r.grill === false,
    ) ?? null,
  ).toBeNull()
  /* Their own read counts only their rows: no €5.98 of mine. */
  await them.mutation(api.weekReads.run, run)
  const theirs =
    (await them.query(api.weekReads.forWeek, { week: run.week })).find(
      (r) => r.grill === false,
    ) ?? null
  expect(theirs?.facts.find((f) => f.key === 'spent')?.text).toBe('SPENT €0')
  await expect(
    me.mutation(api.weekReads.run, { ...run, week: 'monday' }),
  ).rejects.toThrow('BAD_WEEK')
})
