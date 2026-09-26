import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount } from './accounts'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'
import { billWhenRefusal, dueDay } from '../src/lib/bills'

/* Bills and salary that come round (Finances F3, 26 Sep). A row here is the
   plan; `markPaid` writes the expense or income log that is the evidence,
   carrying `meta.recurringId`, and nothing writes one by itself — ticking a
   plan says money was meant to move, only his tap says it did (CLAUDE.md,
   intent is not evidence). */

const MAX_ITEMS = 100
const MAX_NAME = 40
/* A month of money rows, the same bound aggregate.moneySums reads under. */
const MONEY_ROWS = 1000

const cadence = v.union(v.literal('monthly'), v.literal('yearly'))
const kind = v.union(v.literal('expense'), v.literal('income'))

async function ownedItem(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  id: Id<'recurring'>,
): Promise<Doc<'recurring'>> {
  const item = await ctx.db.get(id)
  if (item === null || item.ownerId !== ownerId) {
    throw new Error('No such bill')
  }
  return item
}

function checked(args: {
  name: string
  amount: number
  cadence: 'monthly' | 'yearly'
  day: number
  month?: number
}) {
  const name = args.name.trim()
  if (name.length === 0) throw new ConvexError('A bill needs a name.')
  if (name.length > MAX_NAME) throw new ConvexError('That name is too long.')
  if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > 1e8) {
    throw new ConvexError('That is not an amount in euros.')
  }
  const refusal = billWhenRefusal(args)
  if (refusal !== null) throw new ConvexError(refusal)
  return {
    name,
    amount: Math.round(args.amount * 100) / 100,
    month: args.cadence === 'yearly' ? args.month : undefined,
  }
}

const fields = {
  name: v.string(),
  kind,
  amount: v.number(),
  category: v.optional(v.string()),
  accountId: v.optional(v.id('accounts')),
  cadence,
  day: v.number(),
  month: v.optional(v.number()),
}

export const create = mutation({
  args: fields,
  returns: v.id('recurring'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const clean = checked(args)
    if (args.accountId) await ownedAccount(ctx, ownerId, args.accountId)
    const existing = await ctx.db
      .query('recurring')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(MAX_ITEMS)
    if (existing.length >= MAX_ITEMS) {
      throw new ConvexError('That is a lot of bills — end one first.')
    }
    return await ctx.db.insert('recurring', {
      ownerId,
      name: clean.name,
      kind: args.kind,
      amount: clean.amount,
      category: args.category,
      accountId: args.accountId,
      cadence: args.cadence,
      day: args.day,
      month: clean.month,
    })
  },
})

export const update = mutation({
  args: { id: v.id('recurring'), ...fields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedItem(ctx, ownerId, args.id)
    const clean = checked(args)
    if (args.accountId) await ownedAccount(ctx, ownerId, args.accountId)
    await ctx.db.patch(args.id, {
      name: clean.name,
      kind: args.kind,
      amount: clean.amount,
      category: args.category,
      accountId: args.accountId,
      cadence: args.cadence,
      day: args.day,
      month: clean.month,
    })
    return null
  },
})

/** No longer comes round. Its payments stay: they happened. */
export const end = mutation({
  args: { id: v.id('recurring') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedItem(ctx, ownerId, args.id)
    await ctx.db.patch(args.id, { endedAt: Date.now() })
    return null
  },
})

/**
 * His tap: it was paid (or it arrived). Writes one expense or income log
 * for the bill's amount — or the amount he says, when this month's was
 * different — dated when he says, now by default. Returns the log's id
 * for the one-tap undo.
 */
export const markPaid = mutation({
  args: {
    id: v.id('recurring'),
    occurredAt: v.number(),
    amount: v.optional(v.number()),
  },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const item = await ownedItem(ctx, ownerId, args.id)
    const amount = args.amount ?? item.amount
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ConvexError('That is not an amount in euros.')
    }
    if (args.occurredAt > Date.now() + 5 * 60_000) {
      throw new ConvexError('A payment is something that happened.')
    }
    const meta: Doc<'logs'>['meta'] = { recurringId: item._id }
    if (item.category !== undefined) meta.category = item.category
    return await ctx.db.insert('logs', {
      ownerId,
      kind: item.kind,
      area: 'money',
      occurredAt: args.occurredAt,
      value: Math.round(amount * 100) / 100,
      unit: 'eur',
      text: item.name,
      meta,
    })
  },
})

/**
 * The month's bills, each on its day, and whether it has been paid — the
 * strip on the Bills tab. Paid means a log in this month carries the bill's
 * id; the log is the fact, and removing it makes the bill due again.
 * Month boundaries arrive from the client, as everywhere else.
 */
export const month = query({
  args: {
    year: v.number(),
    month: v.number(),
    start: v.number(),
    end: v.number(),
  },
  returns: v.array(
    v.object({
      item: schema.doc('recurring'),
      day: v.number(),
      paid: v.union(
        v.object({
          logId: v.id('logs'),
          occurredAt: v.number(),
          value: v.number(),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const items = await ctx.db
      .query('recurring')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(MAX_ITEMS)
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('area', 'money')
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .take(MONEY_ROWS)

    const out = []
    for (const item of items) {
      const paidLog = logs.find((l) => l.meta?.recurringId === item._id)
      /* An ended bill still shows in a month it was paid in. */
      if (item.endedAt !== undefined && item.endedAt < args.start && !paidLog) {
        continue
      }
      const day = dueDay(item, args.year, args.month)
      if (day === null && !paidLog) continue
      out.push({
        item,
        day: day ?? new Date(paidLog!.occurredAt).getDate(),
        paid: paidLog
          ? {
              logId: paidLog._id,
              occurredAt: paidLog.occurredAt,
              value: paidLog.value ?? 0,
            }
          : null,
      })
    }
    out.sort((a, b) => a.day - b.day || a.item.name.localeCompare(b.item.name))
    return out
  },
})

/**
 * Gone for good — only a bill never paid (a typo, a trial). Once a payment
 * points at it, it is ended instead, so the payment keeps what it was for.
 */
export const remove = mutation({
  args: { id: v.id('recurring') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const item = await ownedItem(ctx, ownerId, args.id)
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q.eq('ownerId', ownerId).eq('area', 'money'),
      )
      .order('desc')
      .take(5000)
    if (logs.some((l) => l.meta?.recurringId === item._id)) {
      throw new ConvexError('It has been paid before — end it instead.')
    }
    await ctx.db.delete(item._id)
    return null
  },
})
