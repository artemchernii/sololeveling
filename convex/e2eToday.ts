import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

/* Today with two languages (25 Oct, docs/specs/2026-10-25-today-tasks-grid.md):
   Portuguese and English as language areas, one session of each at
   `at`. Test backend only (`guard`). */
export const twoLanguages = mutation({
  args: { at: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const areas = [
      { slug: 'portuguese', label: 'Portuguese', hue: 190, lang: 'pt-PT' },
      { slug: 'english', label: 'English', hue: 69, lang: 'en' },
    ]
    for (const [order, a] of areas.entries()) {
      const had = await ctx.db
        .query('areas')
        .withIndex('by_owner_slug', (q) =>
          q.eq('ownerId', ownerId).eq('slug', a.slug),
        )
        .first()
      if (had) await ctx.db.patch(had._id, { track: 'language', lang: a.lang })
      else
        await ctx.db.insert('areas', {
          ownerId,
          ...a,
          order: 20 + order,
          track: 'language',
        })
      await ctx.db.insert('logs', {
        ownerId,
        kind: 'session',
        area: a.slug,
        occurredAt: args.at,
        value: 30,
      })
    }
    return null
  },
})
