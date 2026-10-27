import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import { mutation } from './write'
import { readingsOf, standing } from './undoFile'
import type { Pocket } from './undoFile'
import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* Remove a balance typed by hand (11 Oct, mockup design/treasury-mockup/
   typed-balance.html). A file is taken back in undoFile.ts, with what it
   wrote; a typed balance wrote nothing but itself, so it alone goes and
   the account stands on the balance before it. One a file or the bank set
   is never removed here. */

async function typed(
  ctx: QueryCtx,
  ownerId: string,
  snapshotId: Id<'stateSnapshots'>,
): Promise<{
  row: Doc<'stateSnapshots'>
  account: Doc<'accounts'>
  pocket: Pocket
} | null> {
  const row = await ctx.db.get(snapshotId)
  if (row === null || row.ownerId !== ownerId) return null
  const parts = row.key.split(':')
  if (parts.length !== 3 || parts[0] !== 'balance') return null
  const accountId = ctx.db.normalizeId('accounts', parts[1])
  const currency = parts[2]
  if (accountId === null) return null
  const account = await ctx.db.get(accountId)
  if (account === null || account.ownerId !== ownerId) return null
  return { row, account, pocket: { key: row.key, currency, broker: false } }
}

/** What the account is now and once this balance is gone — said before
    the press. Sources: state (a balance) and logged rows after it, one
    currency, as `aggregate.balances` counts them. */
export const preview = query({
  args: { snapshotId: v.id('stateSnapshots') },
  returns: v.union(
    v.null(),
    v.object({
      account: v.string(),
      currency: v.string(),
      /** The day it is a balance of. */
      of: v.number(),
      now: v.number(),
      /** The day of the balance the account stands on now. */
      nowOf: v.number(),
      /** Null: no balance is left to stand on. */
      after: v.union(v.number(), v.null()),
      afterOf: v.union(v.number(), v.null()),
      /** A newer balance stays, so nothing moves. */
      newer: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const t = await typed(ctx, ownerId, args.snapshotId)
    if (t === null || t.row.source !== 'typed') return null
    const all = await readingsOf(ctx, ownerId, t.pocket)
    const left = all.filter((r) => r._id !== t.row._id)
    const now = await standing(ctx, ownerId, t.account, t.pocket, all.at(0))
    if (now === null) return null
    return {
      account: t.account.name,
      currency: t.pocket.currency,
      of: t.row.recordedAt,
      now,
      nowOf: all[0].recordedAt,
      after: await standing(ctx, ownerId, t.account, t.pocket, left.at(0)),
      afterOf: left.at(0)?.recordedAt ?? null,
      newer: all[0]._id !== t.row._id,
    }
  },
})

/** Remove one balance he typed. Rows are never touched. */
export const remove = mutation({
  args: { snapshotId: v.id('stateSnapshots') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const t = await typed(ctx, ownerId, args.snapshotId)
    if (t === null) throw new Error('No such balance')
    if (t.row.source !== 'typed')
      throw new ConvexError(
        'That balance came from a file — take the file back instead.',
      )
    await ctx.db.delete(t.row._id)
    return null
  },
})
