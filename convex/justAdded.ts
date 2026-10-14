import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* Just added (14 Oct, mockup just-added.html). Artem, after ADD BUYS: "i
   see nothing in revolut, no history of this addings … i cant open what i
   just added and cant undo". A sheet places a file at the date of its
   rows, so a file of July buys saved today sat under 60 newer rows. These
   are the files saved since a day, newest first, for the top of an
   account's sheet and of a thing's page. Counts of rows, nothing worked
   out. */

/* Files looked at, newest first: a week holds a handful. */
const FILES = 40
/* Rows shown before REMOVE is pressed; the count says the rest. */
const SHOWN = 6
const ROWS = 2000

const row = v.object({
  at: v.number(),
  side: v.union(v.literal('buy'), v.literal('sell'), v.literal('row')),
  /** In euros for a trade, in `currency` for a row. */
  value: v.number(),
  currency: v.string(),
  shares: v.union(v.number(), v.null()),
  label: v.string(),
})

const file = v.object({
  id: v.id('intakes'),
  names: v.array(v.string()),
  images: v.boolean(),
  from: v.union(v.number(), v.null()),
  to: v.union(v.number(), v.null()),
  /** When it was saved. */
  addedAt: v.number(),
  /** Rows it saved, and rows it read that were saved before it. */
  saved: v.number(),
  had: v.number(),
  /** Of what it saved, the buys and the sells (14 Oct: IMG_9288 held 3
      buys and 1 sell and read "4 BUY"). */
  buys: v.number(),
  sells: v.number(),
  /** Its buys and sells: of what. */
  things: v.array(
    v.object({ symbol: v.string(), name: v.string(), type: v.string() }),
  ),
  /** The first rows it saved, newest first. */
  rows: v.array(row),
})

export const list = query({
  args: {
    /** Saved on or after this time (the start of a day, so it caches). */
    since: v.number(),
    accountId: v.optional(v.id('accounts')),
    /** A thing's page: the files its buys came from. */
    intakeIds: v.optional(v.array(v.id('intakes'))),
  },
  returns: v.array(file),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const found: Array<Doc<'intakes'>> = []
    if (args.accountId !== undefined) {
      const accountId = args.accountId
      found.push(
        ...(await ctx.db
          .query('intakes')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ownerId).eq('accountId', accountId),
          )
          .order('desc')
          .take(FILES)),
      )
    }
    for (const id of (args.intakeIds ?? []).slice(0, FILES)) {
      const i = await ctx.db.get(id)
      if (i !== null && i.ownerId === ownerId) found.push(i)
    }
    const out = []
    const seen = new Set<Id<'intakes'>>()
    for (const i of found) {
      if (seen.has(i._id)) continue
      seen.add(i._id)
      if (i.status !== 'done' || i.takenBackAt !== undefined) continue
      const addedAt = await savedAt(ctx, i)
      if (addedAt < args.since) continue
      out.push({ ...(await described(ctx, ownerId, i)), addedAt })
    }
    return out.sort((a, b) => b.addedAt - a.addedAt)
  },
})

/** When a file was saved: its update's apply, else when it was read. */
async function savedAt(ctx: QueryCtx, i: Doc<'intakes'>): Promise<number> {
  if (i.batchId !== undefined) {
    const b = await ctx.db.get(i.batchId)
    if (b?.appliedAt !== undefined) return b.appliedAt
  }
  return i.readAt ?? i._creationTime
}

async function described(ctx: QueryCtx, ownerId: string, i: Doc<'intakes'>) {
  const read = [
    ...(i.transactions ?? []).map((t) => t.occurredAt),
    ...(i.trades ?? []).map((t) => t.occurredAt),
  ]
  const from = read.length ? Math.min(...read) : null
  const to = read.length ? Math.max(...read) : null
  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_intake', (q) =>
      q.eq('ownerId', ownerId).eq('meta.intakeId', i._id),
    )
    .take(ROWS)
  /* Its trades sit in its account between its first and last day. */
  const accountId = i.accountId
  const trades =
    accountId === undefined || from === null || to === null
      ? []
      : (
          await ctx.db
            .query('trades')
            .withIndex('by_owner_account_time', (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('accountId', accountId)
                .gte('occurredAt', from)
                .lte('occurredAt', to),
            )
            .take(ROWS)
        ).filter((t) => t.importId === i._id)
  const things = new Map<
    string,
    { symbol: string; name: string; type: string }
  >()
  for (const t of i.trades ?? []) {
    const c = t.candidates.at(t.preferred ?? 0)
    if (c && trades.some((x) => x.occurredAt === t.occurredAt))
      things.set(c.symbol, { symbol: c.symbol, name: c.name, type: c.type })
  }
  const rows = [
    ...trades.flatMap((t) =>
      t.reward || t.split
        ? []
        : [
            {
              at: t.occurredAt,
              side: t.side,
              value: Math.round(t.shares * t.priceEur * 100) / 100,
              currency: 'EUR',
              shares: t.shares,
              label: '',
            },
          ],
    ),
    ...logs.map((l) => ({
      at: l.occurredAt,
      side: 'row' as const,
      /* Signed as the sheet signs it: money out is below zero. */
      value: l.kind === 'expense' ? -(l.value ?? 0) : (l.value ?? 0),
      currency: (l.unit ?? 'eur').toUpperCase(),
      shares: null,
      label: l.meta?.merchant ?? l.text ?? '',
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, SHOWN)
  const saved = logs.length + trades.length
  return {
    id: i._id,
    names: (i.files ?? []).map((f) => f.name),
    images: (i.files ?? []).every((f) => f.contentType.startsWith('image/')),
    from,
    to,
    saved,
    had: Math.max(0, read.length - saved),
    buys: trades.filter((t) => t.side === 'buy').length,
    sells: trades.filter((t) => t.side === 'sell').length,
    things: [...things.values()],
    rows,
  }
}
