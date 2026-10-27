import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { wipeSome } from './account'
import { requireUser } from './auth'
import { fillStory, lisbonDay } from './fake/story'
import { openMutation } from './write'

/**
 * The demo account (27 Oct, docs/specs/2026-10-27-demo-account.md, mockup
 * design/firstrun-mockup/demo.html). His other Gmail signs up on
 * workers.dev; then, with the deploy key:
 *
 *   npx convex run --prod demo:make '{"ownerId":"<its tokenIdentifier>"}'
 *
 * marks it demo and fills it. Only an account marked demo is ever wiped
 * or filled here — Artem's has no such mark and no path to one.
 */

/* Rows deleted per run before the fill, inside the write limits. */
const BATCH = 2000

async function demoProfile(ctx: MutationCtx, ownerId: string) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .unique()
  return profile?.demo === true ? profile : null
}

/** Marks an account demo and fills it. Deploy key only. */
export const make = internalMutation({
  args: { ownerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    const principle = await ctx.db
      .query('principles')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .first()
    if (principle !== null) throw new Error('THIS_IS_ARTEM')
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .unique()
    if (profile === null)
      await ctx.db.insert('profiles', {
        ownerId,
        timezone: 'Europe/Lisbon',
        firstRunAt: Date.now(),
        demo: true,
      })
    else await ctx.db.patch(profile._id, { demo: true, asOwner: undefined })
    await ctx.scheduler.runAfter(0, internal.demo.refill, { ownerId })
    return null
  },
})

/** Wipes the demo account in batches, then writes the story as of now. */
export const refill = internalMutation({
  args: { ownerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    const profile = await demoProfile(ctx, ownerId)
    if (profile === null) throw new Error('NOT_DEMO')
    if (!(await wipeSome(ctx, ownerId, BATCH))) {
      await ctx.scheduler.runAfter(0, internal.demo.refill, { ownerId })
      return null
    }
    const now = Date.now()
    await fillStory(ctx, ownerId, now)
    await ctx.db.patch(profile._id, { demoFilledOn: lisbonDay(now) })
    /* Real closes for the made-up holdings; the test backend keeps none. */
    if (process.env.E2E !== '1')
      await ctx.scheduler.runAfter(0, internal.market.readAll, {
        pricesOnly: true,
        ownerId,
      })
    return null
  },
})

/**
 * Asked on every open. A demo account filled before today is filled
 * again, so its days move with the calendar. Open to the demo account:
 * it is the one write it makes, and a friend chooses nothing in it.
 */
export const freshen = openMutation({
  args: {},
  returns: v.union(
    v.literal('fresh'),
    v.literal('refilling'),
    v.literal('not_demo'),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const profile = await demoProfile(ctx, ownerId)
    if (profile === null) return 'not_demo'
    const today = lisbonDay(Date.now())
    if (profile.demoFilledOn === today) return 'fresh'
    /* Marked first, so a second tab does not start a second fill. */
    await ctx.db.patch(profile._id, { demoFilledOn: today })
    await ctx.scheduler.runAfter(0, internal.demo.refill, { ownerId })
    return 'refilling'
  },
})
