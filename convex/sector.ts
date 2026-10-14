import { v } from 'convex/values'

import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { requireUser } from './auth'
import { UNPRICED } from '../src/lib/market'
import { SECTORS, fromName, fromYahoo, parseSector } from '../src/lib/sector'

/* What a thing is in, for the badge on its page (14 Oct, his "go, funds
   from the name"). A share's sector is Yahoo's, from the same search a
   ticker is found with; a fund's comes from words in its own name —
   Yahoo has no category for his London funds. Read once per
   instrument, when its page is first opened (like bars.ts), and stored
   with where it came from; never fetched at render. */

const sector = v.union(...SECTORS.map((s) => v.literal(s)))
const from = v.union(v.literal('yahoo'), v.literal('name'))

export const of = query({
  args: { instrumentId: v.id('instruments') },
  returns: v.union(
    v.null(),
    v.object({
      sector: v.optional(sector),
      from: v.optional(from),
      readAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null || inst.ownerId !== ownerId) return null
    return {
      sector: inst.sector,
      from: inst.sectorFrom,
      readAt: inst.sectorReadAt,
    }
  },
})

export const ask = mutation({
  args: { instrumentId: v.id('instruments') },
  returns: v.union(v.literal('reading'), v.literal('fresh')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null || inst.ownerId !== ownerId)
      throw new Error('No such share')
    if (inst.sectorReadAt !== undefined) return 'fresh'
    if (inst.type === 'EQUITY') {
      /* The test backend reads nothing from Yahoo, as bars.ask. */
      if (process.env.E2E === '1') return 'fresh'
      await ctx.scheduler.runAfter(0, internal.sector.read, {
        instrumentId: inst._id,
      })
      return 'reading'
    }
    const found = fromName(inst.name)
    await ctx.db.patch(inst._id, {
      sector: found,
      sectorFrom: found === undefined ? undefined : 'name',
      sectorReadAt: Date.now(),
    })
    return 'fresh'
  },
})

export const read = internalAction({
  args: { instrumentId: v.id('instruments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const inst = await ctx.runQuery(internal.market.instrument, args)
    if (inst === null || inst.type === UNPRICED) return null
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(inst.symbol)}&quotesCount=8&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (SoloLeveling personal app)' } },
    )
    /* A failed read leaves it unmarked: its page asks again. */
    if (!res.ok) return null
    await ctx.runMutation(internal.sector.store, {
      instrumentId: inst._id,
      sector: fromYahoo(parseSector(await res.json(), inst.symbol)),
    })
    return null
  },
})

/** Stores Yahoo's answer, or that it had none. */
export const store = internalMutation({
  args: { instrumentId: v.id('instruments'), sector: v.optional(sector) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null) return null
    await ctx.db.patch(inst._id, {
      sector: args.sector,
      sectorFrom: args.sector === undefined ? undefined : 'yahoo',
      sectorReadAt: Date.now(),
    })
    return null
  },
})
