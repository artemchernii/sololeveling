import { v } from 'convex/values'

import { internal } from './_generated/api'
import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'
import { SHARES } from './fake/story'

/* The demo account's browser test (docs/specs/2026-10-27-demo-account.md):
   the test user marked demo and refilled in batches, as demo.make does.
   Test backend only (`guard`); the next reset makes it Artem again. */
export const makeDemo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .unique()
    if (profile === null) throw new Error('reset first')
    await ctx.db.patch(profile._id, { demo: true, asOwner: undefined })
    await ctx.scheduler.runAfter(0, internal.demo.refill, { ownerId })
    return null
  },
})

/* After the demo test: the story's tickers and notes out of the test
   backend, which reset keeps between tests (an Apple with no price sank
   Portfolio's Apple, 27 Oct). */
export const undoDemo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    for (const s of SHARES) {
      const inst = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', s.symbol),
        )
        .first()
      if (inst === null) continue
      for (const table of ['prices', 'priceYears', 'holdings'] as const) {
        const index =
          table === 'prices'
            ? 'by_owner_instrument_time'
            : table === 'priceYears'
              ? 'by_owner_instrument_year'
              : 'by_owner_instrument'
        const rows = await ctx.db
          .query(table)
          .withIndex(index as never, (q) =>
            (
              q as unknown as {
                eq: (
                  f: string,
                  v: string,
                ) => { eq: (f: string, v: string) => never }
              }
            )
              .eq('ownerId', ownerId)
              .eq('instrumentId', inst._id),
          )
          .collect()
        for (const r of rows) await ctx.db.delete(r._id)
      }
      await ctx.db.delete(inst._id)
    }
    for (const n of await ctx.db
      .query('notes')
      .withIndex('by_owner_kind', (q) => q.eq('ownerId', ownerId))
      .collect())
      await ctx.db.delete(n._id)
    return null
  },
})
