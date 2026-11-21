/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import { writeTransfer } from './money'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const DAY = 86_400_000
const HOUR = 3_600_000
const NOON = new Date(2026, 9, 11, 12).getTime()
const DAY_START = new Date(2026, 9, 11).getTime()

/* His ActivoBank on 8 Nov (convex/unbooked.ts): €300 sent to Revolut,
   both sides saved by Revolut's answer, ActivoBank's booked balance still
   with the €300 in. The canned bank holds €727.49 at the start. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const day = (at: number) => new Date(at).toISOString().slice(0, 10)
const out = (at: number, amount: string, words: string) => ({
  status: 'BOOK',
  amount,
  currency: 'EUR',
  indicator: 'DBIT',
  bookingDate: day(at),
  remittance: [words],
})

async function world() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const activo = await me.mutation(api.accounts.create, {
    name: 'ActivoBank',
    kinds: ['bank'],
    currencies: ['EUR'],
    product: 'activo',
  })
  const url = await me.action(api.bank.connect, { accountId: activo })
  const state = new URL(url, 'http://app').searchParams.get('state') as string
  await me.action(api.bank.finish, { code: 'one', state, dayStart: DAY_START })
  const revolut = await me.mutation(api.accounts.create, {
    name: 'Revolut',
    kinds: ['bank'],
    currencies: ['EUR'],
    product: 'revolut',
  })
  /** Revolut's answer saves the transfer's two sides, as its top-up. */
  const sent = (at: number) =>
    t.run(async (ctx) => {
      const from = await ctx.db.get(activo)
      const to = await ctx.db.get(revolut)
      if (from === null || to === null) throw new Error('no account')
      const batchId = await ctx.db.insert('batches', {
        ownerId: ME,
        status: 'done',
        leftOut: [],
        quietMonths: [],
        moves: [],
        extras: [],
        dismissed: [],
        via: 'bank',
      })
      const intakeId = await ctx.db.insert('intakes', {
        ownerId: ME,
        accountId: revolut,
        batchId,
        storageIds: [],
        status: 'done',
        kind: 'transactions',
        title: 'Revolut',
        via: 'bank',
      })
      await writeTransfer(ctx, ME, {
        from,
        to,
        amount: 300,
        currency: 'EUR',
        occurredAt: at,
        text: 'Top-Up by *2789',
        intakeId,
      })
    })
  /** ActivoBank's answer: its booked balance and booked rows. */
  const answers = async (
    at: number,
    value: number,
    list: Array<ReturnType<typeof out>>,
  ) => {
    vi.setSystemTime(at)
    await t.mutation(internal.bankRows.arrive, {
      ownerId: ME,
      accountId: activo,
      dayStart: new Date(at).setHours(0, 0, 0, 0),
      names: [],
      readings: [{ currency: 'EUR', value, booked: true, rows: list }],
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }
  const state_ = () =>
    t.run(async (ctx) => {
      const s = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ME).eq('key', `balance:${activo}:EUR`),
        )
        .order('desc')
        .first()
      const link = await ctx.db
        .query('bankLinks')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ME).eq('accountId', activo),
        )
        .unique()
      const logs = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q.eq('ownerId', ME).eq('accountId', activo),
        )
        .collect()
      return {
        value: s?.value,
        unbooked: s?.unbooked?.map((u) => u.amount),
        questions: link?.questions?.length ?? 0,
        rows: logs.map((l) => (l.kind === 'expense' ? -1 : 1) * (l.value ?? 0)),
      }
    })
  return { sent, answers, state: state_ }
}

const D1 = NOON + DAY + 8 * HOUR

test('his 8 Nov: the transfer saved from Revolut, then a booked balance without it — no question, his own number', async () => {
  const w = await world()
  await w.sent(NOON + 20 * HOUR)
  await w.answers(D1, 695.55, [out(D1 - 6 * HOUR, '31.94', 'PAGSERV ADYEN')])
  expect(await w.state()).toEqual({
    value: 395.55,
    unbooked: [-300],
    questions: 0,
    rows: [-300, -31.94],
  })
})

test('still not booked a day on: the same number, no question', async () => {
  const w = await world()
  await w.sent(NOON + 20 * HOUR)
  await w.answers(D1, 695.55, [out(D1 - 6 * HOUR, '31.94', 'PAGSERV ADYEN')])
  await w.answers(D1 + DAY, 695.55, [])
  const s = await w.state()
  expect([s.value, s.unbooked, s.questions]).toEqual([395.55, [-300], 0])
})

test('the bank books it later: its number stands, the transfer is one row', async () => {
  const w = await world()
  await w.sent(NOON + 20 * HOUR)
  await w.answers(D1, 695.55, [out(D1 - 6 * HOUR, '31.94', 'PAGSERV ADYEN')])
  await w.answers(D1 + 2 * DAY, 395.55, [
    out(NOON + 20 * HOUR, '300.00', 'PAG 2789 REVOLUT'),
  ])
  const s = await w.state()
  expect([s.value, s.questions]).toEqual([395.55, 0])
  expect(s.rows.filter((x) => x === -300)).toHaveLength(1)
  await w.answers(D1 + 3 * DAY, 395.55, [
    out(NOON + 20 * HOUR, '300.00', 'PAG 2789 REVOLUT'),
  ])
  expect((await w.state()).unbooked).toEqual([])
})

test("the other order: ActivoBank's answer saved first, Revolut's writes the transfer after", async () => {
  const w = await world()
  await w.answers(D1, 695.55, [out(D1 - 6 * HOUR, '31.94', 'PAGSERV ADYEN')])
  expect((await w.state()).value).toBe(695.55)
  await w.sent(NOON + 20 * HOUR)
  const s = await w.state()
  expect([s.value, s.unbooked, s.questions]).toEqual([395.55, [-300], 0])
})
