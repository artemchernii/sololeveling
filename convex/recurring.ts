import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { ownedAccount } from './accounts'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'
import { billWhenRefusal, dueDay } from '../src/lib/bills'
import {
  EVERYDAY,
  billNames,
  findBills,
  isKnown,
  likelyBills,
} from '../src/lib/findBills'
import type { BillRow, Known } from '../src/lib/findBills'
import { isEuroAmount } from '../src/lib/money'
import { payeeKey, rowKey } from '../src/lib/payee'
import { paysBill } from '../src/lib/ahead'

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
      matchKey: payeeKey(clean.name) || undefined,
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
      if (item.refusedAt !== undefined) continue
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

/* ── Flow (3 Oct): bills found, struck out, made from a row ─────────── */

const DAY = 86_400_000

/** Every bill he has or refused, as what findBills must leave alone. A
    bill typed before Flow has no key: its name stands in. */
export function knownOf(items: ReadonlyArray<Doc<'recurring'>>): Array<Known> {
  return items.map((i) => ({
    key: i.matchKey ?? payeeKey(i.name),
    amount: i.amount,
    varies: i.varies,
  }))
}

/** Money rows as findBills reads them: euros only, money in only into a
    bank (a broker's dividends are not a salary), moves left out. */
export function billRows(
  logs: ReadonlyArray<Doc<'logs'>>,
  accounts: ReadonlyArray<Doc<'accounts'>>,
): Array<BillRow & { id: Id<'logs'> }> {
  const bank = new Set(
    accounts.filter((a) => a.kinds.includes('bank')).map((a) => a._id),
  )
  const out = []
  for (const l of logs) {
    if (l.kind !== 'expense' && l.kind !== 'income') continue
    if (!isEuroAmount(l)) continue
    if (l.kind === 'income' && (!l.accountId || !bank.has(l.accountId))) {
      continue
    }
    out.push({
      id: l._id,
      key: rowKey(l),
      name: l.meta?.merchant ?? l.text ?? '',
      kind: l.kind,
      amount: l.value,
      t: l.occurredAt,
      accountId: l.accountId,
      category: l.meta?.category,
    })
  }
  return out
}

async function moneySince(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  since: number,
) {
  return await ctx.db
    .query('logs')
    .withIndex('by_owner_area_time', (q) =>
      q.eq('ownerId', ownerId).eq('area', 'money').gte('occurredAt', since),
    )
    .take(MONEY_ROWS * 4)
}

async function ownedAccounts(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db
    .query('accounts')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
    .take(50)
}

async function itemsOf(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db
    .query('recurring')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .take(MAX_ITEMS)
}

/**
 * Look through the last three months and put every bill found on its
 * day — no question (his call, 3 Oct). Runs when Flow opens and after an
 * update is applied; finds nothing twice, because what it wrote is known
 * next time. Returns how many it added.
 */
export const find = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    return await findFor(ctx, ownerId)
  },
})

export async function findFor(ctx: MutationCtx, ownerId: string) {
  const now = Date.now()
  /* The app's own wrong guesses go: a bill it found in an everyday group
     (a petrol station paid on the 9th twice, 3 Oct) before finding learnt
     not to. Only ones it found itself — never one he added. */
  for (const i of await itemsOf(ctx, ownerId)) {
    if (
      i.foundAt !== undefined &&
      i.refusedAt === undefined &&
      i.category !== undefined &&
      EVERYDAY.has(i.category)
    ) {
      await ctx.db.delete(i._id)
    }
  }
  /* Names the app gave are renamed by today's rule (4 Oct: BPI's
     "Energia e Água" was the bill's name, and it is only electricity). */
  const mine = (await itemsOf(ctx, ownerId)).filter(
    (i) => i.foundAt !== undefined && i.matchKey,
  )
  const better = billNames(
    mine.map((i) => ({ key: i.matchKey ?? '', name: i.name, kind: i.kind })),
  )
  for (const [n, i] of mine.entries()) {
    if (better[n] !== i.name) await ctx.db.patch(i._id, { name: better[n] })
  }
  const items = await itemsOf(ctx, ownerId)
  const logs = await moneySince(ctx, ownerId, now - 100 * DAY)
  const rows = billRows(logs, await ownedAccounts(ctx, ownerId))
  const found = findBills(rows, knownOf(items), now)
  const room = MAX_ITEMS - items.length
  const names = billNames(found)
  let added = 0
  for (const [i, b] of found.entries()) {
    if (added >= room) break
    await ctx.db.insert('recurring', {
      ownerId,
      name: names[i].slice(0, MAX_NAME),
      kind: b.kind,
      amount: Math.round(b.amount * 100) / 100,
      category: b.category,
      accountId: b.accountId as Id<'accounts'> | undefined,
      cadence: 'monthly',
      day: b.day,
      matchKey: b.key,
      foundAt: now,
      varies: b.varies,
    })
    added++
  }
  return added
}

/** "× not a bill": gone from every view, and never found again. */
export const notBill = mutation({
  args: { id: v.id('recurring') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedItem(ctx, ownerId, args.id)
    await ctx.db.patch(args.id, { refusedAt: Date.now() })
    return null
  },
})

/** Undo of "× not a bill", within the moment. */
export const unrefuse = mutation({
  args: { id: v.id('recurring') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedItem(ctx, ownerId, args.id)
    await ctx.db.patch(args.id, { refusedAt: undefined })
    return null
  },
})

/**
 * A bill made from a payment (3 Oct: "most likely those bills are in
 * statements"): the name, amount, day, month, account and group all come
 * from the row; he says only how often. One already known is not made
 * twice — its id comes back.
 */
export const fromRow = mutation({
  args: { logId: v.id('logs'), cadence },
  /** `created` false: it was a bill already, and that one comes back —
      so an undo never removes a bill he had before. */
  returns: v.object({ id: v.id('recurring'), created: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) throw new Error('No such row')
    if (
      (log.kind !== 'expense' && log.kind !== 'income') ||
      !isEuroAmount(log)
    ) {
      throw new ConvexError('Only money in or out in euros can be a bill.')
    }
    const key = rowKey(log)
    const items = await itemsOf(ctx, ownerId)
    const same = items.find(
      (i) =>
        i.refusedAt === undefined &&
        isKnown(knownOf([i]), { key, amount: log.value }),
    )
    if (same) return { id: same._id, created: false }
    if (items.length >= MAX_ITEMS) {
      throw new ConvexError('That is a lot of bills — end one first.')
    }
    const d = new Date(log.occurredAt)
    const [name] = billNames([
      { key, name: log.meta?.merchant ?? log.text ?? '', kind: log.kind },
    ])
    const id = await ctx.db.insert('recurring', {
      ownerId,
      name: name.slice(0, MAX_NAME) || 'Bill',
      kind: log.kind,
      amount: Math.round(log.value * 100) / 100,
      category: log.meta?.category,
      accountId: log.accountId,
      cadence: args.cadence,
      day: d.getUTCDate(),
      month: args.cadence === 'yearly' ? d.getUTCMonth() : undefined,
      matchKey: key || undefined,
    })
    return { id, created: true }
  },
})

/** What + BILL offers first: payees from the last year that look like
    bills and are not bills yet, biggest first. */
export const likely = query({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      name: v.string(),
      amount: v.number(),
      t: v.number(),
      times: v.number(),
      accountId: v.optional(v.id('accounts')),
      category: v.optional(v.string()),
      rowId: v.id('logs'),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const items = await itemsOf(ctx, ownerId)
    const logs = await moneySince(ctx, ownerId, Date.now() - 365 * DAY)
    const rows = billRows(logs, await ownedAccounts(ctx, ownerId))
    return likelyBills(rows, knownOf(items)).map((l) => ({
      ...l,
      accountId: l.accountId as Id<'accounts'> | undefined,
      rowId: l.rowId as Id<'logs'>,
    }))
  },
})

/**
 * A bill opened (4 Oct): the payments behind it over the last year — the
 * statement rows that made the app find it, or that paid it since. The
 * row is the evidence; the bill is only what it was for.
 */
export const payments = query({
  args: { id: v.id('recurring') },
  returns: v.array(schema.doc('logs')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const bill = await ownedItem(ctx, ownerId, args.id)
    const logs = await moneySince(ctx, ownerId, Date.now() - 400 * DAY)
    const b = {
      id: bill._id,
      name: bill.name,
      kind: bill.kind,
      amount: bill.amount,
      cadence: bill.cadence,
      day: bill.day,
      month: bill.month,
      key: bill.matchKey ?? payeeKey(bill.name),
      varies: bill.varies,
    }
    return logs
      .filter(
        (l) =>
          (l.kind === 'expense' || l.kind === 'income') &&
          isEuroAmount(l) &&
          paysBill(b, {
            id: l._id,
            kind: l.kind,
            amount: l.value,
            t: l.occurredAt,
            key: rowKey(l),
            recurringId: l.meta?.recurringId,
          }),
      )
      .sort((x, y) => y.occurredAt - x.occurredAt)
      .slice(0, 24)
  },
})

/**
 * His name for a bill (4 Oct): the app names a found one by what the bank
 * printed ("Juros Emprestimo"); he calls it "Mortgage · interest". A
 * renamed bill is his — no longer NEW, and never renamed by the app again.
 */
export const rename = mutation({
  args: { id: v.id('recurring'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedItem(ctx, ownerId, args.id)
    const name = args.name.trim()
    if (name.length === 0) throw new ConvexError('A bill needs a name.')
    if (name.length > MAX_NAME) throw new ConvexError('That name is too long.')
    await ctx.db.patch(args.id, { name, foundAt: undefined })
    return null
  },
})
