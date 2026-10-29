/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { cannedIdeas } from '../src/lib/ideasReadCanned'
import type { Fact } from '../src/lib/marketRead'

/* The IDEAS board's read (29 Oct): one row per READ AGAIN, checked before
   it lands; the newest with a plan stays on screen through a failure;
   only mine. On the test backend the API path answers with a canned
   board made from the facts. */

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'

const fact = (key: string, value = 'x'): Fact => ({
  key,
  label: key,
  value,
  tone: null,
})
const facts = [
  fact('cash-idle', '€10,000'),
  fact('pos-AVGO', '€800 · 80% of MINE'),
  fact('pos-NVDA', '€200 · 20% of MINE'),
  fact('tk-AVGO', 'price $300'),
]

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function setup() {
  vi.useFakeTimers()
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  await t.run((ctx) =>
    ctx.db.insert('principles', { ownerId: ME, text: 'P', sortOrder: 0 }),
  )
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: THEM }),
  }
}

test('S1 READ AGAIN on the API: reading, then the board, and its cost on the month', async () => {
  const { t, me } = await setup()
  await me.mutation(api.ideasReads.run, { facts, idle: 10_000, via: 'api' })
  expect((await me.query(api.ideasReads.latest, {})).row).toMatchObject({
    status: 'reading',
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const s = await me.query(api.ideasReads.latest, {})
  expect(s.row).toMatchObject({ status: 'done' })
  const b = s.shown?.board
  expect(b && b.parts.keep + b.parts.protect + b.parts.add + b.parts.new).toBe(
    10_000,
  )
  expect(b?.lines.filter((l) => l.part === 'add').map((l) => l.ticker)).toEqual(
    ['AVGO', 'NVDA'],
  )
  expect(s.spent).toBe(0.24)
})

test('S2 a second press while it reads starts nothing', async () => {
  const { me } = await setup()
  const a = await me.mutation(api.ideasReads.run, {
    facts,
    idle: 10_000,
    via: 'api',
  })
  const b = await me.mutation(api.ideasReads.run, {
    facts,
    idle: 10_000,
    via: 'api',
  })
  expect(b).toBe(a)
})

test('S3 Pro: an answer whose parts are not the cash fails; the board before stays', async () => {
  const { me } = await setup()
  const first = await me.mutation(api.ideasReads.run, {
    facts,
    idle: 10_000,
    via: 'pro',
  })
  const raw = JSON.stringify(cannedIdeas(facts, 10_000))
  await me.mutation(api.ideasReads.finishPro, {
    readId: first,
    raw,
    model: 'claude-sonnet-5-5',
    inputTokens: 1,
    outputTokens: 1,
    searches: 1,
  })
  const again = await me.mutation(api.ideasReads.run, {
    facts,
    idle: 12_000,
    via: 'pro',
  })
  await me.mutation(api.ideasReads.finishPro, {
    readId: again,
    raw,
    model: 'claude-sonnet-5-5',
    inputTokens: 1,
    outputTokens: 1,
    searches: 1,
  })
  const s = await me.query(api.ideasReads.latest, {})
  expect(s.row).toMatchObject({ status: 'failed', error: 'PARTS ≠ CASH' })
  expect(s.shown?._id).toBe(first)
  expect(s.shown?.stamp?.paidBy).toBe('pro')
  expect(s.spent).toBe(0)
})

test('S4 at the cap the API path is refused; no cash is refused', async () => {
  const { me } = await setup()
  await me.mutation(api.e2eMarketRead.spend, { usd: 2 })
  await expect(
    me.mutation(api.ideasReads.run, { facts, idle: 10_000, via: 'api' }),
  ).rejects.toThrow(/CAP_REACHED/)
  await expect(
    me.mutation(api.ideasReads.run, { facts, idle: 0, via: 'pro' }),
  ).rejects.toThrow(/NO_CASH/)
})

test('only mine: signed out refused, their rows unseen, my row not theirs to finish', async () => {
  const { t, me, them } = await setup()
  await expect(
    t.mutation(api.ideasReads.run, { facts, idle: 1, via: 'pro' }),
  ).rejects.toThrow()
  const id = await me.mutation(api.ideasReads.run, {
    facts,
    idle: 10_000,
    via: 'pro',
  })
  expect((await them.query(api.ideasReads.latest, {})).row).toBeNull()
  await expect(
    them.mutation(api.ideasReads.failPro, { readId: id, error: 'x' }),
  ).rejects.toThrow(/NOT_FOUND/)
})
