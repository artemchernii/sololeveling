import { v } from 'convex/values'

import { requireUser } from './auth'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import { askReplyFields, rowsAnswerShape } from './askReplyFields'
import { readStamp } from './marketReadFields'
import { notifyOwner } from './push'
import { replyNote } from '../src/lib/askReply'

/* N4 (22 Oct, his "go — build N4 as the mockup"; spec
   docs/specs/2026-10-22-n4-ask-replies.md). The deployed Ask action runs
   to its end even when the phone that asked is locked, but its answer went
   back only to that page. Now the action keeps it here: the page that got
   it on screen marks it seen; else, a few seconds later, it rings every
   device (`ring`) and the push opens it (`get`). Gone after a day. */

export const RING_AFTER_MS = 15_000
const KEEP_MS = 24 * 3_600_000
const MAX_RECENT = 10

const replyDoc = v.object({
  _id: v.id('askReplies'),
  _creationTime: v.number(),
  ...askReplyFields,
})

export const keep = internalMutation({
  args: {
    ownerId: v.string(),
    question: v.string(),
    from: v.number(),
    to: v.number(),
    title: v.string(),
    range: v.string(),
    answer: v.optional(rowsAnswerShape),
    stamp: v.optional(readStamp),
    error: v.optional(v.string()),
    cost: v.optional(v.number()),
  },
  returns: v.id('askReplies'),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('askReplies', {
      ...args,
      answeredAt: Date.now(),
    })
    /* The test backend rings sooner, so a test need not wait 15 s. */
    const after = process.env.E2E === '1' ? 1_000 : RING_AFTER_MS
    await ctx.scheduler.runAfter(after, internal.askReplies.ring, { id })
    await ctx.scheduler.runAfter(KEEP_MS, internal.askReplies.drop, { id })
    return id
  },
})

export const ring = internalMutation({
  args: { id: v.id('askReplies') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id)
    if (row === null || row.seenAt !== undefined) return null
    await ctx.db.patch(id, { rangAt: Date.now() })
    await notifyOwner(ctx, {
      ownerId: row.ownerId,
      kind: 'ask_reply',
      ...replyNote(row),
      url: `/dashboard?ask=${id}`,
      tag: `ask-${id}`,
    })
    return null
  },
})

export const drop = internalMutation({
  args: { id: v.id('askReplies') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if ((await ctx.db.get(id)) !== null) await ctx.db.delete(id)
    return null
  },
})

/** The page had it on screen, or opened it: it does not ring. */
export const seen = mutation({
  args: { id: v.id('askReplies') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ownerId = await requireUser(ctx)
    const row = await ctx.db.get(id)
    if (row === null || row.ownerId !== ownerId) return null
    if (row.seenAt === undefined) await ctx.db.patch(id, { seenAt: Date.now() })
    return null
  },
})

/** The one a push or a bell row opens; null once it is gone. */
export const get = query({
  args: { id: v.id('askReplies') },
  returns: v.union(replyDoc, v.null()),
  handler: async (ctx, { id }) => {
    const ownerId = await requireUser(ctx)
    const row = await ctx.db.get(id)
    return row !== null && row.ownerId === ownerId ? row : null
  },
})

/** A page back on screen looks for the answers it lost while away. */
export const since = query({
  args: { from: v.number() },
  returns: v.array(replyDoc),
  handler: async (ctx, { from }) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('askReplies')
      .withIndex('by_owner_and_answered', (q) =>
        q.eq('ownerId', ownerId).gte('answeredAt', from),
      )
      .take(MAX_RECENT)
  },
})
