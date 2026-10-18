import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

/* Files on a note or a task (20 Sep). He asked three times for prompts,
   links, screenshots and MD files to live on the things he writes down, and
   each time it was deferred to a later row. It is here.

   One table, two possible parents. Exactly one of noteId/taskId is set: a
   validator cannot express "one of these two", so it is checked on the way in
   and the row is refused rather than stored ambiguous. */

const MAX_ROWS = 200

/** 25 MB. Large enough for a screenshot or a PDF, small enough to notice. */
const MAX_BYTES = 25 * 1024 * 1024

type Parent = { noteId?: Id<'notes'>; taskId?: Id<'tasks'> }

/**
 * Why this parent cannot take a file, or null when it is his and exactly one
 * thing.
 *
 * Loading the row rather than trusting the id is the whole point: an id from
 * a client is a claim until the row behind it has been loaded.
 */
async function parentRefusal(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  args: Parent,
): Promise<string | null> {
  const given = [args.noteId, args.taskId].filter((id) => id !== undefined)
  if (given.length !== 1) {
    return 'An attachment belongs to one note or one task.'
  }

  if (args.noteId !== undefined) {
    const note = await ctx.db.get(args.noteId)
    return note === null || note.ownerId !== ownerId ? 'No such note' : null
  }

  const task = await ctx.db.get(args.taskId as Id<'tasks'>)
  return task === null || task.ownerId !== ownerId ? 'No such task' : null
}

/** Step one of an upload: a short-lived URL the file is POSTed straight to. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

/** Step two: the file is already stored, this records where it belongs. */
export const add = mutation({
  args: {
    noteId: v.optional(v.id('notes')),
    taskId: v.optional(v.id('tasks')),
    storageId: v.id('_storage'),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), attachmentId: v.id('attachments') }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    /* The bytes are already in storage by the time we get here, so a
       refusal has to take them back out with it — and it is returned, not
       thrown: a mutation that throws rolls back everything it did, the
       storage delete included, and the file would stay stored with nothing
       pointing at it (as `vault.add` does). */
    const refusal =
      (await parentRefusal(ctx, ownerId, args)) ??
      (args.size > MAX_BYTES ? 'That file is larger than 25 MB.' : null)
    if (refusal !== null) {
      await ctx.storage.delete(args.storageId)
      return { ok: false as const, error: refusal }
    }

    const attachmentId = await ctx.db.insert('attachments', {
      ownerId,
      noteId: args.noteId,
      taskId: args.taskId,
      storageId: args.storageId,
      name: args.name.trim() || 'file',
      contentType: args.contentType,
      size: args.size,
    })
    return { ok: true as const, attachmentId }
  },
})

/** What is pinned here, newest last, each with a URL to show it. */
export const listFor = query({
  args: {
    noteId: v.optional(v.id('notes')),
    taskId: v.optional(v.id('tasks')),
  },
  returns: v.array(
    v.object({
      _id: v.id('attachments'),
      name: v.string(),
      contentType: v.string(),
      size: v.number(),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const given = [args.noteId, args.taskId].filter((id) => id !== undefined)
    if (given.length !== 1) return []

    const rows =
      args.noteId !== undefined
        ? await ctx.db
            .query('attachments')
            .withIndex('by_owner_note', (q) =>
              q.eq('ownerId', ownerId).eq('noteId', args.noteId),
            )
            .take(MAX_ROWS)
        : await ctx.db
            .query('attachments')
            .withIndex('by_owner_task', (q) =>
              q.eq('ownerId', ownerId).eq('taskId', args.taskId),
            )
            .take(MAX_ROWS)

    const out = []
    for (const row of rows) {
      out.push({
        _id: row._id,
        name: row.name,
        contentType: row.contentType,
        size: row.size,
        url: await ctx.storage.getUrl(row.storageId),
      })
    }
    return out
  },
})

/** Removing it takes the bytes with it — an unreachable file is just a bill. */
export const remove = mutation({
  args: { attachmentId: v.id('attachments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const row = await ctx.db.get(args.attachmentId)
    if (row === null || row.ownerId !== ownerId) {
      throw new Error('No such attachment')
    }
    await ctx.storage.delete(row.storageId)
    await ctx.db.delete(args.attachmentId)
    return null
  },
})

/**
 * Everything pinned to a note or a task, deleted with it.
 *
 * Exported for notes.remove and tasks.remove to call: a row pointing at a
 * parent that no longer exists can never be reached or removed again.
 */
export async function removeFor(
  ctx: MutationCtx,
  ownerId: string,
  parent: Parent,
): Promise<void> {
  const rows =
    parent.noteId !== undefined
      ? await ctx.db
          .query('attachments')
          .withIndex('by_owner_note', (q) =>
            q.eq('ownerId', ownerId).eq('noteId', parent.noteId),
          )
          .take(MAX_ROWS)
      : await ctx.db
          .query('attachments')
          .withIndex('by_owner_task', (q) =>
            q.eq('ownerId', ownerId).eq('taskId', parent.taskId),
          )
          .take(MAX_ROWS)

  for (const row of rows) {
    await ctx.storage.delete(row.storageId)
    await ctx.db.delete(row._id)
  }
}
