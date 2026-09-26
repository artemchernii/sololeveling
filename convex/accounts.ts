import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'

/* Where his money sits (Finances F2, 26 Sep). A balance is a state — see
   `balanceKey` — typed like a weigh-in; this file owns the accounts and
   the one write that records a reading. The numbers are read in
   aggregate.ts (`balances`). */

const MAX_ACCOUNTS = 50
const MAX_NAME = 40

/** The stateSnapshots key a balance is stored under. */
export function balanceKey(accountId: Id<'accounts'>): string {
  return `balance:${accountId}`
}

export async function ownedAccount(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
): Promise<Doc<'accounts'>> {
  const account = await ctx.db.get(accountId)
  if (account === null || account.ownerId !== ownerId) {
    throw new Error('No such account')
  }
  return account
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new ConvexError('An account needs a name.')
  if (trimmed.length > MAX_NAME) {
    throw new ConvexError('That name is too long.')
  }
  return trimmed
}

async function ownAccounts(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db
    .query('accounts')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
    .take(MAX_ACCOUNTS)
}

/** His live accounts, in his order. */
export const list = query({
  args: {},
  returns: v.array(schema.doc('accounts')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ownAccounts(ctx, ownerId)
    return rows.filter((a) => a.retiredAt === undefined)
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal('bank'), v.literal('broker')),
  },
  returns: v.id('accounts'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const name = cleanName(args.name)
    const rows = await ownAccounts(ctx, ownerId)
    if (rows.length >= MAX_ACCOUNTS) {
      throw new ConvexError('That is a lot of accounts — retire one first.')
    }
    if (
      rows.some(
        (a) =>
          a.retiredAt === undefined &&
          a.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new ConvexError(`There is already an account called ${name}.`)
    }
    const order = rows.reduce((max, a) => Math.max(max, a.order), -1) + 1
    return await ctx.db.insert('accounts', {
      ownerId,
      name,
      kind: args.kind,
      order,
    })
  },
})

export const rename = mutation({
  args: { accountId: v.id('accounts'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedAccount(ctx, ownerId, args.accountId)
    await ctx.db.patch(args.accountId, { name: cleanName(args.name) })
    return null
  },
})

/** Off the lists; its readings and trades stay, because they happened. */
export const retire = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedAccount(ctx, ownerId, args.accountId)
    await ctx.db.patch(args.accountId, { retiredAt: Date.now() })
    return null
  },
})

/**
 * What the account holds now, as he read it off the bank's app — a new
 * state row, so the old one stays as history. A second reading on the same
 * day replaces that day's (like a weigh-in), so correcting a typo does not
 * leave a false point on the line.
 */
export const setBalance = mutation({
  args: {
    accountId: v.id('accounts'),
    value: v.number(),
    /** Local midnight today, from the client — the server does not know
        where "today" starts for him. */
    dayStart: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedAccount(ctx, ownerId, args.accountId)
    if (!Number.isFinite(args.value) || Math.abs(args.value) > 1e10) {
      throw new ConvexError('That is not an amount in euros.')
    }
    const key = balanceKey(args.accountId)
    const today = await ctx.db
      .query('stateSnapshots')
      .withIndex('by_owner_key_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('key', key)
          .gte('recordedAt', args.dayStart),
      )
      .take(20)
    for (const row of today) await ctx.db.delete(row._id)
    await ctx.db.insert('stateSnapshots', {
      ownerId,
      area: 'money',
      key,
      value: Math.round(args.value * 100) / 100,
      unit: 'eur',
      recordedAt: Date.now(),
    })
    return null
  },
})

/**
 * Gone for good — only an account nothing hangs off yet: no trades, no
 * bills. A typo'd "Revoult" should not linger as a retired row. Its
 * balance readings go with it; they were readings of an account that is
 * not his.
 */
export const remove = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedAccount(ctx, ownerId, args.accountId)
    const trade = await ctx.db
      .query('trades')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', args.accountId),
      )
      .first()
    const bills = await ctx.db
      .query('recurring')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(100)
    if (trade !== null || bills.some((b) => b.accountId === args.accountId)) {
      throw new ConvexError(
        'Trades or bills use this account — retire it instead.',
      )
    }
    const readings = await ctx.db
      .query('stateSnapshots')
      .withIndex('by_owner_key_time', (q) =>
        q.eq('ownerId', ownerId).eq('key', balanceKey(args.accountId)),
      )
      .take(1000)
    for (const r of readings) await ctx.db.delete(r._id)
    await ctx.db.delete(args.accountId)
    return null
  },
})
