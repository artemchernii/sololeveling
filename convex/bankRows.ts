import { ConvexError, v } from 'convex/values'

import { pickBalance } from '../src/lib/bankLink'
import { dateFrom, rowsSince } from '../src/lib/bankRows'
import { balanceKey, writeBalance } from './accounts'
import { requireUser } from './auth'
import { bankApi } from './bankApi'
import { gatherBatch, startApply } from './intake'
import { balanceIsNews } from './rowBalance'
import { internal } from './_generated/api'
import { action, internalMutation, mutation } from './_generated/server'
import type { ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/* A connected bank, slice 2 (11 Oct, docs/specs/2026-10-11-bank-connections.md):
   the bank's booked rows and its balance, through the same check a file
   goes through (docs/specs/2026-10-11-check-before-saving.md).

   Rows that reach the bank's balance are saved with no press. Rows that do
   not are held as an update with a question, and nothing of that account
   is written until he answers. Pending money is never a row. The whole
   answer or none: `arrive` is one step, and a call that failed never
   reaches it. */

const HOUR = 3_600_000
/* A check that began this long ago and never ended is taken as lost. */
const CHECK_LOST_MS = 2 * 60_000

const tx = v.object({
  status: v.string(),
  amount: v.string(),
  currency: v.string(),
  indicator: v.string(),
  bookingDate: v.optional(v.string()),
  valueDate: v.optional(v.string()),
  creditor: v.optional(v.string()),
  debtor: v.optional(v.string()),
  remittance: v.array(v.string()),
})

const asked = v.object({
  uid: v.string(),
  currency: v.string(),
  /* The day rows are asked from; null when the account holds no balance
     yet — then only the bank's balance is taken. */
  from: v.union(v.string(), v.null()),
})

/** A check begins: what to ask the bank, or why not to ask now. */
export const begin = internalMutation({
  args: { ownerId: v.string(), accountId: v.id('accounts') },
  returns: v.union(
    v.object({
      status: v.union(
        v.literal('ended'),
        v.literal('busy'),
        v.literal('question'),
      ),
    }),
    v.object({ status: v.literal('go'), asks: v.array(asked) }),
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', args.ownerId).eq('accountId', args.accountId),
      )
      .unique()
    if (link === null || link.status !== 'linked' || link.uids === undefined)
      throw new ConvexError('This account is not connected.')
    const now = Date.now()
    if (link.validUntil === undefined || link.validUntil <= now)
      return { status: 'ended' as const }
    if (link.checking !== undefined && now - link.checking < CHECK_LOST_MS)
      return { status: 'busy' as const }
    /* A question he answered is rows that arrived; one still open stops
       the check — the same rows would be asked about twice. */
    const open: Array<Id<'batches'>> = []
    const arrived = [...(link.arrived ?? [])]
    for (const id of link.questions ?? []) {
      const b = await ctx.db.get(id)
      if (b === null) continue
      if (b.status !== 'done') {
        open.push(id)
        continue
      }
      const files = await ctx.db
        .query('intakes')
        .withIndex('by_owner_batch', (q) =>
          q.eq('ownerId', args.ownerId).eq('batchId', id),
        )
        .take(5)
      arrived.push(...files.map((f) => f._id))
    }
    await ctx.db.patch(link._id, {
      questions: open,
      arrived,
      ...(open.length === 0 ? { checking: now } : {}),
    })
    if (open.length > 0) return { status: 'question' as const }
    const asks: Array<typeof asked.type> = []
    for (const u of link.uids) {
      const held = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', args.ownerId)
            .eq('key', balanceKey(args.accountId, u.currency)),
        )
        .order('desc')
        .first()
      asks.push({
        ...u,
        from: held?.value === undefined ? null : dateFrom(held.recordedAt),
      })
    }
    return { status: 'go' as const, asks }
  },
})

/** The bank did not answer: the check is over and nothing was written. */
export const fail = internalMutation({
  args: { ownerId: v.string(), accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', args.ownerId).eq('accountId', args.accountId),
      )
      .unique()
    if (link !== null) await ctx.db.patch(link._id, { checking: undefined })
    return null
  },
})

/** The bank answered, whole: each currency's balance and booked rows are
    laid against what the account holds. They add up → saved, the bank's
    balance stored. They do not → kept as an update with a question. */
export const arrive = internalMutation({
  args: {
    ownerId: v.string(),
    accountId: v.id('accounts'),
    dayStart: v.number(),
    names: v.array(v.string()),
    readings: v.array(
      v.object({ currency: v.string(), value: v.number(), rows: v.array(tx) }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { ownerId } = args
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', args.accountId),
      )
      .unique()
    const account = await ctx.db.get(args.accountId)
    if (link === null || account === null || account.ownerId !== ownerId)
      throw new ConvexError('This account is not connected.')
    const at = Date.now()
    const arrived = [...(link.arrived ?? [])]
    const questions = [...(link.questions ?? [])]
    for (const r of args.readings) {
      /* A file's balance is of the end of its day, written six hours on;
         the bank's is of this moment. */
      const balance = {
        currency: r.currency,
        value: r.value,
        asOf: at - 6 * HOUR,
      }
      const held = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', balanceKey(account._id, r.currency)),
        )
        .order('desc')
        .first()
      const rows =
        held?.value === undefined
          ? []
          : rowsSince(r.rows, held.recordedAt, at).filter(
              (x) => x.currency === r.currency,
            )
      if (rows.length > 0) {
        const batchId = await ctx.db.insert('batches', {
          ownerId,
          status: 'open',
          leftOut: [],
          quietMonths: [],
          moves: [],
          extras: [],
          dismissed: [],
          via: 'bank',
        })
        const intakeId = await ctx.db.insert('intakes', {
          ownerId,
          accountId: account._id,
          batchId,
          storageIds: [],
          status: 'ready',
          kind: 'transactions',
          title: account.name,
          readAt: at,
          transactions: rows,
          balance,
          files: [
            { name: 'from the bank', size: 0, contentType: 'text/plain' },
          ],
          via: 'bank',
        })
        const b = await ctx.db.get(batchId)
        if (b === null) throw new Error('No such batch')
        const mine = (
          await gatherBatch(ctx, ownerId, b, args.names)
        ).accounts.find((x) => x.accountId === account._id)
        if (mine !== undefined && mine.fresh > 0) {
          if (mine.held) questions.push(batchId)
          else {
            await startApply(ctx, ownerId, b, args.names, args.dayStart)
            arrived.push(intakeId)
          }
          continue
        }
        /* Every row is one he has: nothing to save but, maybe, the balance. */
        await ctx.db.delete(intakeId)
        await ctx.db.delete(batchId)
      }
      if (
        held?.value === undefined ||
        (await balanceIsNews(ctx, ownerId, account._id, balance))
      )
        await writeBalance(
          ctx,
          ownerId,
          account,
          r.currency,
          r.value,
          args.dayStart,
          at,
          'sync',
        )
    }
    await ctx.db.patch(link._id, {
      checking: undefined,
      checkedAt: at,
      arrived,
      questions,
    })
    return null
  },
})

export type Checked = 'checked' | 'ended' | 'busy' | 'question'

/** Ask the bank and lay its answer against the account. Every call is
    made before a thing is written; one that fails writes nothing. */
export async function pull(
  ctx: ActionCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  dayStart: number,
): Promise<Checked> {
  const start = await ctx.runMutation(internal.bankRows.begin, {
    ownerId,
    accountId,
  })
  if (start.status !== 'go') return start.status
  try {
    const api = bankApi()
    const readings = []
    for (const a of start.asks) {
      const value = pickBalance(await api.balances(a.uid), a.currency)
      if (value === null)
        throw new ConvexError('The bank gave no balance. Nothing was saved.')
      readings.push({
        currency: a.currency,
        value,
        rows: a.from === null ? [] : await api.transactions(a.uid, a.from),
      })
    }
    const name = (await ctx.auth.getUserIdentity())?.name
    await ctx.runMutation(internal.bankRows.arrive, {
      ownerId,
      accountId,
      dayStart,
      names: name ? [name] : [],
      readings,
    })
  } catch (e) {
    await ctx.runMutation(internal.bankRows.fail, { ownerId, accountId })
    throw e
  }
  return 'checked'
}

/** Finances was opened and the bank's last answer is old: ask again. */
export const check = action({
  args: { accountId: v.id('accounts'), dayStart: v.number() },
  returns: v.union(
    v.literal('checked'),
    v.literal('ended'),
    v.literal('busy'),
    v.literal('question'),
  ),
  handler: async (ctx, args): Promise<Checked> => {
    const ownerId = await requireUser(ctx)
    return await pull(ctx, ownerId, args.accountId, args.dayStart)
  },
})

/** ✕ on the card's arrived rows: seen. The rows stay saved. */
export const close = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const link = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', args.accountId),
      )
      .unique()
    if (link === null) throw new ConvexError('This account is not connected.')
    await ctx.db.patch(link._id, { arrived: [] })
    return null
  },
})
