import { BUILTIN_AREAS } from '../../src/lib/area-slug'
import { OWNER_ZONE } from '../../src/lib/remindAt'
import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { addLanguageFor } from '../areas'
import { rebuildLedgers } from '../ledgers'

/**
 * The demo account's made-up story (27 Oct, docs/specs/2026-10-27-demo-
 * account.md): ninety days of a life, every date counted back from `now`
 * so "last month" stays last month. Written only into an account marked
 * `demo` (demo.ts); never into Artem's, never on a schedule of its own.
 * Fixed, not random: two fills on the same day give the same screens.
 */

const DAY = 86_400_000
const DAYS = 90

/** The Lisbon calendar day of `ms`, as 2026-10-27. */
export function lisbonDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OWNER_ZONE }).format(ms)
}

/* A fixed pattern per day: day `ago` has the thing when this says so. */
const on = (ago: number, every: number, shift = 0) =>
  (ago * 7 + shift) % every === 0 || (ago + shift) % 11 === 3

export const SHARES: ReadonlyArray<{
  symbol: string
  name: string
  exchange: string
  currency: string
  type: string
  buys: ReadonlyArray<readonly [number, number, number]>
}> = [
  {
    symbol: 'VWCE.DE',
    name: 'Vanguard FTSE All-World',
    exchange: 'GER',
    currency: 'EUR',
    type: 'ETF',
    buys: [
      [330, 20, 118.4],
      [240, 15, 124.9],
      [120, 15, 131.2],
      [40, 12, 136.5],
    ],
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NMS',
    currency: 'USD',
    type: 'EQUITY',
    buys: [
      [300, 8, 178.2],
      [90, 6, 196.4],
    ],
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    exchange: 'NMS',
    currency: 'USD',
    type: 'EQUITY',
    buys: [
      [280, 3, 372.1],
      [60, 3, 405.8],
    ],
  },
  {
    symbol: 'ASML.AS',
    name: 'ASML Holding N.V.',
    exchange: 'AMS',
    currency: 'EUR',
    type: 'EQUITY',
    buys: [[200, 4, 640.3]],
  },
  {
    symbol: 'IGLN.L',
    name: 'iShares Physical Gold',
    exchange: 'LSE',
    currency: 'USD',
    type: 'ETF',
    buys: [
      [250, 30, 44.6],
      [70, 10, 52.3],
    ],
  },
  {
    symbol: 'BTC-EUR',
    name: 'Bitcoin EUR',
    exchange: 'CCC',
    currency: 'EUR',
    type: 'CRYPTOCURRENCY',
    buys: [[180, 0.02, 61_200]],
  },
]

const BILLS = [
  { name: 'Rent', amount: 650, day: 1, category: 'life' },
  { name: 'Gym', amount: 35, day: 5, category: 'sport' },
  { name: 'Phone', amount: 15, day: 12, category: 'bills' },
  { name: 'Music', amount: 11, day: 20, category: 'subscriptions' },
] as const

const SPENDS = [
  ['Supermarket', 'groceries', 38.4],
  ['Café', 'eating out', 4.2],
  ['Taxi', 'transport', 7.9],
  ['Lunch', 'eating out', 12.5],
  ['Bakery', 'groceries', 3.1],
  ['Pharmacy', 'health', 9.8],
  ['Cinema', 'fun', 8.5],
] as const

export async function fillStory(
  ctx: MutationCtx,
  ownerId: string,
  now: number,
): Promise<void> {
  const today = lisbonDay(now)
  const at = (ago: number, hour: number) =>
    Math.floor((now - ago * DAY) / DAY) * DAY + hour * 3_600_000

  /* Rooms: the ten built-ins (as areas.ensure writes them), then two
     languages. */
  for (const [order, a] of BUILTIN_AREAS.entries())
    await ctx.db.insert('areas', {
      ownerId,
      slug: a.slug,
      label: a.label,
      hue: a.hue,
      order,
    })
  const pt = await addLanguageFor(ctx, ownerId, 'pt-PT')
  const en = await addLanguageFor(ctx, ownerId, 'en')

  /* Evidence: what happened, day by day. Today itself only up to now. */
  for (let ago = DAYS; ago >= 0; ago--) {
    const log = (
      kind: 'workout' | 'session' | 'intake' | 'post' | 'weight',
      area: string,
      hour: number,
      fields: { value?: number; unit?: string; text?: string } = {},
      category?: string,
    ) => {
      const occurredAt = at(ago, hour)
      if (occurredAt > now) return null
      return ctx.db.insert('logs', {
        ownerId,
        kind,
        area,
        occurredAt,
        ...fields,
        ...(category ? { meta: { category } } : {}),
      })
    }
    if (on(ago, 2))
      await log(
        'workout',
        'body',
        8,
        {
          value: 60,
          unit: 'min',
          text: ['push day', 'legs', 'pull day', 'run'][ago % 4],
        },
        'gym',
      )
    if (on(ago, 3, 1)) await log('intake', 'body', 9, {}, 'supplements')
    if (on(ago, 2, 1)) await log('session', pt, 19, { value: 30, unit: 'min' })
    if (on(ago, 4, 2)) await log('session', en, 20, { value: 45, unit: 'min' })
    if (ago % 9 === 4) await log('post', 'social', 13, { text: 'post' })
    if (ago % 7 === 0)
      await log('weight', 'body', 7, {
        value: Math.round((77.8 - (DAYS - ago) * 0.02) * 10) / 10,
        unit: 'kg',
      })
  }

  /* Plans: goals, projects and their tasks, three picked for today. */
  const goal = (
    title: string,
    area: string,
    targetLabel: string,
    deadlineIn: number,
  ) =>
    ctx.db.insert('goals', {
      ownerId,
      title,
      area,
      status: 'active',
      targetLabel,
      deadline: lisbonDay(now + deadlineIn * DAY),
    })
  const b1 = await goal('Portuguese B1', pt, 'B1', 120)
  await goal('Run a half marathon', 'body', '21 km', 160)
  await goal('Ship the side app', 'projects', 'v1', 60)

  const project = (title: string, status: 'focus' | 'active', area: string) =>
    ctx.db.insert('projects', { ownerId, title, status, area })
  const app = await project('Side app', 'focus', 'projects')
  const flat = await project('New flat', 'active', 'life')

  const tasks: ReadonlyArray<
    readonly [string, Id<'projects'> | undefined, boolean, boolean]
  > = [
    ['Portuguese — unit 12', undefined, true, true],
    ['Leg day', undefined, true, false],
    ['Draft the launch post', app, true, false],
    ['Fix the login screen', app, false, false],
    ['Call the landlord', flat, false, false],
    ['Order the desk lamp', flat, false, false],
  ]
  for (const [i, [title, projectId, picked, done]] of tasks.entries()) {
    const id = await ctx.db.insert('tasks', {
      ownerId,
      title,
      projectId,
      goalId: i === 0 ? b1 : undefined,
      priority: i,
      status: done ? 'done' : 'open',
      completedAt: done ? now - 3_600_000 : undefined,
      todayFor: picked ? today : undefined,
      pickedAt: picked ? now - (10 - i) * 60_000 : undefined,
    })
    if (done)
      await ctx.db.insert('logs', {
        ownerId,
        kind: 'task_done',
        area: pt,
        occurredAt: now - 3_600_000,
        taskId: id,
        text: title,
      })
  }

  /* The week ahead. */
  for (const [inDays, hour, title, area] of [
    [0, 18, 'Portuguese class', pt],
    [1, 8, 'Gym', 'body'],
    [2, 12, 'Lunch with Ana', 'social'],
    [3, 19, 'English call', en],
    [4, 8, 'Long run', 'body'],
    [5, 10, 'Flat viewing', 'life'],
  ] as const) {
    const startsAt = at(-inDays, hour)
    await ctx.db.insert('events', {
      ownerId,
      title,
      area,
      startsAt,
      endsAt: startsAt + 3_600_000,
    })
  }

  for (const [title, kind, body] of [
    ['Ser vs estar', 'note', 'ser — what it is; estar — how it is now'],
    ['App idea: one-tap logs', 'idea', 'log anything in three seconds'],
    ['Atomic Habits', 'book', 'small wins, every day'],
    ['Half marathon plan', 'reference', '12 weeks, 4 runs a week'],
  ] as const)
    await ctx.db.insert('notes', { ownerId, title, kind, body, tags: [] })

  /* Money: three accounts, their balances, bills, pay and spends. */
  const account = (
    name: string,
    kinds: Array<'bank' | 'broker' | 'cash'>,
    order: number,
  ) =>
    ctx.db.insert('accounts', {
      ownerId,
      name,
      kinds,
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order,
    })
  const bank = await account('Bank', ['bank'], 0)
  const card = await account('Card', ['bank'], 1)
  const broker = await account('Broker', ['broker'], 2)
  for (const [id, value] of [
    [bank, 3420],
    [card, 388],
    [broker, 140],
  ] as const)
    await ctx.db.insert('stateSnapshots', {
      ownerId,
      area: 'money',
      key: `balance:${id}:EUR`,
      value,
      unit: 'eur',
      recordedAt: now - 2 * 3_600_000,
      source: 'typed',
    })
  await ctx.db.insert('fxRates', {
    ownerId,
    currency: 'USD',
    rate: 0.92,
    asOf: Math.floor(now / DAY) * DAY,
    fetchedAt: now,
    source: 'ECB',
  })

  const bills = []
  for (const b of BILLS)
    bills.push({
      ...b,
      id: await ctx.db.insert('recurring', {
        ownerId,
        name: b.name,
        kind: 'expense',
        amount: b.amount,
        category: b.category,
        accountId: bank,
        cadence: 'monthly',
        day: b.day,
      }),
    })
  for (let ago = DAYS; ago >= 1; ago--) {
    const date = new Date(now - ago * DAY)
    for (const b of bills)
      if (date.getUTCDate() === b.day)
        await ctx.db.insert('logs', {
          ownerId,
          kind: 'expense',
          area: 'money',
          occurredAt: at(ago, 10),
          value: b.amount,
          unit: 'eur',
          text: b.name,
          accountId: bank,
          meta: { merchant: b.name, category: b.category, recurringId: b.id },
        })
    if (date.getUTCDate() === 25)
      await ctx.db.insert('logs', {
        ownerId,
        kind: 'income',
        area: 'money',
        occurredAt: at(ago, 9),
        value: 2400,
        unit: 'eur',
        text: 'Salary',
        accountId: bank,
        meta: { merchant: 'Salary', category: 'salary' },
      })
    for (const [n, [merchant, category, value]] of SPENDS.entries())
      if ((ago + n * 3) % (n + 2) === 0)
        await ctx.db.insert('logs', {
          ownerId,
          kind: 'expense',
          area: 'money',
          occurredAt: at(ago, 12 + n),
          value: Math.round(value * (0.8 + ((ago * 13) % 5) / 10) * 100) / 100,
          unit: 'eur',
          text: merchant,
          accountId: n % 2 ? card : bank,
          meta: { merchant, category },
        })
  }

  /* Shares: real tickers, made-up buys. Their prices are the real
     closes, read by the price job (demo.ts), never made up here. */
  for (const s of SHARES) {
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId,
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
      currency: s.currency,
      type: s.type,
    })
    for (const [ago, shares, priceEur] of s.buys)
      await ctx.db.insert('trades', {
        ownerId,
        accountId: broker,
        instrumentId,
        side: 'buy',
        shares,
        priceEur,
        occurredAt: at(ago, 15),
      })
  }
  await rebuildLedgers(ctx, ownerId)
}
