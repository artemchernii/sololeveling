import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { requireUser } from './auth'
import { upsertInstrument } from './invest'
import { notifyOwner } from './push'
import { mutation } from './write'
import { money } from '../src/lib/currency'
import { tickerOf } from '../src/lib/investAlert'
import { UNPRICED } from '../src/lib/market'
import { WATCH_MAX, factsOf, hitOf, sideOf, signOf } from '../src/lib/watch'
import type { WatchFacts } from '../src/lib/watch'

/* The watchlist (1 Nov, docs/specs/2026-11-01-watchlist.md, mockup
   watchlist.html). ★ puts a name here; while it is here the nightly
   check stores its closes like a held one's (market.readAll), and its
   alert is rung by the 21:30 job (closeReport.ringClose). The row's
   year — 52W, VS HIGH, SIGNAL — is read by `facts` when Portfolio
   opens, like MINE's calls: a year is ~250 closes a name. */

const DAY = 86_400_000
/** Enough of the newest closes for the day's change. */
const RECENT = 6

const side = v.union(v.literal('up'), v.literal('down'))
const close = v.object({ asOf: v.number(), price: v.number() })

const row = v.object({
  instrumentId: v.id('instruments'),
  symbol: v.string(),
  name: v.string(),
  type: v.string(),
  currency: v.string(),
  addedAt: v.number(),
  /** The newest stored closes, newest first. */
  closes: v.array(close),
  alert: v.union(v.null(), v.object({ at: v.number(), side })),
  hit: v.union(v.null(), close),
})

async function watchesOf(ctx: QueryCtx, ownerId: string) {
  return await ctx.db
    .query('watches')
    .withIndex('by_owner_instrument', (q) => q.eq('ownerId', ownerId))
    .take(WATCH_MAX + 1)
}

async function recent(
  ctx: QueryCtx,
  ownerId: string,
  instrumentId: Id<'instruments'>,
  n: number,
) {
  return (
    await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
      )
      .order('desc')
      .take(n)
  ).map((p) => ({ asOf: p.asOf, price: p.price }))
}

/** Every watched name with its newest closes, oldest added first. */
export const list = query({
  args: {},
  returns: v.array(row),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const out = []
    for (const w of await watchesOf(ctx, ownerId)) {
      const inst = await ctx.db.get(w.instrumentId)
      if (inst === null) continue
      out.push({
        instrumentId: w.instrumentId,
        symbol: inst.symbol,
        name: inst.name,
        type: inst.type,
        currency: inst.currency,
        addedAt: w.addedAt,
        closes: await recent(ctx, ownerId, w.instrumentId, RECENT),
        alert: w.alert ?? null,
        hit: w.hit ?? null,
      })
    }
    return out.sort((a, b) => a.addedAt - b.addedAt)
  },
})

const yearFacts = v.object({
  low: v.number(),
  high: v.number(),
  vsHigh: v.number(),
  call: v.union(
    v.literal('add'),
    v.literal('hold'),
    v.literal('wait'),
    v.null(),
  ),
  bull: v.number(),
  bear: v.number(),
})

/** Each name's year, read when the list opens: one query a name, as
    CLOSE reads a held share (closeReport.shareFacts). Writes nothing. */
export const facts = action({
  args: { ids: v.array(v.id('instruments')) },
  returns: v.array(
    v.object({
      instrumentId: v.id('instruments'),
      facts: v.union(v.null(), yearFacts),
    }),
  ),
  handler: async (
    ctx,
    { ids },
  ): Promise<
    Array<{ instrumentId: Id<'instruments'>; facts: WatchFacts | null }>
  > => {
    const ownerId = await requireUser(ctx)
    const now = Date.now()
    return await Promise.all(
      ids.slice(0, WATCH_MAX).map(async (id) => {
        const f = await ctx.runQuery(internal.closeReport.shareFacts, {
          ownerId,
          id,
          now,
        })
        return {
          instrumentId: id,
          facts: f && factsOf(f.closes, f.reading, now),
        }
      }),
    )
  },
})

const candidate = v.object({
  symbol: v.string(),
  name: v.string(),
  exchange: v.string(),
  type: v.string(),
})

/** ★: a name on the list. Its year is read at once, so the row has its
    numbers; a name already there stays one row. */
export const add = mutation({
  args: { candidate },
  returns: v.id('instruments'),
  handler: async (ctx, { candidate: c }) => {
    const ownerId = await requireUser(ctx)
    if (c.type === UNPRICED) throw new ConvexError('WATCH_NO_PRICE')
    const had = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', ownerId).eq('symbol', c.symbol.trim()),
      )
      .first()
    const id = had?._id ?? (await upsertInstrument(ctx, ownerId, c))
    const all = await watchesOf(ctx, ownerId)
    if (all.some((w) => w.instrumentId === id)) return id
    if (all.length >= WATCH_MAX) throw new ConvexError('WATCH_FULL')
    await ctx.db.insert('watches', {
      ownerId,
      instrumentId: id,
      addedAt: Date.now(),
    })
    /* A ticker it already knew (one sold) may have stopped being read:
       its year again, which stores only the days missing. A new one is
       read by upsertInstrument. */
    if (had !== null)
      await ctx.scheduler.runAfter(0, internal.market.readOne, {
        instrumentId: id,
      })
    return id
  },
})

async function mine(
  ctx: QueryCtx,
  ownerId: string,
  instrumentId: Id<'instruments'>,
) {
  return await ctx.db
    .query('watches')
    .withIndex('by_owner_instrument', (q) =>
      q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
    )
    .unique()
}

/** ★ again: off the list. Its stored closes stay, as a sold one's do. */
export const remove = mutation({
  args: { instrumentId: v.id('instruments') },
  returns: v.null(),
  handler: async (ctx, { instrumentId }) => {
    const ownerId = await requireUser(ctx)
    const w = await mine(ctx, ownerId, instrumentId)
    if (w !== null) await ctx.db.delete(w._id)
    return null
  },
})

/** 🔔: his price. Above the newest close it waits for a rise, below it
    for a fall; a new price clears a hit. */
export const setAlert = mutation({
  args: { instrumentId: v.id('instruments'), at: v.number() },
  returns: side,
  handler: async (ctx, { instrumentId, at }) => {
    const ownerId = await requireUser(ctx)
    if (!Number.isFinite(at) || at <= 0 || at > 1e7)
      throw new ConvexError('WATCH_PRICE')
    const w = await mine(ctx, ownerId, instrumentId)
    if (w === null) throw new ConvexError('NOT_WATCHED')
    const [last] = await recent(ctx, ownerId, instrumentId, 1)
    if (last === undefined) throw new ConvexError('WATCH_NO_PRICE')
    const s = sideOf(last.price, at)
    await ctx.db.patch(w._id, { alert: { at, side: s }, hit: undefined })
    return s
  },
})

export const clearAlert = mutation({
  args: { instrumentId: v.id('instruments') },
  returns: v.null(),
  handler: async (ctx, { instrumentId }) => {
    const ownerId = await requireUser(ctx)
    const w = await mine(ctx, ownerId, instrumentId)
    if (w !== null)
      await ctx.db.patch(w._id, { alert: undefined, hit: undefined })
    return null
  },
})

/** What the nightly check reads besides what is held. */
export const ids = internalQuery({
  args: { ownerId: v.string() },
  returns: v.array(v.id('instruments')),
  handler: async (ctx, { ownerId }) =>
    (await watchesOf(ctx, ownerId)).map((w) => w.instrumentId),
})

/** After the 21:30 prices: each alert the newest stored close reached
    rings once — its own push, the close before it beside it. */
export const ringHits = internalMutation({
  args: { ownerId: v.string() },
  returns: v.number(),
  handler: async (ctx, { ownerId }) => await ringFor(ctx, ownerId),
})

export async function ringFor(ctx: MutationCtx, ownerId: string) {
  let rung = 0
  for (const w of await watchesOf(ctx, ownerId)) {
    if (w.alert === undefined || w.hit !== undefined) continue
    const [last, ...older] = await recent(ctx, ownerId, w.instrumentId, RECENT)
    if (last === undefined || !hitOf(w.alert, last.price)) continue
    const inst = await ctx.db.get(w.instrumentId)
    if (inst === null) continue
    await ctx.db.patch(w._id, { hit: last })
    const day = Math.floor(last.asOf / DAY)
    const before = older.find((c) => Math.floor(c.asOf / DAY) < day)
    const say = (n: number) => money(n, inst.currency || 'EUR')
    const on = new Date(last.asOf)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      .toUpperCase()
    await notifyOwner(ctx, {
      ownerId,
      kind: 'watch_hit',
      title: `🔔 ${tickerOf(inst.symbol)} · CLOSE ${say(last.price)} ${signOf(w.alert.side)} ${say(w.alert.at)}`,
      body: before ? `${on} · PREV CLOSE ${say(before.price)}` : on,
      url: '/finances?room=portfolio#watchlist',
      tag: `watch:${w.instrumentId}:${last.asOf}`,
    })
    rung++
  }
  return rung
}
