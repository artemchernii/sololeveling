import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action } from '../_generated/server'
import { requireUser } from '../auth'
import { spark } from './movers'
import {
  lisbonDay,
  macroIn,
  parseCalendar,
  window7,
} from '../../src/lib/coming'
import type { Reporter } from '../../src/lib/coming'
import { moveOf } from '../../src/lib/insightsMarket'

/* COMING and MINE · THIS WEEK on MARKET (31 Oct, part 5 of
   market-world.html). `coming`: the seven days' rate decisions and US
   releases from their fixed lists, and Finnhub's earnings calendar, one
   call a day (the whole calendar stops at 1,500 rows). `heldWeek`: the
   held companies' closes over the week from Yahoo's spark. Both write
   nothing; canned on the test backend. */

const macro = v.object({
  kind: v.union(
    v.literal('fed'),
    v.literal('ecb'),
    v.literal('boe'),
    v.literal('cpi'),
    v.literal('jobs'),
  ),
  day: v.string(),
  time: v.string(),
  flag: v.union(v.literal('US'), v.literal('EU'), v.literal('GB')),
  source: v.string(),
})
const reporter = v.object({
  day: v.string(),
  symbol: v.string(),
  name: v.string(),
  domain: v.union(v.string(), v.null()),
  hour: v.union(v.literal('BEFORE OPEN'), v.literal('AFTER CLOSE'), v.null()),
  expected: v.union(v.number(), v.null()),
  held: v.boolean(),
})
const comingAnswer = v.object({
  fetchedAt: v.number(),
  days: v.array(v.string()),
  macro: v.array(macro),
  /** False when Finnhub gave no day: the rate and release chips stand. */
  reached: v.boolean(),
  reporters: v.array(reporter),
})
export type ComingAnswer = Infer<typeof comingAnswer>

const DAY = 86_400_000

export const coming = action({
  args: { held: v.array(v.object({ symbol: v.string(), name: v.string() })) },
  returns: comingAnswer,
  handler: async (ctx, args): Promise<ComingAnswer> => {
    await requireUser(ctx)
    const now = Date.now()
    const days = window7(lisbonDay(now))
    if (process.env.E2E === '1') return canned(days, args.held, now)
    const key = process.env.FINNHUB_API_KEY
    const answers = key
      ? await Promise.all(
          days.map(async (d) => {
            try {
              const res = await fetch(
                `https://finnhub.io/api/v1/calendar/earnings?from=${d}&to=${d}`,
                {
                  headers: { 'X-Finnhub-Token': key },
                  signal: AbortSignal.timeout(8000),
                },
              )
              return res.ok ? ((await res.json()) as unknown) : null
            } catch {
              return null
            }
          }),
        )
      : []
    const got = answers.filter((a) => a !== null)
    return {
      fetchedAt: now,
      days,
      macro: macroIn(days),
      reached: got.length > 0,
      reporters: got.flatMap((a) => parseCalendar(a, days, args.held)),
    }
  },
})

function canned(
  days: Array<string>,
  held: Array<{ symbol: string; name: string }>,
  now: number,
): ComingAnswer {
  const h = held.at(0)
  const reporters: Array<Reporter> = [
    {
      day: days[1],
      symbol: 'PLTR',
      name: 'Palantir',
      domain: 'palantir.com',
      hour: 'AFTER CLOSE',
      expected: 0.17,
      held: false,
    },
    {
      day: days[3],
      symbol: 'AMD',
      name: 'AMD',
      domain: 'amd.com',
      hour: 'AFTER CLOSE',
      expected: 1.16,
      held: false,
    },
    ...(h
      ? [
          {
            day: days[3],
            symbol: h.symbol,
            name: h.name,
            domain: null,
            hour: 'BEFORE OPEN' as const,
            expected: 0.98,
            held: true,
          },
        ]
      : []),
  ]
  return {
    fetchedAt: now,
    days,
    macro: [
      {
        kind: 'boe',
        day: days[2],
        time: '12:00',
        flag: 'GB',
        source: 'BANK OF ENGLAND',
      },
      { kind: 'jobs', day: days[4], time: '13:30', flag: 'US', source: 'BLS' },
      { kind: 'ecb', day: days[4], time: '13:15', flag: 'EU', source: 'ECB' },
    ],
    reached: true,
    reporters,
  }
}

const close = v.object({
  symbol: v.string(),
  base: v.number(),
  baseAt: v.number(),
  price: v.number(),
  at: v.number(),
  currency: v.union(v.string(), v.null()),
  change: v.number(),
})
const weekAnswer = v.object({
  fetchedAt: v.number(),
  reached: v.boolean(),
  closes: v.array(close),
})
export type HeldWeekAnswer = Infer<typeof weekAnswer>

/** Yahoo's spark gives closes, not currencies: by the symbol's suffix. */
const currencyOf = (s: string) =>
  /\.(AS|DE|PA|MI|MC)$/.test(s)
    ? 'EUR'
    : /\.L$/.test(s)
      ? 'GBP'
      : s.includes('.')
        ? null
        : 'USD'

export const heldWeek = action({
  args: { symbols: v.array(v.string()) },
  returns: weekAnswer,
  handler: async (ctx, args): Promise<HeldWeekAnswer> => {
    await requireUser(ctx)
    const now = Date.now()
    const symbols = args.symbols.slice(0, 40)
    if (process.env.E2E === '1') return cannedWeek(symbols, now)
    const series = symbols.length ? await spark(symbols) : new Map()
    const closes = symbols.flatMap((symbol) => {
      const s = series.get(symbol)
      const m = s ? moveOf(s, '1W', now) : null
      if (!m || m.baseAt === null) return []
      return [
        {
          symbol,
          base: m.base,
          baseAt: m.baseAt,
          price: m.price,
          at: m.at,
          currency: currencyOf(symbol),
          change: m.change,
        },
      ]
    })
    return { fetchedAt: now, reached: series.size > 0, closes }
  },
})

/* The test backend's week: the first held company down 13.9%, the
   second up 6.2%, the rest flat. */
function cannedWeek(symbols: Array<string>, now: number): HeldWeekAnswer {
  const moves = [-13.9, 6.2]
  return {
    fetchedAt: now,
    reached: true,
    closes: symbols.map((symbol, i) => {
      const change = moves[i] ?? 0.4
      return {
        symbol,
        base: 100,
        baseAt: now - 7 * DAY,
        price: Math.round((100 + change) * 100) / 100,
        at: now - 3_600_000,
        currency: 'USD',
        change,
      }
    }),
  }
}
