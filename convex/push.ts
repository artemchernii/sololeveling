import { v } from 'convex/values'

import { requireUser } from './auth'
import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { notificationKind, pushDevice } from './schema'

/* N1 (15 Oct). The pipe: a browser that allowed notifications saves its
   subscription here; anything worth a notification calls `notify`, which
   writes the bell's row and hands the push to `pushNode.send`. */

const MAX_DEVICES = 10

export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    device: pushDevice,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const same = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_owner_and_endpoint', (q) =>
        q.eq('ownerId', ownerId).eq('endpoint', args.endpoint),
      )
      .unique()
    if (same !== null) {
      /* A phone that subscribes again keeps one row, with its new keys. */
      await ctx.db.patch(same._id, {
        p256dh: args.p256dh,
        auth: args.auth,
        device: args.device,
      })
      return null
    }
    const mine = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(MAX_DEVICES)
    if (mine.length >= MAX_DEVICES) {
      throw new Error(`At most ${MAX_DEVICES} devices`)
    }
    await ctx.db.insert('pushSubscriptions', {
      ownerId,
      ...args,
      createdAt: Date.now(),
    })
    return null
  },
})

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await dropOne(ctx, ownerId, args.endpoint)
    return null
  },
})

/** The VAPID public key a browser subscribes with; null until it is set. */
export const publicKey = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    await requireUser(ctx)
    return process.env.VAPID_PUBLIC_KEY ?? null
  },
})

/** Which of his devices are on — the bell's iPhone · Mac. */
export const devices = query({
  args: {},
  returns: v.object({ iphone: v.boolean(), mac: v.boolean() }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const mine = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(MAX_DEVICES)
    return {
      iphone: mine.some((s) => s.device === 'iphone'),
      mac: mine.some((s) => s.device === 'mac'),
    }
  },
})

/** SEND A TEST on the [ IPHONE ] window. */
export const sendTest = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    await notifyOwner(ctx, {
      ownerId,
      kind: 'test',
      title: 'Test',
      body: 'Leveling',
      url: '/phone',
    })
    return null
  },
})

const notifyArgs = {
  ownerId: v.string(),
  kind: notificationKind,
  title: v.string(),
  body: v.string(),
  url: v.string(),
}

export async function notifyOwner(
  ctx: MutationCtx,
  args: {
    ownerId: string
    kind: 'reminder' | 'file_read' | 'file_failed' | 'test'
    title: string
    body: string
    url: string
    /** One notification per tag: a reminder's occurrence id. */
    tag?: string
  },
) {
  const { tag, ...row } = args
  await ctx.db.insert('notifications', { ...row, sentAt: Date.now() })
  await ctx.scheduler.runAfter(0, internal.pushNode.send, {
    ownerId: args.ownerId,
    title: args.title,
    body: args.body,
    url: args.url,
    tag,
  })
}

/** Anything worth a notification calls this (reminders, files read). */
export const notify = internalMutation({
  args: notifyArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await notifyOwner(ctx, args)
    return null
  },
})

/** For the sender: where to push. */
export const subscriptionsOf = internalQuery({
  args: { ownerId: v.string() },
  returns: v.array(
    v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() }),
  ),
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_owner', (q) => q.eq('ownerId', args.ownerId))
      .take(MAX_DEVICES)
    return mine.map(({ endpoint, p256dh, auth }) => ({
      endpoint,
      p256dh,
      auth,
    }))
  },
})

/** The push service said this browser let go (404/410). */
export const drop = internalMutation({
  args: { ownerId: v.string(), endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await dropOne(ctx, args.ownerId, args.endpoint)
    return null
  },
})

async function dropOne(ctx: MutationCtx, ownerId: string, endpoint: string) {
  const row = await ctx.db
    .query('pushSubscriptions')
    .withIndex('by_owner_and_endpoint', (q) =>
      q.eq('ownerId', ownerId).eq('endpoint', endpoint),
    )
    .unique()
  if (row !== null) await ctx.db.delete(row._id)
}
