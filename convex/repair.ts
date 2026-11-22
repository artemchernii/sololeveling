import { v } from 'convex/values'

import { statementCash } from './intake'
import { syncLedgers } from './ledgers'
import { internalMutation } from './_generated/server'

/* Repairs run once with the deploy key, by hand, for rows a bug saved
   (22 Nov: a fund's buys saved on another listing of it, and a
   statement's cash not saved). Nothing calls them; each names its rows
   by id, never by amount. */

/** A trade off the listing a bug put it on: onto the held one, or gone
    when that one has it already. */
export const moveTrade = internalMutation({
  args: {
    tradeId: v.id('trades'),
    to: v.optional(v.id('instruments')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tradeId)
    if (t === null || t.accountId === undefined) return null
    const slots = [{ accountId: t.accountId, instrumentId: t.instrumentId }]
    if (args.to === undefined) await ctx.db.delete(t._id)
    else {
      const to = await ctx.db.get(args.to)
      if (to === null || to.ownerId !== t.ownerId) return null
      await ctx.db.patch(t._id, { instrumentId: to._id })
      slots.push({ accountId: t.accountId, instrumentId: to._id })
    }
    await syncLedgers(ctx, t.ownerId, slots)
    return null
  },
})

/** A statement's cash, saved as its apply now saves it. */
export const statementCashAgain = internalMutation({
  args: { intakeId: v.id('intakes'), dayStart: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const i = await ctx.db.get(args.intakeId)
    if (i === null || i.accountId === undefined) return null
    const account = await ctx.db.get(i.accountId)
    if (account === null || account.ownerId !== i.ownerId) return null
    await statementCash(ctx, i.ownerId, i, account, args.dayStart)
    return null
  },
})
