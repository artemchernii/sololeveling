import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

/* The eight things of e2eFind.manyHeld with their sector and country as
   Yahoo would give them (18 Oct, mockup tags-map.html); Coca-Cola is
   left not read — MISSING. Test backend only (`guard`). */
const TAGS: ReadonlyArray<
  [string, 'tech' | 'consumer' | 'finance' | 'health', string]
> = [
  ['ASML', 'tech', 'Netherlands'],
  ['NVDA', 'tech', 'United States'],
  ['AMZN', 'consumer', 'United States'],
  ['PLTR', 'tech', 'United States'],
  ['TSLA', 'consumer', 'United States'],
  ['V', 'finance', 'United States'],
  ['NVO', 'health', 'Denmark'],
]

export const tagged = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const now = Date.now()
    for (const symbol of [...TAGS.map((t) => t[0]), 'KO']) {
      const inst = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', symbol),
        )
        .first()
      if (inst === null) throw new Error('manyHeld first')
      const t = TAGS.find((x) => x[0] === symbol)
      await ctx.db.patch(inst._id, {
        sector: t?.[1],
        sectorFrom: t ? 'yahoo' : undefined,
        sectorReadAt: t ? now : undefined,
        country: t?.[2],
        countryReadAt: t ? now : undefined,
      })
    }
    return null
  },
})
