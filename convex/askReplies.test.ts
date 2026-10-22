/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'
const AUG = new Date(2026, 7, 1).getTime()
const SEP = new Date(2026, 8, 1).getTime()
const Q = {
  question: 'What did I actually do in August?',
  from: AUG,
  to: SEP,
  title: 'AUG 2026',
  range: 'AUG 1 – 31',
  offsetMin: new Date(AUG).getTimezoneOffset(),
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function setup() {
  vi.stubEnv('E2E', '1')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const t = convexTest(schema, modules)
  await t
    .withIdentity({ tokenIdentifier: ME })
    .mutation(api.e2eRowsAsk.month, { from: AUG })
  return t
}

const bell = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.query('notifications').collect())
const jobs = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())

test('an answer is kept, with a ring and a drop scheduled', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const res = await me.action(api.ai.rowsAsk.ask, Q)
  expect(res.ok).toBe(true)
  expect(res.replyId).toBeDefined()
  const row = await me.query(api.askReplies.get, { id: res.replyId! })
  expect(row?.question).toBe(Q.question)
  expect(row?.range).toBe('AUG 1 – 31')
  expect(row?.answer?.headline).toBeTruthy()
  expect(row?.stamp?.cost).toBe(0.03)
  expect(row?.seenAt).toBeUndefined()
  const names = (await jobs(t)).map((j) => j.name)
  expect(names).toContain('askReplies:ring')
  expect(names).toContain('askReplies:drop')
})

test('not seen: it rings once, opening the drawer on it', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const { replyId } = await me.action(api.ai.rowsAsk.ask, Q)
  await t.mutation(internal.askReplies.ring, { id: replyId! })
  const [n] = await bell(t)
  expect(n.kind).toBe('ask_reply')
  expect(n.ownerId).toBe(ME)
  expect(n.title).toBe('✦ Ask · AUG 1 – 31')
  expect(n.url).toBe(`/dashboard?ask=${replyId}`)
  const row = await me.query(api.askReplies.get, { id: replyId! })
  expect(row?.rangAt).toBeDefined()
})

test('seen on screen: it does not ring', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const { replyId } = await me.action(api.ai.rowsAsk.ask, Q)
  await me.mutation(api.askReplies.seen, { id: replyId! })
  await t.mutation(internal.askReplies.ring, { id: replyId! })
  expect(await bell(t)).toHaveLength(0)
})

test('a failure is kept and rings as NOT REACHED, nothing paid', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2eMarketRead.arm, { shape: 'fail' })
  const res = await me.action(api.ai.rowsAsk.ask, Q)
  expect(res.ok).toBe(false)
  await t.mutation(internal.askReplies.ring, { id: res.replyId! })
  const [n] = await bell(t)
  expect(n.title).toBe('✕ Ask · NOT REACHED')
  expect(n.body).toBe(`$0.00 · NOTHING PAID · ${Q.question}`)
})

test('refused before a call: nothing kept', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const res = await me.action(api.ai.rowsAsk.ask, { ...Q, question: '  ' })
  expect(res).toEqual({ ok: false, error: 'NO QUESTION', cost: 0 })
  expect(
    await t.run((ctx) => ctx.db.query('askReplies').collect()),
  ).toHaveLength(0)
})

test('someone else cannot read it or mark it seen', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const them = t.withIdentity({ tokenIdentifier: THEM })
  const { replyId } = await me.action(api.ai.rowsAsk.ask, Q)
  expect(await them.query(api.askReplies.get, { id: replyId! })).toBeNull()
  expect(await them.query(api.askReplies.since, { from: 0 })).toEqual([])
  await them.mutation(api.askReplies.seen, { id: replyId! })
  await t.mutation(internal.askReplies.ring, { id: replyId! })
  expect(await bell(t)).toHaveLength(1)
  await expect(t.query(api.askReplies.get, { id: replyId! })).rejects.toThrow()
})

test('since: the page finds what landed while it was away', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const before = Date.now()
  const { replyId } = await me.action(api.ai.rowsAsk.ask, Q)
  const found = await me.query(api.askReplies.since, { from: before })
  expect(found.map((r) => r._id)).toEqual([replyId])
  expect(
    await me.query(api.askReplies.since, { from: Date.now() + 60_000 }),
  ).toEqual([])
})

test('gone after a day', async () => {
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const { replyId } = await me.action(api.ai.rowsAsk.ask, Q)
  await t.mutation(internal.askReplies.drop, { id: replyId! })
  expect(await me.query(api.askReplies.get, { id: replyId! })).toBeNull()
  /* the ring after it finds nothing */
  await t.mutation(internal.askReplies.ring, { id: replyId! })
  expect(await bell(t)).toHaveLength(0)
})
