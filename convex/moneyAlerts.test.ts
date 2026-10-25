/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

/* N2 money alerts (spec docs/specs/2026-10-17-n2-finances-alerts.md).
   Vitest runs in Lisbon, so new Date(y, m, d, h) is his wall clock. */

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'

const at = (m: number, d: number, h: number) =>
  new Date(2026, m - 1, d, h).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(10, 27, 8))
})
afterEach(() => {
  vi.useRealTimers()
})

type Backend = ReturnType<typeof convexTest>

async function account(
  t: Backend,
  ownerId: string,
  name: string,
  eur: number | null,
) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('accounts', {
      ownerId,
      name,
      kinds: ['bank'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    if (eur !== null)
      await ctx.db.insert('stateSnapshots', {
        ownerId,
        area: 'money',
        key: `balance:${id}:EUR`,
        value: eur,
        unit: 'eur',
        recordedAt: at(10, 26, 20),
        source: 'typed',
      })
    return id
  })
}

async function bill(
  t: Backend,
  ownerId: string,
  name: string,
  amount: number,
  day: number,
  accountId?: Id<'accounts'>,
  kind: 'expense' | 'income' = 'expense',
) {
  return await t.run((ctx) =>
    ctx.db.insert('recurring', {
      ownerId,
      name,
      kind,
      amount,
      accountId,
      cadence: 'monthly',
      day,
    }),
  )
}

async function sent(t: Backend, ownerId = ME) {
  return (await t.run((ctx) => ctx.db.query('notifications').collect()))
    .filter((n) => n.ownerId === ownerId)
    .map((n) => ({ kind: n.kind, title: n.title, body: n.body, url: n.url }))
}

const morning = (t: Backend, ownerId = ME) =>
  t.action(internal.moneyAlerts.morning, { ownerId })

describe('A · missing for a bill (S1–S5)', () => {
  test('S1 €78.39 against €123.72 two days out → rings', async () => {
    const t = convexTest(schema, modules)
    const activo = await account(t, ME, 'ActivoBank', 78.39)
    await bill(t, ME, 'Preply', 123.72, 29, activo)
    await morning(t)
    expect(await sent(t)).toEqual([
      {
        kind: 'money_missing',
        title: 'Preply · €123.72 · 29 Oct',
        body: 'ActivoBank €78.39 · €45.33 missing',
        url: '/finances?room=flow',
      },
    ])
  })

  test('S2 topped up → quiet', async () => {
    const t = convexTest(schema, modules)
    const activo = await account(t, ME, 'ActivoBank', 278.39)
    await bill(t, ME, 'Preply', 123.72, 29, activo)
    await morning(t)
    expect(await sent(t)).toEqual([])
  })

  test('S3 two bills short in one account → one alert, the whole gap', async () => {
    const t = convexTest(schema, modules)
    const activo = await account(t, ME, 'ActivoBank', 50)
    await bill(t, ME, 'Água', 30, 29, activo)
    await bill(t, ME, 'Preply', 100, 29, activo)
    await morning(t)
    const out = await sent(t)
    expect(out).toHaveLength(1)
    expect(out[0].body).toBe('ActivoBank €50 · €80 missing')
  })

  test('S4 no account, or a balance never read → quiet', async () => {
    const t = convexTest(schema, modules)
    const unread = await account(t, ME, 'BPI', null)
    await bill(t, ME, 'Mortgage', 612, 29, unread)
    await bill(t, ME, 'Vodafone', 30, 29)
    await morning(t)
    expect(await sent(t)).toEqual([])
  })

  test('a bill three days out is not rung yet', async () => {
    const t = convexTest(schema, modules)
    const activo = await account(t, ME, 'ActivoBank', 10)
    await bill(t, ME, 'Preply', 123.72, 30, activo)
    await morning(t)
    expect(await sent(t)).toEqual([])
  })
})

describe('the morning job (S5)', () => {
  test('a device on → one job at the next 09:00; again → still one', async () => {
    const t = convexTest(schema, modules)
    const mine = t.withIdentity({ tokenIdentifier: ME })
    const sub = { p256dh: 'k', auth: 'a', device: 'iphone' as const }
    await mine.mutation(api.push.subscribe, { endpoint: 'e1', ...sub })
    await mine.mutation(api.push.subscribe, { endpoint: 'e2', ...sub })
    const jobs = await t.run(async (ctx) => {
      const rows = await ctx.db.query('moneyAlerts').collect()
      const pending = (
        await ctx.db.system.query('_scheduled_functions').collect()
      ).filter(
        (j) => j.name.includes('moneyAlerts') && j.state.kind === 'pending',
      )
      return { rows, pending }
    })
    expect(jobs.rows).toHaveLength(1)
    expect(jobs.rows[0].at).toBe(at(10, 27, 9))
    expect(jobs.pending).toHaveLength(1)
    expect(jobs.pending[0].scheduledTime).toBe(at(10, 27, 9))
  })

  test('after the morning → tomorrow 09:00', async () => {
    const t = convexTest(schema, modules)
    vi.setSystemTime(at(10, 27, 9))
    await morning(t)
    const row = await t.run((ctx) => ctx.db.query('moneyAlerts').first())
    expect(row?.at).toBe(at(10, 28, 9))
  })
})

describe('B · approval ending (S6)', () => {
  async function link(t: Backend, validUntil: number) {
    const activo = await account(t, ME, 'ActivoBank', 500)
    await t.run((ctx) =>
      ctx.db.insert('bankLinks', {
        ownerId: ME,
        accountId: activo,
        status: 'linked',
        validUntil,
        startedAt: at(7, 26, 9),
      }),
    )
  }

  test('7 days before → rings', async () => {
    const t = convexTest(schema, modules)
    await link(t, at(11, 3, 18))
    await morning(t)
    expect(await sent(t)).toEqual([
      {
        kind: 'bank_approval',
        title: 'ActivoBank · approval until 3 Nov',
        body: '7 days · APPROVE',
        url: '/finances',
      },
    ])
  })

  test('1 day before → rings; 3 days → quiet', async () => {
    const t = convexTest(schema, modules)
    await link(t, at(10, 28, 18))
    await morning(t)
    expect((await sent(t))[0]?.body).toBe('1 day · APPROVE')

    const u = convexTest(schema, modules)
    await link(u, at(10, 30, 18))
    await morning(u)
    expect(await sent(u)).toEqual([])
  })
})

describe('C · salary in (S10)', () => {
  test('a row pays the salary → rings once', async () => {
    const t = convexTest(schema, modules)
    const bpi = await account(t, ME, 'BPI', 3000)
    const salary = await bill(t, ME, 'Oreum', 2809.4, 25, bpi, 'income')
    await t.run((ctx) =>
      ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: 'income',
        occurredAt: at(10, 26, 12),
        value: 2809.4,
        unit: 'eur',
        text: 'Oreum',
        accountId: bpi,
        meta: { raw: 'Oreum', recurringId: salary },
      }),
    )
    await morning(t)
    expect(await sent(t)).toEqual([
      {
        kind: 'salary_in',
        title: 'Salary in · €2,809.40',
        body: 'BPI · 26 Oct',
        url: '/finances',
      },
    ])
    vi.setSystemTime(at(10, 28, 9))
    await morning(t)
    expect(await sent(t)).toHaveLength(1)
  })

  /* His 23 Oct: commute pay and salary from one payer, the commute pay
     found as a bill of its own and due first. */
  test('same payer twice → the salary rings, not the €80', async () => {
    const t = convexTest(schema, modules)
    vi.setSystemTime(at(10, 24, 8))
    const bpi = await account(t, ME, 'BPI', 3000)
    const commute = await bill(t, ME, 'Bnp Paribas', 80, 23, bpi, 'income')
    const salary = await bill(t, ME, 'Bnp Paribas', 2668.98, 25, bpi, 'income')
    await t.run(async (ctx) => {
      for (const id of [commute, salary])
        await ctx.db.patch(id, { matchKey: 'BNP PARIBAS' })
      for (const [n, value] of [
        ['26', 80],
        ['25', 2674.76],
      ] as const)
        await ctx.db.insert('logs', {
          ownerId: ME,
          area: 'money',
          kind: 'income',
          occurredAt: Date.UTC(2026, 9, 23, 12),
          value,
          unit: 'eur',
          text: `TRF CR SEPA+ 00000${n} DE BNP PARIBAS`,
          accountId: bpi,
          meta: { raw: `TRF CR SEPA+ 00000${n} DE BNP PARIBAS` },
        })
    })
    await morning(t)
    expect(await sent(t)).toEqual([
      {
        kind: 'salary_in',
        title: 'Salary in · €2,674.76',
        body: 'BPI · 23 Oct',
        url: '/finances',
      },
    ])
  })

  /* A 23rd on a Saturday: the salary of the 25th lands on Friday 22
     Jan, three days early. */
  test('paid three days before its day → rings', async () => {
    const t = convexTest(schema, modules)
    vi.setSystemTime(new Date(2027, 0, 23, 8).getTime())
    const bpi = await account(t, ME, 'BPI', 3000)
    const salary = await bill(t, ME, 'Bnp Paribas', 2668.98, 25, bpi, 'income')
    await t.run((ctx) =>
      ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: 'income',
        occurredAt: Date.UTC(2027, 0, 22, 12),
        value: 2674.76,
        unit: 'eur',
        text: 'BNP PARIBAS',
        accountId: bpi,
        meta: { raw: 'BNP PARIBAS', recurringId: salary },
      }),
    )
    await morning(t)
    expect(await sent(t)).toEqual([
      {
        kind: 'salary_in',
        title: 'Salary in · €2,674.76',
        body: 'BPI · 22 Jan',
        url: '/finances',
      },
    ])
  })

  test('not in yet → quiet', async () => {
    const t = convexTest(schema, modules)
    const bpi = await account(t, ME, 'BPI', 100)
    await bill(t, ME, 'Oreum', 2809.4, 25, bpi, 'income')
    await morning(t)
    expect(await sent(t)).toEqual([])
  })
})

describe('owners stay apart (S9)', () => {
  test("another owner's short bill never reaches mine", async () => {
    const t = convexTest(schema, modules)
    const theirs = await account(t, THEM, 'ActivoBank', 1)
    await bill(t, THEM, 'Preply', 123.72, 29, theirs)
    await morning(t, ME)
    expect(await sent(t, ME)).toEqual([])
    await morning(t, THEM)
    expect(await sent(t, THEM)).toHaveLength(1)
  })
})
