import { ConvexError, v } from 'convex/values'

import { CAP_USD, monthKey, readCost } from '../src/lib/marketRead'
import { OWNER_ZONE } from '../src/lib/remindAt'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { addLanguageFor } from './areas'
import { addSpend } from './marketReads'
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

/* R8 · S4 (27 Oct, his "money AI closed to guests, $0.50 a month per
   guest"): everything a guest asks the model — Ask, Review's week read, a
   class sheet — comes out of one pot of this many dollars a month, counted
   in aiSpend. Artem keeps CAP_USD on Ask and Insights, and his sheets and
   week reads are not counted. */
export const GUEST_CAP_USD = 0.5

/** Someone who did the first run (and not the test backend's stand-in). */
export async function isGuest(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
): Promise<boolean> {
  const profile = await profileOf(ctx, ownerId)
  return profile !== null && profile.asOwner !== true
}

/** The month's AI cap for this person, in dollars. */
export async function capFor(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
): Promise<number> {
  return (await isGuest(ctx, ownerId)) ? GUEST_CAP_USD : CAP_USD
}

/** A guest whose month's pot is spent; never Artem. */
export async function guestAtCap(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
): Promise<boolean> {
  if (!(await isGuest(ctx, ownerId))) return false
  const row = await ctx.db
    .query('aiSpend')
    .withIndex('by_owner_month', (q) =>
      q.eq('ownerId', ownerId).eq('month', monthKey(Date.now())),
    )
    .unique()
  return (row?.usd ?? 0) >= GUEST_CAP_USD
}

/** A guest's sheet or week read, from the response's usage, priced as
    Sonnet so the pot is never under-counted; Artem's are not counted. */
export async function chargeGuest(
  ctx: MutationCtx,
  ownerId: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  if (!(await isGuest(ctx, ownerId))) return
  await addSpend(
    ctx,
    ownerId,
    monthKey(Date.now()),
    readCost({
      input: usage.inputTokens,
      output: usage.outputTokens,
      searches: 0,
    }),
  )
}

/** Money AI (the statement reader, the Insights read) is Artem's alone. */
export async function refuseGuest(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
): Promise<void> {
  if (await isGuest(ctx, ownerId)) throw new ConvexError('NOT_FOR_GUESTS')
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
