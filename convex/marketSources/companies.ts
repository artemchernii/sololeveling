import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action } from '../_generated/server'
import { requireUser } from '../auth'
import {
  COMPANIES_SOURCE,
  MAX_COMPANIES,
  hasNews,
  parseAnalysts,
  parseEarnings,
  parseInsiders,
} from '../../src/lib/companies'
import type { CompanyRow } from '../../src/lib/companies'

/* YOUR COMPANIES: when MARKET opens, the page sends the held companies
   (biggest first, at most twelve) and this asks Finnhub for the earnings
   calendar once and, per company, the analysts' counts and the insider
   trades — 25 calls at most, under the free key's 60 a minute. Nothing
   is stored. No key or no answer → `reached: false`, the tile alone says
   so. Canned on the test backend. */

const count = v.object({
  month: v.string(),
  buy: v.number(),
  hold: v.number(),
  sell: v.number(),
})
const row = v.object({
  symbol: v.string(),
  name: v.string(),
  valueEur: v.union(v.number(), v.null()),
  results: v.union(
    v.object({
      day: v.string(),
      actual: v.union(v.number(), v.null()),
      expected: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  analysts: v.union(
    v.object({ now: count, was: v.union(count, v.null()) }),
    v.null(),
  ),
  insider: v.union(
    v.object({
      who: v.string(),
      side: v.union(v.literal('BUY'), v.literal('SELL')),
      usd: v.number(),
      day: v.string(),
    }),
    v.null(),
  ),
})
const answer = v.object({
  source: v.string(),
  fetchedAt: v.number(),
  reached: v.boolean(),
  rows: v.array(row),
})
type Answer = Infer<typeof answer>

const DAY = 86_400_000
const day = (t: number) => new Date(t).toISOString().slice(0, 10)

export const companies = action({
  args: {
    held: v.array(
      v.object({
        symbol: v.string(),
        name: v.string(),
        valueEur: v.union(v.number(), v.null()),
      }),
    ),
  },
  returns: answer,
  handler: async (ctx, args): Promise<Answer> => {
    await requireUser(ctx)
    const now = Date.now()
    const held = args.held.slice(0, MAX_COMPANIES)
    if (process.env.E2E === '1') return canned(held, now)
    const key = process.env.FINNHUB_API_KEY
    const none = {
      source: COMPANIES_SOURCE,
      fetchedAt: now,
      reached: false,
      rows: [],
    }
    if (!key || held.length === 0) return none
    const get = async (path: string): Promise<unknown> => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/${path}`, {
          headers: { 'X-Finnhub-Token': key },
          signal: AbortSignal.timeout(8000),
        })
        return res.ok ? await res.json() : null
      } catch {
        return null
      }
    }
    const since = day(now - 14 * DAY)
    const [calendar, ...per] = await Promise.all([
      get(
        `calendar/earnings?from=${day(now - 7 * DAY)}&to=${day(now + 14 * DAY)}`,
      ),
      ...held.flatMap((h) => [
        get(`stock/recommendation?symbol=${encodeURIComponent(h.symbol)}`),
        get(
          `stock/insider-transactions?symbol=${encodeURIComponent(h.symbol)}&from=${since}`,
        ),
      ]),
    ])
    if (calendar === null && per.every((x) => x === null)) return none
    const results = parseEarnings(calendar, new Set(held.map((h) => h.symbol)))
    const rows: Array<CompanyRow> = held.map((h, i) => ({
      ...h,
      results: results.get(h.symbol) ?? null,
      analysts: parseAnalysts(per[i * 2]),
      insider: parseInsiders(per[i * 2 + 1], since),
    }))
    return {
      source: COMPANIES_SOURCE,
      fetchedAt: now,
      reached: true,
      rows: rows.filter(hasNews),
    }
  },
})

function canned(
  held: Array<{ symbol: string; name: string; valueEur: number | null }>,
  now: number,
): Answer {
  const at = (d: number) => day(now + d * DAY)
  const rows: Array<CompanyRow> = held.slice(0, 3).map((h, i) => ({
    ...h,
    results:
      i === 2
        ? { day: at(20), actual: null, expected: 1.2 }
        : {
            day: at(-2 - i),
            actual: i === 0 ? 2.31 : 6.03,
            expected: i === 0 ? 2.1 : 6.7,
          },
    analysts: {
      now: { month: at(0).slice(0, 7), buy: 48 + i, hold: 9 - i, sell: 0 },
      was: { month: at(-31).slice(0, 7), buy: 51, hold: 6, sell: 1 },
    },
    insider:
      i === 0
        ? {
            who: 'Chief Financial Officer',
            side: 'SELL',
            usd: 4_200_000,
            day: at(-3),
          }
        : null,
  }))
  return { source: COMPANIES_SOURCE, fetchedAt: now, reached: true, rows }
}
