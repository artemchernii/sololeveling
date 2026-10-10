import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard, history } from './e2e'

/* Mock states of an update for the browser tests (10 Oct) — a read held
   open, a read that failed, a save that stopped. Like convex/e2e.ts,
   every function refuses anywhere but the test backend. */

/* An update whose one file is still being read (10 Oct) — held there, so
   a test can try to close the window on it. */
export const holdRead = mutation({
  args: {},
  returns: v.id('batches'),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const batchId = await ctx.db.insert('batches', {
      ownerId,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    await ctx.db.insert('intakes', {
      ownerId,
      batchId,
      storageIds: [],
      status: 'reading',
      readingSince: Date.now(),
      progress: { stage: 'rows', rows: 12, have: 0, recent: [] },
      files: [
        {
          name: 'statement-sep.pdf',
          size: 90_000,
          contentType: 'application/pdf',
        },
      ],
    })
    return batchId
  },
})

const BLURRY = 'The picture is too blurry to read the numbers.'

/* The read held by holdRead comes back unreadable. */
export const failRead = mutation({
  args: { batchId: v.id('batches') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const intakes = await ctx.db
      .query('intakes')
      .withIndex('by_owner_batch', (q) =>
        q.eq('ownerId', ownerId).eq('batchId', args.batchId),
      )
      .collect()
    for (const i of intakes)
      if (i.status === 'reading')
        await ctx.db.patch(i._id, {
          status: 'failed',
          error: BLURRY,
          retryable: true,
          progress: undefined,
        })
    return null
  },
})

/* One more file in an update, read and found unreadable. */
export const badFile = mutation({
  args: { batchId: v.id('batches') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    await ctx.db.insert('intakes', {
      ownerId,
      batchId: args.batchId,
      storageIds: [],
      status: 'failed',
      error: BLURRY,
      retryable: true,
      files: [{ name: 'blurry.png', size: 240_000, contentType: 'image/png' }],
    })
    return null
  },
})

/* A save that stopped: the history's update left "applying", with nothing
   scheduled to carry it on. */
export const stuckApply = mutation({
  args: { days: v.array(v.number()) },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const batchId = await history(ctx, ownerId, args.days)
    await ctx.db.patch(batchId, {
      status: 'applying',
      applied: { intakes: 0, rows: 0, accounts: 1 },
    })
    return batchId
  },
})
