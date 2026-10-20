import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { requireUser } from './auth'
import {
  marketFact,
  marketReadBody,
  payer,
  readStamp,
} from './marketReadFields'
import schema from './schema'
import {
  CAP_USD,
  STALE_MS,
  monthKey,
  parseMarketRead,
} from '../src/lib/marketRead'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/* The market read on Insights (I3, 19 Oct; spec
   docs/specs/2026-10-19-insights.md). Paid only on a press, never retried
   on its own. `run` stores the room's numbers as facts and starts the one
   read of the month:

   - deployed (`via: 'api'`): convex/ai/market.ts asks Sonnet 5.5 with
     web search on API credits. The month's spend is checked before and
     added after, from the response's usage; at CAP_USD it is refused
     with CAP_REACHED.
   - localhost (`via: 'pro'`): the page asks Claude Code on his Mac
     (vite/claudeRead.ts, his Pro plan) and hands the answer to
     `finishPro`, which checks it here the same way. Nothing is spent.

   READ AGAIN replaces the month's read; a failure keeps the one before. */

const MONTH = /^\d{4}-\d{2}$/

async function monthRow(ctx: QueryCtx, ownerId: string, month: string) {
  return await ctx.db
    .query('marketReads')
    .withIndex('by_owner_month', (q) =>
      q.eq('ownerId', ownerId).eq('month', month),
    )
    .unique()
}

/** Dollars of API credits spent this month on reads and questions. */
async function spentIn(ctx: QueryCtx, ownerId: string, month: string) {
  const row = await ctx.db
    .query('aiSpend')
    .withIndex('by_owner_month', (q) =>
      q.eq('ownerId', ownerId).eq('month', month),
    )
    .unique()
  return row?.usd ?? 0
}

export async function addSpend(
  ctx: MutationCtx,
  ownerId: string,
  month: string,
  usd: number,
) {
  if (!(usd > 0)) return
  const row = await ctx.db
    .query('aiSpend')
    .withIndex('by_owner_month', (q) =>
      q.eq('ownerId', ownerId).eq('month', month),
    )
    .unique()
  if (row === null)
    await ctx.db.insert('aiSpend', { ownerId, month, usd, calls: 1 })
  else
    await ctx.db.patch(row._id, {
      usd: Math.round((row.usd + usd) * 1000) / 1000,
      calls: row.calls + 1,
    })
}

/**
 * The month's read, the last read of an earlier month (shown while this
 * month has none of its own), and the month's spend against the cap.
 */
export const forMonth = query({
  args: { month: v.string() },
  returns: v.object({
    read: v.union(schema.doc('marketReads'), v.null()),
    last: v.union(schema.doc('marketReads'), v.null()),
    spent: v.number(),
    cap: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (!MONTH.test(args.month)) throw new ConvexError('BAD_MONTH')
    const read = await monthRow(ctx, ownerId, args.month)
    const earlier =
      read?.read !== undefined
        ? []
        : await ctx.db
            .query('marketReads')
            .withIndex('by_owner_month', (q) =>
              q.eq('ownerId', ownerId).lt('month', args.month),
            )
            .order('desc')
            .take(3)
    return {
      read,
      last: earlier.find((r) => r.read !== undefined) ?? null,
      spent: await spentIn(ctx, ownerId, args.month),
      cap: CAP_USD,
    }
  },
})

export const run = mutation({
  args: { facts: v.array(marketFact), via: payer },
  returns: v.id('marketReads'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const month = monthKey(Date.now())
    if (args.facts.length === 0) throw new ConvexError('NO_FACTS')
    if (args.via === 'api' && (await spentIn(ctx, ownerId, month)) >= CAP_USD)
      throw new ConvexError('CAP_REACHED')
    const existing = await monthRow(ctx, ownerId, month)
    /* A second press while it reads pays nothing more. A Pro read whose
       page was closed mid-way never lands; after STALE_MS it may start
       again. */
    const now = Date.now()
    if (
      existing?.status === 'reading' &&
      (existing.via === 'api' || now - (existing.startedAt ?? 0) < STALE_MS)
    )
      return existing._id
    const fields = {
      status: 'reading' as const,
      via: args.via,
      facts: args.facts,
      startedAt: now,
      error: undefined,
      failCost: undefined,
    }
    const readId =
      existing === null
        ? await ctx.db.insert('marketReads', { ownerId, month, ...fields })
        : existing._id
    if (existing !== null) await ctx.db.patch(readId, fields)
    if (args.via === 'api')
      await ctx.scheduler.runAfter(0, internal.ai.market.readMarket, {
        readId,
      })
    return readId
  },
})

export const forRead = internalQuery({
  args: { readId: v.id('marketReads') },
  returns: v.union(schema.doc('marketReads'), v.null()),
  handler: async (ctx, args) => {
    const read = await ctx.db.get(args.readId)
    return read?.status === 'reading' ? read : null
  },
})

async function land(
  ctx: MutationCtx,
  readId: Id<'marketReads'>,
  outcome:
    | {
        ok: true
        read: typeof marketReadBody.type
        stamp: typeof readStamp.type
      }
    | { ok: false; error: string; cost: number },
) {
  const row = await ctx.db.get(readId)
  if (row === null) return
  const cost = outcome.ok ? outcome.stamp.cost : outcome.cost
  if (row.via === 'api') await addSpend(ctx, row.ownerId, row.month, cost)
  if (outcome.ok)
    await ctx.db.patch(readId, {
      status: 'done',
      read: outcome.read,
      stamp: outcome.stamp,
      readAt: Date.now(),
      error: undefined,
    })
  else
    await ctx.db.patch(readId, {
      status: 'failed',
      error: outcome.error,
      failCost: cost,
    })
}

export const finish = internalMutation({
  args: {
    readId: v.id('marketReads'),
    read: marketReadBody,
    stamp: readStamp,
  },
  returns: v.null(),
  handler: async (ctx, { readId, read, stamp }) => {
    await land(ctx, readId, { ok: true, read, stamp })
    return null
  },
})

/** A failed read; `cost` is what a response that came back cost anyway. */
export const fail = internalMutation({
  args: { readId: v.id('marketReads'), error: v.string(), cost: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await land(ctx, args.readId, {
      ok: false,
      error: args.error,
      cost: args.cost,
    })
    return null
  },
})

/** The owner's own reading row on the Pro path, or a refusal. */
async function proRow(ctx: MutationCtx, readId: Id<'marketReads'>) {
  const ownerId = await requireUser(ctx)
  const row = await ctx.db.get(readId)
  if (row === null || row.ownerId !== ownerId)
    throw new ConvexError('NOT_FOUND')
  if (row.via !== 'pro' || row.status !== 'reading')
    throw new ConvexError('NOT_READING')
  return row
}

/**
 * Claude Code's answer on his Mac, checked as the API's is: a line naming
 * a fact not given is refused, too few lines is a failed read.
 */
export const finishPro = mutation({
  args: {
    readId: v.id('marketReads'),
    raw: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    searches: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await proRow(ctx, args.readId)
    const parsed = parseMarketRead(
      args.raw,
      row.facts.map((f) => f.key),
    )
    await land(
      ctx,
      row._id,
      parsed.ok
        ? {
            ok: true,
            read: parsed.read,
            stamp: {
              model: args.model.slice(0, 60),
              inputTokens: args.inputTokens,
              outputTokens: args.outputTokens,
              searches: args.searches,
              cost: 0,
              paidBy: 'pro',
            },
          }
        : { ok: false, error: parsed.error, cost: 0 },
    )
    return null
  },
})

export const failPro = mutation({
  args: { readId: v.id('marketReads'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await proRow(ctx, args.readId)
    await land(ctx, row._id, {
      ok: false,
      error: args.error.slice(0, 120),
      cost: 0,
    })
    return null
  },
})
