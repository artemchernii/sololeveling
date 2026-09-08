import { v } from 'convex/values'

import { internalMutation } from './_generated/server'

/* The only fixture data in this app, ever (PLAN.md §3b.5). Goals, chains and
   tasks are created through the UI, because creating them is the product — a
   screen with nothing to show gets an empty state, not a demo row.

   Internal, and takes `ownerId` as an argument because a mutation invoked from
   the CLI has no identity to read. That is not the "never accept a user id as
   an argument" hole: an internalMutation is unreachable from the internet, and
   whoever can run it already holds the deploy key.

     npx convex run seed:run '{"ownerId":"user_..."}' */

const PRINCIPLES = [
  "DON'T PERFORM. PARTICIPATE.",
  "I DON'T CHASE INTEREST. I NOTICE IT.",
  'I CHOOSE TOO.',
  'I AM ALLOWED TO BE IMPERFECT.',
  'ACTION > OVERTHINKING.',
  'BUILD > CONSUME.',
]

export const run = internalMutation({
  args: { ownerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('principles')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', args.ownerId))
      .take(1)

    /* Refuse loudly rather than no-op. A second run means either a mistake or
       a wiped deployment, and silently doing nothing hides both. */
    if (existing.length > 0) {
      throw new Error(
        `${args.ownerId} already has principles. Run seed:clear with the same ownerId if you meant to reseed.`,
      )
    }

    for (const [sortOrder, text] of PRINCIPLES.entries()) {
      await ctx.db.insert('principles', {
        ownerId: args.ownerId,
        text,
        sortOrder,
      })
    }

    return null
  },
})

/* The counterpart to run, so reseeding is a command rather than a trip to the
   dashboard — needed once already, when ownerId moved from the Clerk subject to
   the token identifier. Deletes principles and nothing else: there is no
   "clear everything" in this app, because everything else is real. */
export const clear = internalMutation({
  args: { ownerId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('principles')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', args.ownerId))
      .take(100)

    for (const row of rows) {
      await ctx.db.delete(row._id)
    }

    return rows.length
  },
})
