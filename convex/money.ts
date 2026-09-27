import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount } from './accounts'
import { mutation } from './_generated/server'

/* "Log something that matters" (Treasury, 27 Sep): the few moments worth
   typing — a transfer, a big purchase, money that came in. Small spending
   comes in by the batch from statements and screenshots (intake.ts); this
   is not for the coffee. Each writes one log in the account it happened
   in. */

const FUTURE_GRACE_MS = 5 * 60_000

function checkAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    throw new ConvexError('That is not an amount.')
  }
  return Math.round(amount * 100) / 100
}

function checkWhen(occurredAt: number) {
  if (occurredAt > Date.now() + FUTURE_GRACE_MS) {
    throw new ConvexError('It has to have happened.')
  }
}

function cleanNote(note: string | undefined) {
  const n = note?.trim()
  if (n && n.length > 200) throw new ConvexError('That note is too long.')
  return n || undefined
}

/**
 * Money between his own accounts — not spending, not income. One log in
 * the account it left (signed: negative), naming the account it went to,
 * in that account's currency.
 */
export const logMove = mutation({
  args: {
    fromAccountId: v.id('accounts'),
    toAccountId: v.id('accounts'),
    amount: v.number(),
    currency: v.string(),
    occurredAt: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const from = await ownedAccount(ctx, ownerId, args.fromAccountId)
    const to = await ownedAccount(ctx, ownerId, args.toAccountId)
    if (from._id === to._id)
      throw new ConvexError('From and to are the same account.')
    if (!from.currencies.includes(args.currency)) {
      throw new ConvexError(`${from.name} does not hold ${args.currency}.`)
    }
    const amount = checkAmount(args.amount)
    checkWhen(args.occurredAt)
    return await ctx.db.insert('logs', {
      ownerId,
      kind: 'move',
      area: 'money',
      occurredAt: args.occurredAt,
      value: -amount,
      unit: args.currency.toLowerCase(),
      text: cleanNote(args.note) ?? `${from.name} → ${to.name}`,
      accountId: from._id,
      meta: { otherAccountId: to._id, merchant: `${from.name} → ${to.name}` },
    })
  },
})

/** Money out that matters — a purchase worth a line and a note. */
export const logOut = mutation({
  args: {
    accountId: v.id('accounts'),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    occurredAt: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    if (!account.currencies.includes(args.currency)) {
      throw new ConvexError(`${account.name} does not hold ${args.currency}.`)
    }
    const category = args.category.trim().toLowerCase()
    if (category.length === 0 || category.length > 24) {
      throw new ConvexError('Pick what it was.')
    }
    checkWhen(args.occurredAt)
    const note = cleanNote(args.note)
    return await ctx.db.insert('logs', {
      ownerId,
      kind: 'expense',
      area: 'money',
      occurredAt: args.occurredAt,
      value: checkAmount(args.amount),
      unit: args.currency.toLowerCase(),
      text: note ?? 'Purchase',
      accountId: account._id,
      meta: { category, merchant: note ?? 'Purchase' },
    })
  },
})

/** Money in that is not the salary — a bonus, an IRS return, a gift. */
export const logIn = mutation({
  args: {
    accountId: v.id('accounts'),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    occurredAt: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    if (!account.currencies.includes(args.currency)) {
      throw new ConvexError(`${account.name} does not hold ${args.currency}.`)
    }
    const category = args.category.trim().toLowerCase()
    if (category.length === 0 || category.length > 24) {
      throw new ConvexError('Pick what it was.')
    }
    checkWhen(args.occurredAt)
    const note = cleanNote(args.note)
    return await ctx.db.insert('logs', {
      ownerId,
      kind: 'income',
      area: 'money',
      occurredAt: args.occurredAt,
      value: checkAmount(args.amount),
      unit: args.currency.toLowerCase(),
      text: note ?? category,
      accountId: account._id,
      meta: { category, merchant: note ?? category },
    })
  },
})
