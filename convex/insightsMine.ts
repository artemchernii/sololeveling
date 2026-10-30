import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalQuery } from './_generated/server'
import { requireUser } from './auth'
import { UA, crumb } from './fundamentals'
import { PRICE_SOURCE, UNPRICED } from '../src/lib/market'
import {
  PERIODS,
  PERIOD_FETCH,
  moveOf,
  parseSpark,
} from '../src/lib/insightsMarket'
import type { Period, Series } from '../src/lib/insightsMarket'
import { callOf, parseOpened } from '../src/lib/insightsMine'
import type { Opened } from '../src/lib/insightsMine'
import {
  BACK_DAYS,
  parseCalendar,
  parseQuotes,
  pickDays,
  sinceReport,
} from '../src/lib/insightsEarnings'
import type { Earning } from '../src/lib/insightsEarnings'
import { kindOf } from '../src/lib/logo'

/* Insights, band 3 MINE (19 Oct, spec I2). One action, asked when the
   room opens and once for each period not yet seen, for the positions
   the page already has from Portfolio's own query:
   - each position's move over the period, fetched from Yahoo;
   - on the first ask only, each position's Portfolio verdict, worked
     out from its stored closes and fundamentals by the same functions
     its page uses, and what Yahoo opens up of each fund and share
     (sector weights, top holdings, a share's sector and country), with
     IWDA's for the world;
   - on the first ask too, each share's next and last results day, and
     for a report in the last 7 days the close before it and the price
     now (22 Oct, earnings on MINE).
   It writes nothing ("DONT SAVE IT TO DB"). */

const DAY = 86_400_000
const WORLD = 'IWDA.AS'
const MAX = 60

const period = v.union(...PERIODS.map((p) => v.literal(p)))
const call = v.union(
  v.literal('add'),
  v.literal('hold'),
  v.literal('wait'),
  v.null(),
)
const opened = v.union(
  v.null(),
  v.object({
    sectors: v.union(v.null(), v.record(v.string(), v.number())),
    top: v.array(
      v.object({ symbol: v.string(), name: v.string(), pct: v.number() }),
    ),
    sector: v.union(v.null(), v.string()),
    country: v.union(v.null(), v.string()),
  }),
)
const item = v.object({
  instrumentId: v.id('instruments'),
  symbol: v.string(),
  type: v.string(),
  name: v.string(),
})

const atPrice = v.union(
  v.null(),
  v.object({ at: v.number(), price: v.number() }),
)
const earning = v.object({
  symbol: v.string(),
  next: v.union(v.number(), v.null()),
  estimate: v.boolean(),
  last: v.union(v.number(), v.null()),
  base: atPrice,
  now: atPrice,
  currency: v.union(v.string(), v.null()),
})

export const answer = v.object({
  period,
  fetchedAt: v.number(),
  priceSource: v.string(),
  changes: v.array(
    v.object({ symbol: v.string(), change: v.union(v.number(), v.null()) }),
  ),
  calls: v.union(
    v.null(),
    v.array(v.object({ instrumentId: v.id('instruments'), call })),
  ),
  opened: v.union(
    v.null(),
    v.object({
      parts: v.array(v.object({ symbol: v.string(), opened })),
      world: opened,
    }),
  ),
  /** Null on a later ask; `reached` false when Yahoo gave no dates. */
  earnings: v.union(
    v.null(),
    v.object({ reached: v.boolean(), rows: v.array(earning) }),
  ),
})
export type MineAnswer = Infer<typeof answer>

export const mine = action({
  args: { period, items: v.array(item), first: v.boolean() },
  returns: answer,
  handler: async (ctx, args): Promise<MineAnswer> => {
    const ownerId = await requireUser(ctx)
    const items = args.items.slice(0, MAX)
    const now = Date.now()
    const calls = args.first
      ? /* One query per position: a year of closes is ~250 rows, and
           fifteen in one query pass its 4,096-read limit. */
        (
          await Promise.all(
            items.map((i) =>
              ctx.runQuery(internal.insightsMine.callFor, {
                ownerId,
                id: i.instrumentId,
                now,
              }),
            ),
          )
        ).flatMap((c) => (c === null ? [] : [c]))
      : null
    const priced = items.filter((i) => i.type !== UNPRICED)
    const lookThrough = priced.filter((i) => {
      const k = kindOf(i)
      return k === 'etf' || k === 'stock'
    })
    const shares = priced.filter((i) => kindOf(i) === 'stock')
    const e2e = process.env.E2E === '1'
    const [series, opens, earnings] = await Promise.all([
      e2e ? canned(args.period, priced, now) : spark(args.period, priced),
      args.first
        ? e2e
          ? cannedOpened(lookThrough)
          : openUp([...lookThrough.map((i) => i.symbol), WORLD])
        : null,
      args.first
        ? e2e
          ? cannedEarnings(shares, now)
          : earningsOf(shares, now)
        : null,
    ])
    return {
      period: args.period,
      fetchedAt: now,
      priceSource: PRICE_SOURCE,
      changes: priced.map((i) => {
        const s = series.get(i.symbol)
        return {
          symbol: i.symbol,
          change: s ? (moveOf(s, args.period, now)?.change ?? null) : null,
        }
      }),
      calls,
      opened: opens && {
        parts: lookThrough.map((i) => ({
          symbol: i.symbol,
          opened: opens.get(i.symbol) ?? null,
        })),
        world: opens.get(WORLD) ?? null,
      },
      earnings,
    }
  },
})

/**
 * Each position's verdict, as its page works it out (src/lib/insightsMine
 * `callOf`): the stored closes of the last 366 days and, for a share,
 * the latest stored fundamentals. Only the owner's instruments.
 */
export const callFor = internalQuery({
  args: { ownerId: v.string(), id: v.id('instruments'), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({ instrumentId: v.id('instruments'), call }),
  ),
  handler: async (ctx, { ownerId, id, now }) => {
    const inst = await ctx.db.get(id)
    if (inst === null || inst.ownerId !== ownerId) return null
    if (inst.type === UNPRICED) return { instrumentId: id, call: null }
    const closes = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('instrumentId', id)
          .gte('asOf', now - 366 * DAY),
      )
      .take(400)
    const f =
      inst.type === 'EQUITY'
        ? await ctx.db
            .query('fundamentals')
            .withIndex('by_owner_instrument_asOf', (q) =>
              q.eq('ownerId', ownerId).eq('instrumentId', id),
            )
            .order('desc')
            .first()
        : null
    const reading = f && {
      asOf: f.asOf,
      targetMean: f.target?.mean,
      revenueGrowth: f.revenueGrowth,
      ratingMean: f.rating?.mean,
    }
    return { instrumentId: id, call: callOf(closes, reading, now) }
  },
})

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function spark(p: Period, items: ReadonlyArray<{ symbol: string }>) {
  const { range, interval } = PERIOD_FETCH[p]
  const symbols = items.map((i) => i.symbol)
  const parts = await Promise.all(
    Array.from({ length: Math.ceil(symbols.length / 20) }, (_, k) =>
      getJson(
        `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols
          .slice(k * 20, k * 20 + 20)
          .map(encodeURIComponent)
          .join(',')}&range=${range}&interval=${interval}`,
        { headers: { 'User-Agent': UA } },
      ),
    ),
  )
  return new Map(parts.flatMap((j) => [...parseSpark(j)]))
}

/** Yahoo's topHoldings and assetProfile, one quoteSummary a symbol. */
async function openUp(symbols: Array<string>): Promise<Map<string, Opened>> {
  const out = new Map<string, Opened>()
  const auth = await crumb().catch(() => null)
  if (auth === null) return out
  await Promise.all(
    symbols.map(async (s) => {
      const o = parseOpened(
        await getJson(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s)}?modules=topHoldings,assetProfile&crumb=${encodeURIComponent(auth.crumb)}`,
          { headers: { 'User-Agent': UA, Cookie: auth.cookie } },
        ),
      )
      if (o) out.set(s, o)
    }),
  )
  return out
}

/**
 * Each share's results days: Yahoo's quote (the last and the next
 * window) and quoteSummary `calendarEvents` (the next, and whether it is
 * a guess). A report in the last 7 days also gets a month of daily
 * closes, for the close before it and the price now.
 */
export async function earningsOf(
  shares: ReadonlyArray<{ symbol: string }>,
  now: number,
): Promise<{ reached: boolean; rows: Array<Earning> } | null> {
  if (shares.length === 0) return null
  const auth = await crumb().catch(() => null)
  if (auth === null) return { reached: false, rows: [] }
  const symbols = shares.map((s) => s.symbol)
  const init = { headers: { 'User-Agent': UA, Cookie: auth.cookie } }
  const [quotes, calendars] = await Promise.all([
    getJson(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(encodeURIComponent).join(',')}&fields=earningsTimestamp,earningsTimestampStart,earningsTimestampEnd,isEarningsDateEstimate,currency&crumb=${encodeURIComponent(auth.crumb)}`,
      init,
    ).then(parseQuotes),
    Promise.all(
      symbols.map(async (s) =>
        parseCalendar(
          await getJson(
            `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s)}?modules=calendarEvents&crumb=${encodeURIComponent(auth.crumb)}`,
            init,
          ),
        ),
      ),
    ),
  ])
  const rows = symbols.map((symbol, k): Earning => {
    const q = quotes.get(symbol)
    const c = calendars[k]
    const { next, last } = pickDays(
      [...(q?.times ?? []), ...(c?.times ?? [])],
      now,
    )
    return {
      symbol,
      next,
      estimate: c?.estimate ?? q?.estimate ?? false,
      last,
      base: null,
      now: null,
      currency: q?.currency ?? null,
    }
  })
  if (rows.every((r) => r.next === null && r.last === null))
    return { reached: false, rows: [] }
  const recent = rows.filter(
    (r) => r.last !== null && now - r.last <= (BACK_DAYS + 1) * DAY,
  )
  if (recent.length > 0) {
    const daily = await spark('1M', recent)
    for (const r of recent) {
      const s = daily.get(r.symbol)
      const since = s && r.last !== null ? sinceReport(s.points, r.last) : null
      if (since) Object.assign(r, since)
    }
  }
  return { reached: true, rows }
}

/* The test backend (E2E=1): a move per symbol from its letters, larger
   for longer periods, a moment late so READING is seen; a fund named
   VUAA opened up, shares as Yahoo profiles them, and IWDA's weights. */
async function canned(
  p: Period,
  items: ReadonlyArray<{ symbol: string }>,
  now: number,
) {
  await new Promise((r) => setTimeout(r, 800))
  const scale = { '1D': 0.12, '1W': 0.4, '1M': 1, '3M': 2.5, '1Y': 4 }[p]
  const out = new Map<string, Series>()
  for (const { symbol } of items) {
    const code = [...symbol].reduce((t, c) => t + c.charCodeAt(0), 0)
    const month = ((code % 120) - 40) / 10
    const base = 100
    const price = base * (1 + (month * scale) / 100)
    out.set(symbol, {
      previousClose: base,
      points: [
        { t: now - 400 * DAY, v: base },
        { t: now, v: price },
      ],
    })
  }
  return out
}

/* AVGO reported yesterday after the close and fell 7.8%; NVDA reports in
   five days; any other share has nothing near. */
export async function cannedEarnings(
  shares: ReadonlyArray<{ symbol: string }>,
  now: number,
): Promise<{ reached: boolean; rows: Array<Earning> } | null> {
  if (shares.length === 0) return null
  const today = Math.floor(now / DAY) * DAY
  return {
    reached: true,
    rows: shares.map(({ symbol }): Earning => {
      const none = {
        symbol,
        next: today + 60 * DAY,
        estimate: true,
        last: today - 50 * DAY,
        base: null,
        now: null,
        currency: 'USD',
      }
      if (symbol === 'AVGO')
        return {
          ...none,
          last: today - DAY + 20 * 3_600_000,
          base: { at: today - DAY + 13.5 * 3_600_000, price: 340.5 },
          now: { at: today + 13.5 * 3_600_000, price: 313.94 },
        }
      if (symbol === 'NVDA')
        return {
          ...none,
          next: today + 5 * DAY + 20 * 3_600_000,
          estimate: false,
        }
      return none
    }),
  }
}

async function cannedOpened(items: ReadonlyArray<{ symbol: string }>) {
  const share = (sector: string, country: string): Opened => ({
    sectors: null,
    top: [],
    sector,
    country,
  })
  const known: Partial<Record<string, Opened>> = {
    'VUAA.L': {
      sectors: { technology: 0.33, healthcare: 0.09, financial_services: 0.13 },
      top: [
        { symbol: 'NVDA', name: 'NVIDIA', pct: 0.074 },
        { symbol: 'MSFT', name: 'Microsoft', pct: 0.066 },
      ],
      sector: null,
      country: null,
    },
    AVGO: share('Technology', 'United States'),
    NVDA: share('Technology', 'United States'),
    [WORLD]: {
      sectors: { technology: 0.26, healthcare: 0.1 },
      top: [],
      sector: null,
      country: null,
    },
  }
  return new Map(
    [...items.map((i) => i.symbol), WORLD].flatMap((s) => {
      const o = known[s]
      return o ? [[s, o] as const] : []
    }),
  )
}
