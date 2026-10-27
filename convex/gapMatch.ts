import { ConvexError, v } from 'convex/values'

import { query } from './_generated/server'
import { mutation } from './write'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { ownedAccount } from './accounts'
import { requireUser } from './auth'
import { AFTER_MS, BEFORE_MS, transferFor } from '../src/lib/gapMatch'

/* The account sheet's question (11 Oct, docs/specs/2026-10-11-account-
   sheet-check.md): a balance its rows do not reach, and the transfer in
   another of his accounts that is the same money. `find` names it,
   `sameTransfer` writes this account's side of it and the fee, `undo`
   takes both back. The rule itself is src/lib/gapMatch. */

const gapArgs = {
  accountId: v.id('accounts'),
  currency: v.string(),
  /** The two balances the rows should join (aggregate.accountSheet's
      check): their times, and what the later one read beyond the rows. */
  from: v.number(),
  to: v.number(),
  missing: v.number(),
}
type GapArgs = {
  accountId: Id<'accounts'>
  currency: string
  from: number
  to: number
  missing: number
}

const ACCOUNTS = 50
const WINDOW_ROWS = 300

/** The transfer in another account that fits this gap, with its fee. */
async function match(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  gap: GapArgs,
) {
  const unit = gap.currency.toLowerCase()
  const accounts = await ctx.db
    .query('accounts')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
    .take(ACCOUNTS)
  const moves: Array<Doc<'logs'>> = []
  for (const a of accounts) {
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('accountId', a._id)
          .gte('occurredAt', gap.from - BEFORE_MS)
          .lte('occurredAt', gap.to + AFTER_MS),
      )
      .take(WINDOW_ROWS)
    for (const l of rows)
      if (l.kind === 'move' && l.unit === unit && l.value !== undefined)
        moves.push(l)
  }
  /* A leaving side is named by the side that arrived; an arriving side
     names its own — unless that row has since been deleted. */
  const named = new Set(moves.map((l) => l.meta?.pairOf))
  const sides = []
  for (const l of moves) {
    if (l.accountId === undefined || l.accountId === gap.accountId) continue
    const pairOf = l.meta?.pairOf
    sides.push({
      log: l,
      accountId: l.accountId,
      at: l.occurredAt,
      cents: Math.round((l.value ?? 0) * 100),
      otherAccountId: l.meta?.otherAccountId ?? null,
      paired:
        named.has(l._id) ||
        (pairOf !== undefined && (await ctx.db.get(pairOf)) !== null),
    })
  }
  const found = transferFor(
    {
      accountId: gap.accountId,
      cents: Math.round(gap.missing * 100),
      from: gap.from,
      to: gap.to,
    },
    sides,
  )
  if (found === null) return null
  const other = accounts.find((a) => a._id === found.row.accountId)
  if (other === undefined) return null
  return { log: found.row.log, other, fee: found.feeCents / 100 }
}

/**
 * Is this gap a transfer another account already shows? The row, whose
 * account it is in, and what arrived less than was sent — a log row and
 * its difference from the gap, nothing estimated. Null when none fits.
 */
export const find = query({
  args: gapArgs,
  returns: v.union(
    v.null(),
    v.object({
      logId: v.id('logs'),
      at: v.number(),
      /** What the other account's row says moved, unsigned. */
      amount: v.number(),
      fee: v.number(),
      account: v.object({
        name: v.string(),
        domain: v.union(v.string(), v.null()),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ctx.db.get(args.accountId)
    if (account === null || account.ownerId !== ownerId) return null
    const m = await match(ctx, ownerId, args)
    if (m === null) return null
    return {
      logId: m.log._id,
      at: m.log.occurredAt,
      amount: Math.abs(m.log.value ?? 0),
      fee: m.fee,
      account: { name: m.other.name, domain: m.other.domain ?? null },
    }
  },
})

/**
 * "Same transfer": this account's side of the row another account has,
 * paired to it — nothing is added there — and the fee as spending, both
 * on the later balance's time so that balance counts them. Refused when
 * the row no longer fits the gap or the balance is gone.
 */
export const sameTransfer = mutation({
  args: { ...gapArgs, logId: v.id('logs') },
  returns: v.object({
    moveId: v.id('logs'),
    feeId: v.union(v.id('logs'), v.null()),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ownedAccount(ctx, ownerId, args.accountId)
    const reading = await ctx.db
      .query('stateSnapshots')
      .withIndex('by_owner_key_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('key', `balance:${account._id}:${args.currency}`)
          .eq('recordedAt', args.to),
      )
      .first()
    if (reading === null) throw new ConvexError('That balance is gone.')
    const { logId, ...gap } = args
    const m = await match(ctx, ownerId, gap)
    if (m === null || m.log._id !== logId)
      throw new ConvexError('That transfer no longer fits.')

    const arrives = (m.log.value ?? 0) < 0
    const text = arrives
      ? `${m.other.name} → ${account.name}`
      : `${account.name} → ${m.other.name}`
    const base = {
      ownerId,
      area: 'money' as const,
      occurredAt: args.to,
      unit: args.currency.toLowerCase(),
      accountId: account._id,
    }
    const moveId = await ctx.db.insert('logs', {
      ...base,
      kind: 'move',
      value: -(m.log.value ?? 0),
      text,
      meta: {
        merchant: text,
        otherAccountId: m.other._id,
        ...(arrives ? { pairOf: m.log._id } : {}),
      },
    })
    /* The arriving side names the leaving one (schema, logs.meta.pairOf). */
    await ctx.db.patch(m.log._id, {
      meta: {
        ...m.log.meta,
        otherAccountId: account._id,
        ...(arrives ? {} : { pairOf: moveId }),
      },
    })
    const feeId =
      m.fee > 0
        ? await ctx.db.insert('logs', {
            ...base,
            kind: 'expense',
            value: m.fee,
            text: 'Transfer fee',
            meta: { category: 'fees', merchant: 'Transfer fee' },
          })
        : null
    return { moveId, feeId }
  },
})

/** Take "same transfer" back: the side it wrote and its fee. The other
    account's row stays, as it was read. */
export const undo = mutation({
  args: { moveId: v.id('logs'), feeId: v.union(v.id('logs'), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const move = await ctx.db.get(args.moveId)
    if (move === null || move.ownerId !== ownerId)
      throw new Error('No such log')
    if (move.kind !== 'move' || move.meta?.intakeId !== undefined)
      throw new ConvexError('That is not a transfer added here.')
    const otherId = move.meta?.otherAccountId
    if (move.meta?.pairOf === undefined && otherId !== undefined) {
      const near = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('accountId', otherId)
            .lte('occurredAt', move.occurredAt + AFTER_MS),
        )
        .order('desc')
        .take(WINDOW_ROWS)
      for (const l of near) {
        if (l.meta?.pairOf !== move._id) continue
        const { pairOf: _pair, ...meta } = l.meta
        await ctx.db.patch(l._id, { meta })
      }
    }
    if (args.feeId !== null) {
      const fee = await ctx.db.get(args.feeId)
      if (fee === null || fee.ownerId !== ownerId)
        throw new Error('No such log')
      if (
        fee.kind !== 'expense' ||
        fee.accountId !== move.accountId ||
        fee.occurredAt !== move.occurredAt ||
        fee.meta?.category !== 'fees'
      )
        throw new ConvexError('That is not its fee.')
      await ctx.db.delete(fee._id)
    }
    await ctx.db.delete(move._id)
    return null
  },
})
