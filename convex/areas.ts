import { v } from 'convex/values'

import {
  ACCENT_FROM,
  ACCENT_TO,
  BUILTIN_AREAS,
  nextHue,
  slugify,
} from '../src/lib/area-slug'
import { areaLabelFor, languageByCode } from '../src/lib/languages/catalog'
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

/* The five slugs one of the six THIS MONTH tiles counts (aggregate.ts RULES,
   PLAN.md §3 item 4). The tiles are a fixed shape and are deliberately not
   derived from the areas list — so retiring one of these would not shrink the
   dashboard, it would silently zero a tile. Refused rather than warned. */
const ON_A_TILE = new Set(['portuguese', 'body', 'money', 'style', 'social'])

/* The slugs a built-in capture verb names (capture-parser.ts). A verb's area
   stays in code (R6 decision 3), so retiring one of these has to say where
   those verbs file instead.

   The first written rule was "refuse the retire and name the verbs" — until
   counting showed nine of the ten areas are named by a verb, which would have
   made retiring a feature that never fires. `projects` is the only one with
   none. `business` is here because projectVerbs() files time on a project. */
const NAMED_BY_A_VERB = new Set([
  'business',
  'career',
  'knowledge',
  'life',
  ...ON_A_TILE,
])

/** A word he invented, as an area. Returns the slug it was given. */
export const create = mutation({
  args: { label: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const label = args.label.trim()
    const slug = slugify(label)
    if (slug === null) {
      throw new Error('AREA_NEEDS_A_NAME')
    }
    if ((await bySlug(ctx, ownerId, slug)) !== null) {
      throw new Error('AREA_EXISTS')
    }
    const areas = await ownedAreas(ctx, ownerId)
    await ctx.db.insert('areas', {
      ownerId,
      slug,
      label,
      hue: nextHue(areas.map((a) => a.hue)),
      /* Retired rows keep their order, so this stays unique. */
      order: areas.length,
    })
    return slug
  },
})

export const setHue = mutation({
  args: { slug: v.string(), hue: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) {
      throw new Error('NO_SUCH_AREA')
    }
    if (!Number.isInteger(args.hue) || args.hue < 0 || args.hue > 359) {
      throw new Error('BAD_HUE')
    }
    /* §3d: the accent means live and focus, and no area may be mistaken for
       it. The gap was a convention nobody could enforce while the hues lived
       in a stylesheet; now it is a refusal. */
    if (args.hue >= ACCENT_FROM && args.hue <= ACCENT_TO) {
      throw new Error('HUE_IS_THE_ACCENT')
    }
    await ctx.db.patch(area._id, { hue: args.hue })
    return null
  },
})

/**
 * Mark an area as a language, or stop. `null` clears the flag.
 *
 * The slug is looked up through by_owner_slug, so another owner's area is
 * simply not found — there is no path from here to a row you do not own.
 */
export const setTrack = mutation({
  args: {
    slug: v.string(),
    track: v.union(v.literal('language'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) throw new Error('NO_SUCH_AREA')

    await ctx.db.patch(area._id, {
      track: args.track === null ? undefined : args.track,
    })
    return null
  },
})

/**
 * Say which language a language area is (25 Sep) — the flag, the name, the
 * built-in path. `null` clears it. Only codes the catalogue knows.
 */
export const setLang = mutation({
  args: { slug: v.string(), lang: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) throw new Error('NO_SUCH_AREA')
    if (args.lang !== null && languageByCode(args.lang) === undefined) {
      throw new Error('NO_SUCH_LANGUAGE')
    }
    await ctx.db.patch(area._id, { lang: args.lang ?? undefined })
    return null
  },
})

/**
 * + Add language on the Languages page (25 Sep): one tap, no trip to
 * Settings. Reuses an area that already is this language, or one with its
 * name (restoring it if retired); otherwise makes a new area. Either way it
 * comes back ticked as a language and carrying the code. Returns the slug.
 */
export const addLanguage = mutation({
  args: { lang: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const language = languageByCode(args.lang)
    if (language === undefined) throw new Error('NO_SUCH_LANGUAGE')

    const areas = await ownedAreas(ctx, ownerId)
    const label = areaLabelFor(language)
    const slug = slugify(label)
    if (slug === null) throw new Error('AREA_NEEDS_A_NAME')
    const existing =
      areas.find((a) => a.lang === language.code) ??
      areas.find((a) => a.slug === slug)
    if (existing !== undefined) {
      await ctx.db.patch(existing._id, {
        track: 'language',
        lang: language.code,
        retiredAt: undefined,
        replacedBy: undefined,
      })
      return existing.slug
    }
    await ctx.db.insert('areas', {
      ownerId,
      slug,
      label,
      hue: nextHue(areas.map((a) => a.hue)),
      order: areas.length,
      track: 'language',
      lang: language.code,
    })
    return slug
  },
})

/** His order, as the whole list. Every slug he owns, once. */
export const reorder = mutation({
  args: { slugs: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const areas = await ownedAreas(ctx, ownerId)
    const mine = new Set(areas.map((a) => a.slug))
    if (
      args.slugs.length !== areas.length ||
      new Set(args.slugs).size !== args.slugs.length ||
      args.slugs.some((slug) => !mine.has(slug))
    ) {
      throw new Error('NOT_THE_WHOLE_LIST')
    }
    for (const [order, slug] of args.slugs.entries()) {
      const area = areas.find((a) => a.slug === slug)!
      if (area.order !== order) {
        await ctx.db.patch(area._id, { order })
      }
    }
    return null
  },
})

/**
 * Gone from every picker; still painting the rows that carry it.
 *
 * A log is evidence of something that happened and does not stop having
 * happened because he stopped tracking the area — the same reason logs are
 * append-only (`CLAUDE.md`, "Intent is not evidence").
 */
export const retire = mutation({
  args: { slug: v.string(), replacedBy: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null || area.retiredAt !== undefined) {
      throw new Error('NO_SUCH_AREA')
    }
    if (ON_A_TILE.has(args.slug)) {
      throw new Error('AREA_ON_A_TILE')
    }

    const live = (await ownedAreas(ctx, ownerId)).filter(
      (a) => a.retiredAt === undefined,
    )
    if (live.length <= 1) {
      throw new Error('LAST_AREA')
    }

    let replacedBy: string | undefined
    if (NAMED_BY_A_VERB.has(args.slug)) {
      if (args.replacedBy === undefined) {
        throw new Error('AREA_NEEDS_A_REPLACEMENT')
      }
      const target = await bySlug(ctx, ownerId, args.replacedBy)
      /* Live, and not this one: a redirect to a retired area would need a
         second hop, and resolveSlug() deliberately takes only one. */
      if (
        target === null ||
        target.retiredAt !== undefined ||
        target.slug === args.slug
      ) {
        throw new Error('NO_SUCH_AREA')
      }
      replacedBy = target.slug
    }

    await ctx.db.patch(area._id, { retiredAt: Date.now(), replacedBy })
    return null
  },
})

export const restore = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) {
      throw new Error('NO_SUCH_AREA')
    }
    await ctx.db.patch(area._id, {
      retiredAt: undefined,
      replacedBy: undefined,
    })
    return null
  },
})

const BUILTIN_SLUGS = new Set<string>(BUILTIN_AREAS.map((a) => a.slug))

/**
 * The guard the schema used to be.
 *
 * Returns the slug when it names an area this owner has — live **or
 * retired**. A picker will not offer a retired area, but a goal already filed
 * under one must still be editable and saveable, and refusing here would make
 * it unsavable.
 *
 * Another owner's area is not an area you have, which is the whole reason
 * this reads through `by_owner_slug` rather than checking a global list — and
 * the one thing the union it replaced could never do.
 *
 * One of the ten built-ins passes whether or not `ensure` has run. They are
 * the union this guard replaced, so they are legal by definition, and making
 * them wait on a row would mean a deployment where the first `gym` throws
 * because he had not opened Settings yet. That was a real hole: `ensure` runs
 * when the areas editor mounts, and nothing makes him go there first.
 */
export async function requireLiveArea(
  ctx: MutationCtx,
  ownerId: string,
  slug: string,
): Promise<string> {
  if (BUILTIN_SLUGS.has(slug)) {
    return slug
  }
  if ((await bySlug(ctx, ownerId, slug)) === null) {
    throw new Error('NO_SUCH_AREA')
  }
  return slug
}

/**
 * Gone entirely — the row deleted, not retired.
 *
 * Retiring says "I stopped tracking this" and keeps the area, so the rows that
 * carry it still have a name and a colour. This says "it should never have
 * existed": a label typed wrong, an area invented and thought better of. The
 * two are not the same act and neither can stand in for the other.
 *
 * So it refuses when anything at all is filed under the slug — retire that
 * instead — and it refuses a built-in outright, because the ten are the union
 * the schema used to hold and `ensure` would put one back on the next mount.
 */
export const remove = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (BUILTIN_SLUGS.has(args.slug)) {
      throw new Error('AREA_IS_BUILT_IN')
    }
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) {
      throw new Error('NO_SUCH_AREA')
    }

    /* The seven tables that carry an area (PLAN.md §2, plus drills on 25
       Sep), written out rather than
       looped: `ctx.db.query(table)` over a union of names cannot resolve which
       indexes that table has, and the loop that reads nicely is the one that
       loses every type. `logs` is the lucky one — `by_owner_area_time` indexes
       the slug itself, so it is an exact hit. The other five are a prefix scan
       of this owner's rows with a filter on top: bounded by ownerId, never a
       table scan. */
    const used =
      (await ctx.db
        .query('logs')
        .withIndex('by_owner_area_time', (q) =>
          q.eq('ownerId', ownerId).eq('area', args.slug),
        )
        .first()) !== null ||
      (await ctx.db
        .query('goals')
        .withIndex('by_owner_status', (q) => q.eq('ownerId', ownerId))
        .filter((q) => q.eq(q.field('area'), args.slug))
        .first()) !== null ||
      (await ctx.db
        .query('projects')
        .withIndex('by_owner_status', (q) => q.eq('ownerId', ownerId))
        .filter((q) => q.eq(q.field('area'), args.slug))
        .first()) !== null ||
      (await ctx.db
        .query('tasks')
        .withIndex('by_owner_status', (q) => q.eq('ownerId', ownerId))
        .filter((q) => q.eq(q.field('area'), args.slug))
        .first()) !== null ||
      (await ctx.db
        .query('events')
        .withIndex('by_owner_start', (q) => q.eq('ownerId', ownerId))
        .filter((q) => q.eq(q.field('area'), args.slug))
        .first()) !== null ||
      (await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) => q.eq('ownerId', ownerId))
        .filter((q) => q.eq(q.field('area'), args.slug))
        .first()) !== null ||
      (await ctx.db
        .query('drills')
        .withIndex('by_owner_area', (q) =>
          q.eq('ownerId', ownerId).eq('area', args.slug),
        )
        .first()) !== null

    if (used) {
      throw new Error('AREA_IN_USE')
    }

    await ctx.db.delete(area._id)
    return null
  },
})
