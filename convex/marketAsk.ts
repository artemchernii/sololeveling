import { v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'
import { addSpend, spentIn } from './marketReads'
import { capFor } from './profiles'
import { marketReadBody } from './marketReadFields'

/* What ASK (I4, convex/ai/ask.ts) reads and writes: the month's spend
   against the cap, the read a question is asked beside, and the cost of
   an answer added to the month. The question and its answer are never
   written — they live on the page. */

export const spent = internalQuery({
  args: { ownerId: v.string(), month: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => await spentIn(ctx, args.ownerId, args.month),
})

/** The month's cap for this person: $0.50 for a guest (R8 · S4). */
export const cap = internalQuery({
  args: { ownerId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => await capFor(ctx, args.ownerId),
})

/** The latest read on screen: this month's, else the last one kept. */
export const context = internalQuery({
  args: { ownerId: v.string(), month: v.string() },
  returns: v.union(marketReadBody, v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('marketReads')
      .withIndex('by_owner_month', (q) =>
        q.eq('ownerId', args.ownerId).lte('month', args.month),
      )
      .order('desc')
      .take(3)
    return rows.find((r) => r.read !== undefined)?.read ?? null
  },
})

export const charge = internalMutation({
  args: { ownerId: v.string(), month: v.string(), usd: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await addSpend(ctx, args.ownerId, args.month, args.usd)
    return null
  },
})
