import { ConvexError, v } from 'convex/values'

import { balanceKey, brokerCashKey, hasBrokerCash } from './accounts'
import { movedSince, tradedSince } from './aggregate'
import { requireUser } from './auth'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* Take a file back (11 Oct). Artem: "I cant run fixes and db fixes after
   every update to clean the mess." Everything one saved file wrote goes —
   its rows in any account, its buys and sells, the positions it showed and
   the balance it set — and the account is as it was before. The reading
   itself stays (`takenBackAt`), so the same file dropped again is not read
   a second time. Rows another file wrote are never touched: one that was
   paired with a row of this file stays, unpaired. */

/* Rows taken in one go; a longer file goes on in `rest`. */
const STEP = 1500
const KEY_ROWS = 500
const TRADE_ROWS = 6000
/* How far from a transfer's day its other side can sit (the other bank
   books later, or an older file is dropped after a newer one). */
const PAIR_MS = 10 * 86_400_000
const PAIR_ROWS = 200
/* A balance saved before balances carried their file is its file's when
   it is the same amount within three days (aggregate.accountSheet). */
const FILE_READING_MS = 3 * 86_400_000
const ELSEWHERE = 3

async function owned(
  ctx: QueryCtx,
  ownerId: string,
  intakeId: Id<'intakes'>,
): Promise<Doc<'intakes'>> {
  const intake = await ctx.db.get(intakeId)
  if (intake === null || intake.ownerId !== ownerId)
    throw new Error('No such file')
  return intake
}

function saved(intake: Doc<'intakes'>) {
  if (intake.status !== 'done')
    throw new ConvexError('That file is not saved yet.')
  if (intake.takenBackAt !== undefined)
    throw new ConvexError('That file is already taken back.')
}

async function accountOf(
  ctx: QueryCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
): Promise<Doc<'accounts'> | null> {
  if (intake.accountId === undefined) return null
  const a = await ctx.db.get(intake.accountId)
  return a !== null && a.ownerId === ownerId ? a : null
}

function rowsOf(ctx: QueryCtx, ownerId: string, intakeId: Id<'intakes'>) {
  return ctx.db
    .query('logs')
    .withIndex('by_owner_intake', (q) =>
      q.eq('ownerId', ownerId).eq('meta.intakeId', intakeId),
    )
}

type Pocket = { key: string; currency: string; broker: boolean }

function pocketsOf(account: Doc<'accounts'>): Array<Pocket> {
  return [
    ...account.currencies.map((currency) => ({
      key: balanceKey(account._id, currency),
      currency,
      broker: false,
    })),
    ...(hasBrokerCash(account)
      ? [{ key: brokerCashKey(account._id), currency: 'EUR', broker: true }]
      : []),
  ]
}

/** Is this balance the file's: by its tag, or — saved before the tag, by
    the file that was read, not a second drop of it — by amount and day. */
function setBy(
  r: Doc<'stateSnapshots'>,
  intake: Doc<'intakes'>,
  p: Pocket,
  untagged: boolean,
): boolean {
  if (r.intakeId !== undefined) return r.intakeId === intake._id
  const b = intake.balance
  return (
    untagged &&
    intake.reusedFrom === undefined &&
    !p.broker &&
    r.source !== 'typed' &&
    r.source !== 'sync' &&
    b !== undefined &&
    b.currency === p.currency &&
    Math.round(b.value * 100) === Math.round((r.value ?? 0) * 100) &&
    Math.abs(b.asOf - r.recordedAt) <= FILE_READING_MS
  )
}

async function readingsOf(
  ctx: QueryCtx,
  ownerId: string,
  p: Pocket,
): Promise<Array<Doc<'stateSnapshots'>>> {
  return await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q.eq('ownerId', ownerId).eq('key', p.key),
    )
    .order('desc')
    .take(KEY_ROWS)
}

async function standing(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  p: Pocket,
  row: Doc<'stateSnapshots'> | undefined,
  skip?: Id<'intakes'>,
): Promise<number | null> {
  if (row === undefined) return null
  const since = p.broker
    ? await tradedSince(ctx, ownerId, account, row.recordedAt, skip)
    : await movedSince(
        ctx,
        ownerId,
        account,
        p.currency,
        row.recordedAt,
        undefined,
        skip,
      )
  return (Math.round((row.value ?? 0) * 100) + since.cents) / 100
}

/** What taking this file back removes, and what its account's cash is
    then — said before the press. Sources: state (a balance) and logged
    rows after it, one currency, as `aggregate.balances` counts them. */
export const preview = query({
  args: { intakeId: v.id('intakes') },
  returns: v.union(
    v.null(),
    v.object({
      account: v.union(v.string(), v.null()),
      rows: v.number(),
      trades: v.number(),
      positions: v.number(),
      /** Rows it wrote in other accounts: the first few, and how many. */
      elsewhere: v.array(
        v.object({
          account: v.string(),
          domain: v.union(v.string(), v.null()),
          amount: v.number(),
          currency: v.string(),
          at: v.number(),
        }),
      ),
      elsewhereRows: v.number(),
      /** The day of the balance that goes with it. */
      balanceOf: v.union(v.number(), v.null()),
      cash: v.union(
        v.null(),
        v.object({
          currency: v.string(),
          now: v.number(),
          /** Null: no balance is left to stand on. */
          after: v.union(v.number(), v.null()),
          /** The day of the balance it stands on afterwards. */
          afterOf: v.union(v.number(), v.null()),
          /** A balance newer than this file's stays, so nothing moves. */
          newer: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await owned(ctx, ownerId, args.intakeId)
    if (intake.status !== 'done' || intake.takenBackAt !== undefined)
      return null
    const account = await accountOf(ctx, ownerId, intake)
    const logs = await rowsOf(ctx, ownerId, intake._id).take(STEP * 2)
    const away = logs.filter((l) => l.accountId !== account?._id)
    const names = new Map<Id<'accounts'>, Doc<'accounts'> | null>()
    const elsewhere = []
    for (const l of away.slice(0, ELSEWHERE)) {
      if (l.accountId === undefined) continue
      if (!names.has(l.accountId)) {
        const a = await ctx.db.get(l.accountId)
        names.set(l.accountId, a !== null && a.ownerId === ownerId ? a : null)
      }
      const a = names.get(l.accountId)
      if (!a) continue
      elsewhere.push({
        account: a.name,
        domain: a.domain ?? null,
        amount: l.kind === 'expense' ? -(l.value ?? 0) : (l.value ?? 0),
        currency: (l.unit ?? 'eur').toUpperCase(),
        at: l.occurredAt,
      })
    }
    let trades = 0
    let positions = 0
    let balanceOf: number | null = null
    let cash = null
    if (account !== null) {
      trades = (
        await ctx.db
          .query('trades')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ownerId).eq('accountId', account._id),
          )
          .take(TRADE_ROWS)
      ).filter((t) => t.importId === intake._id).length
      positions = (
        await ctx.db
          .query('holdings')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ownerId).eq('accountId', account._id),
          )
          .take(TRADE_ROWS)
      ).filter((h) => h.importId === intake._id).length
      /* One pocket is shown: the one whose balance the file set, else the
         one its rows are in. */
      const unit = logs.find((l) => l.accountId === account._id)?.unit
      let shown: {
        p: Pocket
        all: Array<Doc<'stateSnapshots'>>
        mine: Array<Doc<'stateSnapshots'>>
      } | null = null
      for (const p of pocketsOf(account)) {
        const all = await readingsOf(ctx, ownerId, p)
        const mine = all.filter((r) => setBy(r, intake, p, true))
        const first = intake.balance?.currency ?? unit?.toUpperCase()
        if (
          shown === null
            ? mine.length > 0 || (!p.broker && p.currency === first)
            : mine.length > 0 &&
              shown.mine.length === 0 &&
              (p.broker || p.currency === first)
        )
          shown = { p, all, mine }
      }
      if (shown !== null && shown.all.length > 0) {
        const { p, all, mine } = shown
        const left = all.filter((r) => !mine.includes(r))
        const now = await standing(ctx, ownerId, account, p, all.at(0))
        const after = await standing(
          ctx,
          ownerId,
          account,
          p,
          left.at(0),
          intake._id,
        )
        balanceOf =
          mine.length === 0
            ? null
            : (intake.balance?.asOf ?? mine[0].recordedAt)
        if (now !== null)
          cash = {
            currency: p.currency,
            now,
            after,
            afterOf: left.at(0)?.recordedAt ?? null,
            newer: mine.length > 0 && all[0] !== mine[0],
          }
      }
    }
    return {
      account: account?.name ?? null,
      rows: logs.length - away.length,
      trades,
      positions,
      elsewhere,
      elsewhereRows: away.length,
      balanceOf,
      cash,
    }
  },
})

/* A row of another file that named one of these as its other side stays,
   as it was read, with no pair. */
async function unpair(ctx: MutationCtx, ownerId: string, l: Doc<'logs'>) {
  const otherId = l.meta?.otherAccountId
  if (l.kind !== 'move' || otherId === undefined) return
  const near = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', otherId)
        .gte('occurredAt', l.occurredAt - PAIR_MS)
        .lte('occurredAt', l.occurredAt + PAIR_MS),
    )
    .take(PAIR_ROWS)
  for (const o of near) {
    if (o.meta?.pairOf !== l._id || o.meta.intakeId === l.meta?.intakeId)
      continue
    const { pairOf: _pair, ...meta } = o.meta
    await ctx.db.patch(o._id, { meta })
  }
}

/** Removes what the file wrote, a step at a time; true when more is left. */
async function erase(
  ctx: MutationCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  untagged: boolean,
): Promise<boolean> {
  let left = STEP
  const logs = await rowsOf(ctx, ownerId, intake._id).take(left)
  for (const l of logs) {
    await unpair(ctx, ownerId, l)
    await ctx.db.delete(l._id)
  }
  left -= logs.length
  const account = await accountOf(ctx, ownerId, intake)
  if (account !== null && left > 0) {
    const trades = (
      await ctx.db
        .query('trades')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', account._id),
        )
        .take(TRADE_ROWS)
    ).filter((t) => t.importId === intake._id)
    for (const t of trades.slice(0, left)) await ctx.db.delete(t._id)
    left -= Math.min(left, trades.length)
    if (left > 0) {
      const looks = (
        await ctx.db
          .query('holdings')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ownerId).eq('accountId', account._id),
          )
          .take(TRADE_ROWS)
      ).filter((h) => h.importId === intake._id)
      for (const h of looks.slice(0, left)) await ctx.db.delete(h._id)
      left -= Math.min(left, looks.length)
    }
    if (left > 0)
      for (const p of pocketsOf(account))
        for (const r of await readingsOf(ctx, ownerId, p))
          if (setBy(r, intake, p, untagged)) await ctx.db.delete(r._id)
  }
  if (left > 0) return false
  await ctx.scheduler.runAfter(0, internal.undoFile.rest, {
    intakeId: intake._id,
    untagged,
  })
  return true
}

export const rest = internalMutation({
  args: { intakeId: v.id('intakes'), untagged: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intakeId)
    if (intake !== null) await erase(ctx, intake.ownerId, intake, args.untagged)
    return null
  },
})

/** Take one saved file back, from where it is opened. */
export const takeBack = mutation({
  args: { intakeId: v.id('intakes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const intake = await owned(ctx, ownerId, args.intakeId)
    saved(intake)
    await ctx.db.patch(intake._id, { takenBackAt: Date.now() })
    await erase(ctx, ownerId, intake, true)
    return null
  },
})

/** Undo a save, from the card it landed on: every file of that drop that
    was saved. Only what carries the file's own mark goes — a file dropped
    a second time wrote nothing, and its first save is not this one. */
export const takeBackBatch = mutation({
  args: { batchId: v.id('batches') },
  returns: v.number(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const batch = await ctx.db.get(args.batchId)
    if (batch === null || batch.ownerId !== ownerId)
      throw new Error('No such drop')
    const files = (
      await ctx.db
        .query('intakes')
        .withIndex('by_owner_batch', (q) =>
          q.eq('ownerId', ownerId).eq('batchId', batch._id),
        )
        .take(200)
    ).filter((i) => i.status === 'done' && i.takenBackAt === undefined)
    if (files.length === 0)
      throw new ConvexError('Nothing of that save is left to undo.')
    for (const intake of files) {
      await ctx.db.patch(intake._id, { takenBackAt: Date.now() })
      await erase(ctx, ownerId, intake, false)
    }
    return files.length
  },
})
