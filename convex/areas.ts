import { v } from 'convex/values'

import { BUILTIN_AREAS } from '../src/lib/area-slug'
import type { Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireUser } from './auth'

/**
 * R6 (PLAN.md §4). The set of areas, as rows he edits.
 *
 * Everything here is scoped by `ownerId` through `by_owner_order` or
 * `by_owner_slug` — never a `.filter()`. There is one user today and the
 * schema does not know that.
 */

async function ownedAreas(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
): Promise<Array<Doc<'areas'>>> {
  return await ctx.db
    .query('areas')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
    .collect()
}

async function bySlug(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  slug: string,
): Promise<Doc<'areas'> | null> {
  return await ctx.db
    .query('areas')
    .withIndex('by_owner_slug', (q) =>
      q.eq('ownerId', ownerId).eq('slug', slug),
    )
    .unique()
}

/**
 * Every area, in his order. Retired ones are left out unless asked for: a
 * picker must not offer one, and the settings editor must still show it.
 */
export const list = query({
  args: { includeRetired: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const areas = await ownedAreas(ctx, ownerId)
    const visible = args.includeRetired
      ? areas
      : areas.filter((a) => a.retiredAt === undefined)
    return visible.sort((a, b) => a.order - b.order)
  },
})

/**
 * The ten the schema used to name, as rows — once.
 *
 * This is a migration, not a seed (`CLAUDE.md`, "Nothing is seeded"). The ten
 * are not invented to fill a screen: they are already the union `schema.ts`
 * held until today and already on Artem's rows, and without them his existing
 * logs would lose their names and their colours. Deleting a fixture makes a
 * screen emptier; deleting these makes the app wrong.
 *
 * Idempotent, and it never touches a row that exists — so a renamed, re-hued
 * or retired area survives it.
 */
export const ensure = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const existing = new Set(
      (await ownedAreas(ctx, ownerId)).map((a) => a.slug),
    )
    let order = 0
    for (const area of BUILTIN_AREAS) {
      if (!existing.has(area.slug)) {
        await ctx.db.insert('areas', {
          ownerId,
          slug: area.slug,
          label: area.label,
          hue: area.hue,
          order,
        })
      }
      order++
    }
    return null
  },
})

/**
 * The label, and only the label.
 *
 * The slug is what six tables hold, so this is the whole of "rename an area":
 * every badge, chip, tile and picker in the app reads the label and every row
 * keeps the string it already had.
 */
export const rename = mutation({
  args: { slug: v.string(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) {
      throw new Error('NO_SUCH_AREA')
    }
    const label = args.label.trim()
    if (label.length === 0) {
      throw new Error('AREA_NEEDS_A_NAME')
    }
    await ctx.db.patch(area._id, { label })
    return null
  },
})
