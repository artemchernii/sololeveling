import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'

/* PLAN.md §2. A note is a thing you wrote down, and that is all it is: it
   counts towards nothing, appears in no tile, and moves no number. Which is
   why there is no aggregate over notes anywhere — "14 notes this month" would
   be an unsanctioned source measuring typing. */

const MAX_ROWS = 300

const noteKindValidator = v.union(
  v.literal('note'),
  v.literal('idea'),
  v.literal('book'),
  v.literal('reference'),
)

async function ownedNote(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  noteId: Id<'notes'>,
): Promise<Doc<'notes'>> {
  const note = await ctx.db.get(noteId)
  if (note === null || note.ownerId !== ownerId) {
    throw new Error('No such note')
  }
  return note
}

export const create = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    kind: v.optional(noteKindValidator),
    tags: v.optional(v.array(v.string())),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
  },
  returns: v.id('notes'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('A note needs a title')
    }

    return await ctx.db.insert('notes', {
      ownerId,
      title,
      /* A note with a title and nothing else is a real note — the title is
         often the whole thought. */
      body: args.body ?? '',
      kind: args.kind ?? 'note',
      tags: args.tags ?? [],
      projectId: args.projectId,
      goalId: args.goalId,
    })
  },
})

export const update = mutation({
  args: {
    noteId: v.id('notes'),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    kind: v.optional(noteKindValidator),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const existing = await ownedNote(ctx, ownerId, args.noteId)

    const title = args.title?.trim() ?? existing.title
    if (title.length === 0) {
      throw new Error('A note needs a title')
    }

    await ctx.db.patch(args.noteId, {
      title,
      body: args.body ?? existing.body,
      kind: args.kind ?? existing.kind,
      tags: args.tags ?? existing.tags,
    })
    return null
  },
})

export const remove = mutation({
  args: { noteId: v.id('notes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedNote(ctx, ownerId, args.noteId)
    await ctx.db.delete(args.noteId)
    return null
  },
})

/**
 * Every note of a kind, or every note when no kind is given.
 *
 * Newest first: a notes page you scroll from the top is a notes page you use,
 * and `_creationTime` is the last column of every index, so this is the index
 * order reversed rather than a sort in JavaScript.
 */
export const list = query({
  args: { kind: v.optional(noteKindValidator) },
  returns: v.array(schema.doc('notes')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    if (args.kind === undefined) {
      const all: Array<Doc<'notes'>> = []
      for (const kind of ['note', 'idea', 'book', 'reference'] as const) {
        const rows = await ctx.db
          .query('notes')
          .withIndex('by_owner_kind', (q) =>
            q.eq('ownerId', ownerId).eq('kind', kind),
          )
          .order('desc')
          .take(MAX_ROWS)
        all.push(...rows)
      }
      /* Four index reads then one merge, rather than a filter over the table:
         the index is on (owner, kind), so "all kinds" is genuinely four reads
         and the sort is over what those returned, not over every row. */
      return all.sort((a, b) => b._creationTime - a._creationTime)
    }

    return await ctx.db
      .query('notes')
      .withIndex('by_owner_kind', (q) =>
        q.eq('ownerId', ownerId).eq('kind', args.kind!),
      )
      .order('desc')
      .take(MAX_ROWS)
  },
})
