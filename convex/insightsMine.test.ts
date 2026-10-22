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
  /* Earnings for shares only: AVGO reported with both prices, NVDA next. */
  expect(a.earnings?.reached).toBe(true)
  expect(a.earnings?.rows.map((r) => r.symbol)).toEqual([
    'AVGO',
    'NVDA',
    'MSFT',
  ])
  const avgo = a.earnings?.rows[0]
  expect(avgo?.base?.price).toBe(340.5)
  expect(avgo?.now?.price).toBe(313.94)
  expect(a.earnings?.rows[1].next).toBeGreaterThan(Date.now())
  expect(await count(t)).toBe(before)

  /* A later period: the moves alone. */
  const b = await me.action(api.insightsMine.mine, {
    period: '1Y',
    first: false,
    items: [item(add, 'AVGO')],
  })
  expect(b.calls).toBeNull()
  expect(b.opened).toBeNull()
  expect(b.earnings).toBeNull()
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

/* Yahoo answering: the quote gives NFLX's last report (yesterday after
   the close) and the calendar its next; a month of closes gives the
   close before it and the price now. A fund gets no earnings ask. */
test('earnings from Yahoo: the last report with both prices, the next', async () => {
  const day = (d: number) => Math.floor(Date.now() / DAY) * DAY - d * DAY
  const report = day(1) + 20 * 3_600_000
  const asked: Array<string> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url)
      const json = (j: unknown) => new Response(JSON.stringify(j))
      if (url.startsWith('https://fc.yahoo.com'))
        return new Response('', { headers: { 'set-cookie': 'A3=x; path=/' } })
      if (url.includes('getcrumb')) return new Response('crumb1')
      if (url.includes('/v7/finance/quote'))
        return json({
          quoteResponse: {
            result: [
              {
                symbol: 'NFLX',
                currency: 'USD',
                earningsTimestamp: report / 1000,
              },
            ],
          },
        })
      if (url.includes('modules=calendarEvents'))
        return json({
          quoteSummary: {
            result: [
              {
                calendarEvents: {
                  earnings: {
                    earningsDate: [{ raw: (day(-80) + 20 * 3_600_000) / 1000 }],
                    isEarningsDateEstimate: true,
                  },
                },
              },
            ],
          },
        })
      if (url.includes('/spark'))
        return json({
          NFLX: {
            timestamp: [3, 2, 1, 0].map(
              (d) => (day(d) + 13.5 * 3_600_000) / 1000,
            ),
            close: [1190, 1200, 1212.4, 1120],
            chartPreviousClose: 1190,
          },
        })
      return json({})
    }),
  )
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const nflx = await seed(t, ME, 'NFLX', 'hold')
  const fund = await seed(t, ME, 'VUAA.L', 'hold')
  const a = await me.action(api.insightsMine.mine, {
    period: '1D',
    first: true,
    items: [
      { instrumentId: nflx, symbol: 'NFLX', type: 'EQUITY', name: 'Netflix' },
      { instrumentId: fund, symbol: 'VUAA.L', type: 'ETF', name: 'S&P 500' },
    ],
  })
  expect(a.earnings).toEqual({
    reached: true,
    rows: [
      {
        symbol: 'NFLX',
        next: day(-80) + 20 * 3_600_000,
        estimate: true,
        last: report,
        base: { at: day(1) + 13.5 * 3_600_000, price: 1212.4 },
        now: { at: day(0) + 13.5 * 3_600_000, price: 1120 },
        currency: 'USD',
      },
    ],
  })
  expect(asked.some((u) => u.includes('quote?symbols=NFLX&'))).toBe(true)
  expect(
    asked.some((u) => u.includes('calendarEvents') && u.includes('VUAA')),
  ).toBe(false)
})

test('earnings not reached: no dates, the rest of the answer stands', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Too Many Requests', { status: 429 })),
  )
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const nflx = await seed(t, ME, 'NFLX', 'hold')
  const a = await me.action(api.insightsMine.mine, {
    period: '1M',
    first: true,
    items: [
      { instrumentId: nflx, symbol: 'NFLX', type: 'EQUITY', name: 'Netflix' },
    ],
  })
  expect(a.earnings).toEqual({ reached: false, rows: [] })
  expect(a.calls).toEqual([{ instrumentId: nflx, call: 'hold' }])
})
