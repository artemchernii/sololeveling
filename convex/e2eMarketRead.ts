import { v } from 'convex/values'

import { internalQuery, mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'
import { monthKey } from '../src/lib/marketRead'
import type { CannedShape } from '../src/lib/marketReadCanned'

/* Browser tests of the market read (I3) on the test backend. `arm` picks
   which canned answer the next read gets — calm, mixed, broken (a line
   naming a key never given) or fail — kept in a row of month "E2E", which
   no screen asks for. `spend` sets this month's API spend, for the cap. */

const shape = v.union(
  v.literal('calm'),
  v.literal('mixed'),
  v.literal('broken'),
  v.literal('fail'),
)
const ARMED = 'E2E'

export const arm = mutation({
  args: { shape },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const row = await ctx.db
      .query('marketReads')
      .withIndex('by_owner_month', (q) =>
        q.eq('ownerId', ownerId).eq('month', ARMED),
      )
      .unique()
    if (row) await ctx.db.patch(row._id, { error: args.shape })
    else
      await ctx.db.insert('marketReads', {
        ownerId,
        month: ARMED,
        status: 'failed',
        via: 'api',
        facts: [],
        error: args.shape,
      })
    return null
  },
})

export const armed = internalQuery({
  args: { ownerId: v.string() },
  returns: shape,
  handler: async (ctx, args): Promise<CannedShape> => {
    guard()
    const row = await ctx.db
      .query('marketReads')
      .withIndex('by_owner_month', (q) =>
        q.eq('ownerId', args.ownerId).eq('month', ARMED),
      )
      .unique()
    const s = row?.error
    return s === 'mixed' || s === 'broken' || s === 'fail' ? s : 'calm'
  },
})

export const spend = mutation({
  args: { usd: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const month = monthKey(Date.now())
    const row = await ctx.db
      .query('aiSpend')
      .withIndex('by_owner_month', (q) =>
        q.eq('ownerId', ownerId).eq('month', month),
      )
      .unique()
    if (row) await ctx.db.patch(row._id, { usd: args.usd })
    else
      await ctx.db.insert('aiSpend', { ownerId, month, usd: args.usd, calls: 1 })
    return null
  },
})
