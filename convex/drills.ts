import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { requireLiveArea } from './areas'
import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaSlug } from './schema'

/* Routines (25 Sep): the exercises under Stretch and Gym on Body, the topics
   and tenses under a language. A drill is a thing he means to do. Pressing
   DID on one writes an `exercise` log — the evidence — and nothing else: the
   session that the Today tile counts is its own tap (logs.create), because
   six stretches are one stretch session, not six workouts.

   Nothing is seeded. Every drill is typed in on the page. */

/* One area's routines, generously — a list longer than this is not a
   routine any more. */
const MAX_DRILLS = 200
const MAX_TITLE = 80
const MAX_GROUP = 24

async function ownedDrill(
  ctx: MutationCtx,
  ownerId: string,
  drillId: Id<'drills'>,
) {
  const drill = await ctx.db.get(drillId)
  if (drill === null || drill.ownerId !== ownerId) {
    throw new Error('No such drill')
  }
  return drill
}

function cleanTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, ' ')
  if (title.length === 0) throw new ConvexError('Give it a name.')
  if (title.length > MAX_TITLE) throw new ConvexError('That name is too long.')
  return title
}

/* The group is the category its exercise logs file under, so it is written
   the way capture writes a category: one lower-case word or two. */
function cleanGroup(raw: string): string {
  const group = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (group.length === 0) throw new ConvexError('Name the routine.')
  if (group.length > MAX_GROUP) {
    throw new ConvexError('That routine name is too long.')
  }
  return group
}

/* A path topic's drill, made the first time he touches the topic. The path
   is reference content in the client; this is where it becomes his row. */
async function drillForRef(
  ctx: MutationCtx,
  ownerId: string,
  area: string,
  ref: string,
  title: string,
): Promise<Doc<'drills'>> {
  if (!/^[a-z0-9-]{1,64}$/.test(ref)) throw new Error('Bad topic')
  const rows = await ctx.db
    .query('drills')
    .withIndex('by_owner_area', (q) =>
      q.eq('ownerId', ownerId).eq('area', area),
    )
    .take(MAX_DRILLS)
  const found = rows.find((d) => d.ref === ref)
  if (found !== undefined) return found
  await requireLiveArea(ctx, ownerId, area)
  const last = rows.reduce((n, d) => Math.max(n, d.sortOrder), 0)
  const id = await ctx.db.insert('drills', {
    ownerId,
    area,
    group: 'topic',
    title: cleanTitle(title),
    ref,
    sortOrder: last + 1,
  })
  return (await ctx.db.get(id)) as Doc<'drills'>
}

/** One area's live drills, in the order they were added. */
export const list = query({
  args: { area: areaSlug },
  returns: v.array(schema.doc('drills')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('drills')
      .withIndex('by_owner_area', (q) =>
        q.eq('ownerId', ownerId).eq('area', args.area),
      )
      .take(MAX_DRILLS)
    return rows
      .filter((d) => d.retiredAt === undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  },
})

export const create = mutation({
  args: { area: areaSlug, group: v.string(), title: v.string() },
  returns: v.id('drills'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await requireLiveArea(ctx, ownerId, args.area)
    const title = cleanTitle(args.title)
    const group = cleanGroup(args.group)

    const existing = await ctx.db
      .query('drills')
      .withIndex('by_owner_area', (q) =>
        q.eq('ownerId', ownerId).eq('area', args.area),
      )
      .take(MAX_DRILLS)
    if (existing.length >= MAX_DRILLS) {
      throw new ConvexError('That is a long list already.')
    }
    const last = existing.reduce((n, d) => Math.max(n, d.sortOrder), 0)

    return await ctx.db.insert('drills', {
      ownerId,
      area: args.area,
      group,
      title,
      sortOrder: last + 1,
    })
  },
})

export const rename = mutation({
  args: { drillId: v.id('drills'), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedDrill(ctx, ownerId, args.drillId)
    await ctx.db.patch(args.drillId, { title: cleanTitle(args.title) })
    return null
  },
})

/** LEARNING or SOLID, or neither. Words, never a score. */
export const setMark = mutation({
  args: {
    drillId: v.id('drills'),
    mark: v.union(v.literal('learning'), v.literal('solid'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedDrill(ctx, ownerId, args.drillId)
    await ctx.db.patch(args.drillId, { mark: args.mark ?? undefined })
    return null
  },
})

/** Off the list. Its exercise logs stay: they happened. */
export const retire = mutation({
  args: { drillId: v.id('drills') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedDrill(ctx, ownerId, args.drillId)
    await ctx.db.patch(args.drillId, { retiredAt: Date.now() })
    return null
  },
})

/** Back on the list — the Undo after a retire. */
export const restore = mutation({
  args: { drillId: v.id('drills') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedDrill(ctx, ownerId, args.drillId)
    await ctx.db.patch(args.drillId, { retiredAt: undefined })
    return null
  },
})

/**
 * DID: he did this one, now. Writes one `exercise` log carrying the drill's
 * name and group, so the row still reads right if the drill is renamed or
 * retired later. Returns the log so the button can offer Undo (logs.remove).
 */
export const did = mutation({
  args: { drillId: v.id('drills') },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const drill = await ownedDrill(ctx, ownerId, args.drillId)
    if (drill.retiredAt !== undefined) {
      throw new ConvexError('That one is off the list.')
    }
    return await ctx.db.insert('logs', {
      ownerId,
      kind: 'exercise',
      area: drill.area,
      occurredAt: Date.now(),
      text: drill.title,
      meta: { category: drill.group, drillId: drill._id },
    })
  },
})

/**
 * PRACTISED on a built-in path topic: finds or makes his drill for it, then
 * writes the exercise log exactly as `did` does. Returns the log for Undo.
 */
export const practiseTopic = mutation({
  args: { area: areaSlug, ref: v.string(), title: v.string() },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const drill = await drillForRef(
      ctx,
      ownerId,
      args.area,
      args.ref,
      args.title,
    )
    if (drill.retiredAt !== undefined) {
      await ctx.db.patch(drill._id, { retiredAt: undefined })
    }
    return await ctx.db.insert('logs', {
      ownerId,
      kind: 'exercise',
      area: drill.area,
      occurredAt: Date.now(),
      text: drill.title,
      meta: { category: drill.group, drillId: drill._id },
    })
  },
})

/** SOLID (or not) on a built-in path topic, making his drill if needed. */
export const markTopic = mutation({
  args: {
    area: areaSlug,
    ref: v.string(),
    title: v.string(),
    mark: v.union(v.literal('learning'), v.literal('solid'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const drill = await drillForRef(
      ctx,
      ownerId,
      args.area,
      args.ref,
      args.title,
    )
    await ctx.db.patch(drill._id, {
      mark: args.mark ?? undefined,
      retiredAt: undefined,
    })
    return null
  },
})
