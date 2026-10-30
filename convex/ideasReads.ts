import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, internalQuery, query } from './_generated/server'
import { aiMutation, mutation } from './write'
import { requireUser } from './auth'
import { marketFact, payer, readStamp } from './marketReadFields'
import { ideasBody } from './ideasReadFields'
import { addSpend, spentIn } from './marketReads'
import schema from './schema'
import { CAP_USD, STALE_MS, monthKey } from '../src/lib/marketRead'
import { parseIdeasRead } from '../src/lib/ideasRead'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { refuseGuest } from './profiles'

/* IDEAS, the board's read (29 Oct; spec docs/specs/2026-10-29-ideas-board.md).
   Paid only on a press — READ AGAIN — never on its own. `run` stores the
   facts and the idle cash the page gave and starts one read, a new row
   each press:

   - deployed (`via: 'api'`): convex/ai/ideas.ts asks Sonnet 5.5 with web
     search on API credits, under the same month's cap as the market read
     and ASK (aiSpend).
   - localhost (`via: 'pro'`): the page asks Claude Code on his Mac
     (vite/claudeRead.ts) and hands the answer to `finishPro`, checked
     here the same way.

   The board shows the newest row with a plan; a failure keeps it. */

/** The newest row (reading, failed or done) and the newest with a plan. */
export const latest = query({
  args: {},
  returns: v.object({
    row: v.union(schema.doc('ideasReads'), v.null()),
    shown: v.union(schema.doc('ideasReads'), v.null()),
    spent: v.number(),
    cap: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('ideasReads')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .take(5)
    return {
      row: rows[0] ?? null,
      shown: rows.find((r) => r.board !== undefined) ?? null,
      spent: await spentIn(ctx, ownerId, monthKey(Date.now())),
      cap: CAP_USD,
    }
  },
})

export const run = aiMutation({
  args: { facts: v.array(marketFact), idle: v.number(), via: payer },
  returns: v.id('ideasReads'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (args.facts.length === 0) throw new ConvexError('NO_FACTS')
    if (!(args.idle > 0)) throw new ConvexError('NO_CASH')
    await refuseGuest(ctx, ownerId)
    if (
      args.via === 'api' &&
      (await spentIn(ctx, ownerId, monthKey(Date.now()))) >= CAP_USD
    )
      throw new ConvexError('CAP_REACHED')
    const last = await ctx.db
      .query('ideasReads')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .first()
    /* A second press while it reads pays nothing more. A Pro read whose
       page was closed never lands; after STALE_MS it may start again. */
    const now = Date.now()
    if (
      last?.status === 'reading' &&
      (last.via === 'api' || now - last.startedAt < STALE_MS)
    )
      return last._id
    const readId = await ctx.db.insert('ideasReads', {
      ownerId,
      status: 'reading',
      via: args.via,
      facts: args.facts,
      idle: Math.round(args.idle),
      startedAt: now,
    })
    if (args.via === 'api')
      await ctx.scheduler.runAfter(0, internal.ai.ideas.readIdeas, { readId })
    return readId
  },
})

export const forRead = internalQuery({
  args: { readId: v.id('ideasReads') },
  returns: v.union(schema.doc('ideasReads'), v.null()),
  handler: async (ctx, args) => {
    const read = await ctx.db.get(args.readId)
    return read?.status === 'reading' ? read : null
  },
})

async function land(
  ctx: MutationCtx,
  readId: Id<'ideasReads'>,
  outcome:
    | {
        ok: true
        board: typeof ideasBody.type
        stamp: typeof readStamp.type
      }
    | { ok: false; error: string; cost: number },
) {
  const row = await ctx.db.get(readId)
  if (row === null) return
  const cost = outcome.ok ? outcome.stamp.cost : outcome.cost
  if (row.via === 'api')
    await addSpend(ctx, row.ownerId, monthKey(row.startedAt), cost)
  if (outcome.ok)
    await ctx.db.patch(readId, {
      status: 'done',
      board: outcome.board,
      stamp: outcome.stamp,
      readAt: Date.now(),
    })
  else
    await ctx.db.patch(readId, {
      status: 'failed',
      error: outcome.error,
      failCost: cost,
    })
}

export const finish = internalMutation({
  args: { readId: v.id('ideasReads'), board: ideasBody, stamp: readStamp },
  returns: v.null(),
  handler: async (ctx, { readId, board, stamp }) => {
    await land(ctx, readId, { ok: true, board, stamp })
    return null
  },
})

export const fail = internalMutation({
  args: { readId: v.id('ideasReads'), error: v.string(), cost: v.number() },
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

async function proRow(ctx: MutationCtx, readId: Id<'ideasReads'>) {
  const ownerId = await requireUser(ctx)
  const row = await ctx.db.get(readId)
  if (row === null || row.ownerId !== ownerId)
    throw new ConvexError('NOT_FOUND')
  if (row.via !== 'pro' || row.status !== 'reading')
    throw new ConvexError('NOT_READING')
  return row
}

/** Claude Code's answer on his Mac, checked as the API's is. */
export const finishPro = mutation({
  args: {
    readId: v.id('ideasReads'),
    raw: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    searches: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await proRow(ctx, args.readId)
    const parsed = parseIdeasRead(args.raw, row.facts, row.idle)
    await land(
      ctx,
      row._id,
      parsed.ok
        ? {
            ok: true,
            board: parsed.board,
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
  args: { readId: v.id('ideasReads'), error: v.string() },
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
