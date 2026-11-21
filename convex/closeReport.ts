import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from './_generated/api'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import type { ActionCtx, MutationCtx } from './_generated/server'
import { requireUser } from './auth'
import { UA } from './fundamentals'
import { cannedEarnings, earningsOf } from './insightsMine'
import { notifyOwner } from './push'
import { UNPRICED } from '../src/lib/market'
import { kindOf } from '../src/lib/logo'
import {
  bigDay,
  callTurn,
  closePush,
  earnSoon,
  nextEvening,
  reported,
} from '../src/lib/investAlert'
import type { Moment } from '../src/lib/investAlert'
import { dayStart } from '../src/lib/remindAt'
import { parseNews } from '../src/lib/yahooFundamentals'

/* CLOSE (22 Oct; spec docs/specs/2026-10-22-n3-investment-alerts.md,
   CLAUDE.md "CLOSE, the day's report"). One job per owner at 21:30
   Lisbon: today's prices for the shares held, then one push — the day's
   change of worth and the moments of the shares (src/lib/investAlert).
   The tab reads the same moments on open; nothing here is stored. */

const DAY = 86_400_000
const MAX_TODAY = 30

const call = v.union(v.literal('add'), v.literal('hold'), v.literal('wait'))
const close = v.object({ asOf: v.number(), price: v.number() })
export const moment = v.union(
  v.object({ kind: v.literal('big'), pct: v.number() }),
  v.object({
    kind: v.literal('call'),
    was: call,
    now: call,
    why: v.array(v.string()),
  }),
  v.object({ kind: v.literal('soon'), at: v.number() }),
  v.object({
    kind: v.literal('reported'),
    pct: v.number(),
    from: close,
    to: close,
  }),
)
const moments = v.array(
  v.object({ instrumentId: v.id('instruments'), moments: v.array(moment) }),
)
type Moments = Infer<typeof moments>

/** One held share's year of closes and latest reading — one query each,
    like MINE's `callFor`: a year of closes is ~250 rows. */
export const shareFacts = internalQuery({
  args: { ownerId: v.string(), id: v.id('instruments'), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      symbol: v.string(),
      name: v.string(),
      type: v.string(),
      closes: v.array(close),
      reading: v.union(
        v.null(),
        v.object({
          asOf: v.number(),
          targetMean: v.optional(v.number()),
          revenueGrowth: v.optional(v.number()),
          ratingMean: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { ownerId, id, now }) => {
    const inst = await ctx.db.get(id)
    if (inst === null || inst.ownerId !== ownerId) return null
    if (inst.type === UNPRICED) return null
    const rows = await ctx.db
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
    return {
      symbol: inst.symbol,
      name: inst.name,
      type: inst.type,
      closes: rows.map((r) => ({ asOf: r.asOf, price: r.price })),
      reading: f && {
        asOf: f.asOf,
        targetMean: f.target?.mean,
        revenueGrowth: f.revenueGrowth,
        ratingMean: f.rating?.mean,
      },
    }
  },
})

/** The moments of every share held now: results days fetched from Yahoo
    (never stored), the rest from stored closes. */
async function momentsOf(
  ctx: ActionCtx,
  ownerId: string,
  now: number,
): Promise<Moments> {
  const held = await ctx.runQuery(internal.aggregate.heldInstruments, {
    ownerId,
  })
  const shares = (
    await Promise.all(
      held.map(async (id) => {
        const f = await ctx.runQuery(internal.closeReport.shareFacts, {
          ownerId,
          id,
          now,
        })
        return f && { id, ...f }
      }),
    )
  ).flatMap((f) => (f === null ? [] : [f]))
  const companies = shares.filter((s) => kindOf(s) === 'stock')
  const earnings = await (
    process.env.E2E === '1'
      ? cannedEarnings(companies, now)
      : earningsOf(companies, now)
  ).catch(() => null)
  const days = new Map((earnings?.rows ?? []).map((e) => [e.symbol, e]))
  return shares.map((s) => {
    const out: Array<Moment> = []
    const b = bigDay(s.closes, now)
    if (b) out.push({ kind: 'big', pct: b.pct })
    const t = callTurn(s.closes, s.reading, now)
    if (t) out.push({ kind: 'call', ...t })
    const e = days.get(s.symbol)
    const r = reported(s.closes, e?.last ?? null, now)
    if (r) out.push({ kind: 'reported', ...r })
    if (e && e.next !== null && earnSoon(e.next, now))
      out.push({ kind: 'soon', at: e.next })
    return { instrumentId: s.id, moments: out }
  })
}

/** CLOSE's badges, read when the tab opens. */
export const badges = action({
  args: {},
  returns: moments,
  handler: async (ctx): Promise<Moments> =>
    await momentsOf(ctx, await requireUser(ctx), Date.now()),
})

const headline = v.object({
  title: v.string(),
  publisher: v.string(),
  at: v.number(),
  link: v.string(),
})

/** MARKET · TODAY's two headlines: Yahoo's news on the S&P 500. */
export const marketNews = action({
  args: {},
  returns: v.object({ at: v.number(), items: v.array(headline) }),
  handler: async (ctx) => {
    await requireUser(ctx)
    const at = Date.now()
    if (process.env.E2E === '1')
      return {
        at,
        items: [
          ['Reuters', 'Stocks slip as Treasury yields climb'],
          ['Bloomberg', 'Oil rises after OPEC signals deeper cuts'],
        ].map(([publisher, title], i) => ({
          title,
          publisher,
          at: at - (i + 1) * 3_600_000,
          link: `https://finance.yahoo.com/news/e2e-market-${i + 1}.html`,
        })),
      }
    const res = await fetch(
      'https://query2.finance.yahoo.com/v1/finance/search?q=%5EGSPC&quotesCount=0&newsCount=2',
      { headers: { 'User-Agent': UA } },
    )
    if (!res.ok) throw new Error(`Yahoo said ${res.status}`)
    return { at, items: parseNews(await res.json(), 2) }
  },
})

/** Start the owner's 21:30 job, or keep the one there. Never two. */
export async function keepEvening(ctx: MutationCtx, ownerId: string) {
  const at = nextEvening(Date.now())
  const row = await ctx.db
    .query('closeJobs')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .unique()
  if (row !== null) {
    const job = await ctx.db.system.get(row.jobId)
    const pending = job?.state.kind === 'pending'
    if (pending && row.at === at) return
    if (pending) await ctx.scheduler.cancel(row.jobId)
  }
  const jobId = await ctx.scheduler.runAt(at, internal.closeReport.evening, {
    ownerId,
    read: true,
  })
  if (row === null) await ctx.db.insert('closeJobs', { ownerId, jobId, at })
  else await ctx.db.patch(row._id, { jobId, at })
}

/** Once after the deploy: a job for every owner with a device on. */
export const startAll = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const owners = new Set(
      (await ctx.db.query('pushSubscriptions').take(200)).map((s) => s.ownerId),
    )
    for (const ownerId of owners) await keepEvening(ctx, ownerId)
    return owners.size
  },
})

export const evening = internalAction({
  args: { ownerId: v.string(), read: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { ownerId, read }) => {
    await ringClose(ctx, ownerId, read)
    return null
  },
})

/** Today's prices, then the push. `read` false: the test backend's own
    prices stand. */
export async function ringClose(
  ctx: ActionCtx,
  ownerId: string,
  read: boolean,
) {
  try {
    if (read)
      await ctx.runAction(internal.market.readAll, {
        pricesOnly: true,
        ownerId,
      })
  } catch {
    /* Yahoo not reached: the last stored prices decide. */
  }
  const now = Date.now()
  const day = await ctx.runQuery(internal.aggregate.dayCloseFor, {
    ownerId,
    since: dayStart(now),
  })
  /* No price today (a weekend, a holiday): nothing to say. */
  const words = day.traded
    ? closePush(
        day,
        await momentsOf(ctx, ownerId, now).then((ms) =>
          day.rows.map((r) => ({
            symbol: r.symbol,
            pct:
              r.was !== null && r.price !== null && r.was > 0
                ? ((r.price - r.was) / r.was) * 100
                : null,
            moments:
              ms.find((m) => m.instrumentId === r.instrumentId)?.moments ?? [],
          })),
        ),
      )
    : null
  await ctx.runMutation(internal.closeReport.send, {
    ownerId,
    words: words ?? undefined,
  })
  /* The watchlist's alerts, each its own push (1 Nov). */
  await ctx.runMutation(internal.watch.ringHits, { ownerId })
}

/** The bell's row and the push — once a day — then tomorrow's job. */
export const send = internalMutation({
  args: {
    ownerId: v.string(),
    words: v.optional(v.object({ title: v.string(), body: v.string() })),
  },
  returns: v.boolean(),
  handler: async (ctx, { ownerId, words }) => {
    await keepEvening(ctx, ownerId)
    if (words === undefined) return false
    const today = await ctx.db
      .query('notifications')
      .withIndex('by_owner_and_sent', (q) =>
        q.eq('ownerId', ownerId).gte('sentAt', dayStart(Date.now())),
      )
      .take(MAX_TODAY)
    if (today.some((n) => n.kind === 'day_close')) return false
    await notifyOwner(ctx, {
      ownerId,
      kind: 'day_close',
      ...words,
      url: '/finances?room=insights#close',
      tag: `close:${dayStart(Date.now())}`,
    })
    return true
  },
})
