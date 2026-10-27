import { v } from 'convex/values'

import { OWNER_ZONE } from '../src/lib/remindAt'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { addLanguageFor } from './areas'
import { requireUser } from './auth'

/**
 * R8 · S2, the first run (docs/specs/2026-10-26-first-run.md): one window on
 * a friend's first open — the language they are learning, the zone read
 * from their device. Everything here is scoped through `by_owner`.
 */

async function profileOf(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db
    .query('profiles')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .unique()
}

/** A person's zone: theirs once answered, else Artem's. */
export async function zoneFor(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
): Promise<string> {
  return (await profileOf(ctx, ownerId))?.timezone ?? OWNER_ZONE
}

function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * Asked only of someone with no profile and no log at all. A log says the
 * person has used the app already — Artem on dev and prod — so he is never
 * shown the window and his data needs no write for it.
 */
export const mine = query({
  args: {},
  returns: v.object({
    needsFirstRun: v.boolean(),
    /* R8 · S3a: someone who did the first run. Artem never did. */
    guest: v.boolean(),
    timezone: v.string(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const profile = await profileOf(ctx, ownerId)
    if (profile !== null)
      return {
        needsFirstRun: false,
        guest: profile.asOwner !== true,
        timezone: profile.timezone,
      }
    const anyLog = await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .first()
    return {
      needsFirstRun: anyLog === null,
      guest: false,
      timezone: OWNER_ZONE,
    }
  },
})

/** GO: the language (or none) and the device's zone. Safe to press twice. */
export const finishFirstRun = mutation({
  args: { lang: v.union(v.string(), v.null()), timezone: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (!knownZone(args.timezone)) throw new Error('NO_SUCH_ZONE')
    if (args.lang !== null) await addLanguageFor(ctx, ownerId, args.lang)
    const profile = await profileOf(ctx, ownerId)
    if (profile === null)
      await ctx.db.insert('profiles', {
        ownerId,
        timezone: args.timezone,
        firstRunAt: Date.now(),
      })
    else await ctx.db.patch(profile._id, { timezone: args.timezone })
    return null
  },
})
