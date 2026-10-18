import { v } from 'convex/values'

import { UNPRICED } from '../src/lib/market'
import { heldAs, tickerOf } from '../src/lib/t212'
import { historyFrom } from '../src/lib/t212History'
import type { T212Event } from '../src/lib/t212History'
import { upsertInstrument } from './invest'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* Trading 212's history (18 Oct, docs/specs/2026-10-18-t212-history.md):
   its buys and sells become trades, its dividends and interest money in,
   its fees money out, and money sent from his banks a move — the same
   rows a file would have saved, so every reader reads them as it reads a
   file's. Each keeps Trading 212's id (`ref`): an answer read twice writes
   once. A row a file already saved is matched, not written again, and
   takes the id. Nothing older than the files is read (his "yes", 18 Oct).

   Written inside t212.arrive, with the cash and positions of the same
   answer: the whole answer or none. */

const DAY = 86_400_000
const HOUR = 3_600_000
const ROWS = 1000
const SOURCE = 'Trading 212'

const company = {
  ref: v.string(),
  at: v.number(),
  ticker: v.string(),
  name: v.string(),
  isin: v.optional(v.string()),
  shares: v.number(),
}
export const t212Event = v.union(
  v.object({
    ...company,
    kind: v.union(v.literal('buy'), v.literal('sell')),
    priceEur: v.number(),
  }),
  v.object({
    ...company,
    kind: v.literal('dividend'),
    amount: v.number(),
    currency: v.string(),
  }),
  v.object({
    ref: v.string(),
    at: v.number(),
    kind: v.union(
      v.literal('interest'),
      v.literal('fee'),
      v.literal('deposit'),
      v.literal('withdraw'),
    ),
    amount: v.number(),
    currency: v.string(),
  }),
)

/** How far back this answer is read: before the link's first history, a
    day before the newest row a file saved in the account. */
export async function historyStart(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  link: Doc<'bankLinks'>,
): Promise<number> {
  if (link.historyAt !== undefined) return historyFrom(null, link.historyAt)
  const trade = await ctx.db
    .query('trades')
    .withIndex('by_owner_account_time', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .order('desc')
    .first()
  const log = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .order('desc')
    .first()
  const edge = Math.max(trade?.occurredAt ?? -1, log?.occurredAt ?? -1)
  return historyFrom(edge < 0 ? null : edge, null)
}

type Trade = Extract<T212Event, { kind: 'buy' | 'sell' }>
const isTrade = (e: T212Event): e is Trade =>
  e.kind === 'buy' || e.kind === 'sell'

type Log = { kind: 'income' | 'expense' | 'move'; value: number; text: string }

/* A dividend and interest are money in; a fee money out (a spend's value
   is positive); money from or to his bank a move, signed. */
function asLog(e: Exclude<T212Event, Trade>): Log {
  if (e.kind === 'dividend')
    return { kind: 'income', value: e.amount, text: e.name }
  if (e.kind === 'interest')
    return { kind: 'income', value: e.amount, text: 'Interest' }
  if (e.kind === 'fee')
    return { kind: 'expense', value: -e.amount, text: 'Fee' }
  return {
    kind: 'move',
    value: e.amount,
    text: e.kind === 'deposit' ? 'Deposit' : 'Withdrawal',
  }
}

/** The other side of a deposit or a withdrawal: a move in another of his
    accounts, the same money the other way, within four days, not paired
    yet — a bank books a transfer days later (11 Oct). */
async function bankSide(
  ctx: MutationCtx,
  ownerId: string,
  here: Id<'accounts'>,
  value: number,
  at: number,
): Promise<Doc<'logs'> | null> {
  const near = await ctx.db
    .query('logs')
    .withIndex('by_owner_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .gte('occurredAt', at - 4 * DAY - HOUR)
        .lte('occurredAt', at + 4 * DAY + HOUR),
    )
    .take(ROWS)
  const named = new Set(near.map((l) => l.meta?.pairOf))
  return (
    near.find(
      (l) =>
        l.kind === 'move' &&
        l.accountId !== undefined &&
        l.accountId !== here &&
        Math.abs((l.value ?? 0) + value) < 0.005 &&
        l.meta?.pairOf === undefined &&
        !named.has(l._id) &&
        (l.meta?.otherAccountId === undefined ||
          l.meta.otherAccountId === here),
    ) ?? null
  )
}

/** One answer's events, laid against the account: what is new is written,
    what a file had is matched. The ids of what was written, and how many
    were matched. */
export async function writeHistory(
  ctx: MutationCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  events: ReadonlyArray<T212Event>,
  insts: Array<Doc<'instruments'>>,
  from: number,
): Promise<{
  trades: Array<Id<'trades'>>
  logs: Array<Id<'logs'>>
  had: number
  newest: number | null
}> {
  const fresh = events.filter((e) => e.at >= from).sort((a, b) => a.at - b.at)
  const out = {
    trades: [] as Array<Id<'trades'>>,
    logs: [] as Array<Id<'logs'>>,
    had: 0,
  }
  const newest = fresh.length === 0 ? null : fresh[fresh.length - 1].at
  if (fresh.length === 0) return { ...out, newest }
  const since = fresh[0].at - 4 * DAY - HOUR
  const trades = await ctx.db
    .query('trades')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', account._id)
        .gte('occurredAt', since),
    )
    .take(ROWS)
  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', account._id)
        .gte('occurredAt', since),
    )
    .take(ROWS)
  const seen = new Set<string | undefined>([
    ...trades.map((t) => t.ref),
    ...logs.map((l) => l.meta?.ref),
  ])
  const used = new Set<string>()

  const instrumentOf = async (e: {
    ticker: string
    name: string
    isin?: string
  }) => {
    const k = heldAs(e, insts)
    if (k >= 0) return insts[k]._id
    const id = await upsertInstrument(
      ctx,
      ownerId,
      {
        symbol: tickerOf(e.ticker),
        name: e.name,
        exchange: SOURCE,
        type: UNPRICED,
      },
      e.isin,
    )
    const inst = await ctx.db.get(id)
    if (inst !== null) insts.push(inst)
    return id
  }

  for (const e of fresh) {
    if (seen.has(e.ref)) continue
    seen.add(e.ref)
    if (isTrade(e)) {
      const instrumentId = await instrumentOf(e)
      const had = trades.find(
        (t) =>
          t.ref === undefined &&
          !used.has(t._id) &&
          t.instrumentId === instrumentId &&
          t.side === e.kind &&
          Math.abs(t.shares - e.shares) < 1e-4 &&
          Math.abs(t.occurredAt - e.at) <= DAY + HOUR,
      )
      if (had) {
        used.add(had._id)
        await ctx.db.patch(had._id, { ref: e.ref })
        out.had++
        continue
      }
      out.trades.push(
        await ctx.db.insert('trades', {
          ownerId,
          accountId: account._id,
          instrumentId,
          side: e.kind,
          shares: e.shares,
          priceEur: e.priceEur,
          occurredAt: e.at,
          ref: e.ref,
        }),
      )
      continue
    }
    const row = asLog(e)
    const unit = e.currency.toLowerCase()
    const had = logs.find(
      (l) =>
        l.meta?.ref === undefined &&
        !used.has(l._id) &&
        l.kind === row.kind &&
        l.unit === unit &&
        Math.abs((l.value ?? 0) - row.value) < 0.005 &&
        Math.abs(l.occurredAt - e.at) <=
          (row.kind === 'move' ? 4 : 2) * DAY + HOUR,
    )
    if (had) {
      used.add(had._id)
      await ctx.db.patch(had._id, { meta: { ...had.meta, ref: e.ref } })
      out.had++
      continue
    }
    const side =
      row.kind === 'move'
        ? await bankSide(ctx, ownerId, account._id, row.value, e.at)
        : null
    if (side !== null && side.meta?.otherAccountId === undefined)
      await ctx.db.patch(side._id, {
        meta: { ...side.meta, otherAccountId: account._id },
      })
    out.logs.push(
      await ctx.db.insert('logs', {
        ownerId,
        area: 'money',
        kind: row.kind,
        occurredAt: e.at,
        value: row.value,
        unit,
        text: row.text,
        accountId: account._id,
        meta: {
          merchant: row.text,
          ref: e.ref,
          ...(e.kind === 'dividend'
            ? { instrumentId: await instrumentOf(e), shares: e.shares }
            : {}),
          ...(side !== null
            ? { pairOf: side._id, otherAccountId: side.accountId }
            : {}),
        },
      }),
    )
  }
  return { ...out, newest }
}

/** The block on the card after this answer: what it wrote joins what the
    block shows until ✕. An answer that wrote nothing leaves it as it is. */
export function cameAfter(
  open: Doc<'bankLinks'>['came'],
  came: { trades: Array<Id<'trades'>>; logs: Array<Id<'logs'>>; had: number },
  at: number,
): Doc<'bankLinks'>['came'] {
  if (came.trades.length + came.logs.length === 0) return open
  return {
    at: open?.at ?? at,
    had: (open?.had ?? 0) + came.had,
    trades: [...came.trades, ...(open?.trades ?? [])].slice(0, 50),
    logs: [...came.logs, ...(open?.logs ?? [])].slice(0, 50),
  }
}

/* ---- The card --------------------------------------------------------- */

export const cameLine = v.object({
  kind: v.union(
    v.literal('buy'),
    v.literal('sell'),
    v.literal('dividend'),
    v.literal('interest'),
    v.literal('fee'),
    v.literal('transfer'),
  ),
  at: v.number(),
  name: v.string(),
  /* The company's, for its logo. */
  symbol: v.union(v.string(), v.null()),
  shares: v.union(v.number(), v.null()),
  each: v.union(v.number(), v.null()),
  /* Signed: what the account gained or gave. */
  amount: v.number(),
  currency: v.string(),
  /* A transfer's other account, where its side is saved, and that side's
     day when this one names it. */
  other: v.union(
    v.object({
      name: v.string(),
      domain: v.union(v.string(), v.null()),
      at: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
})

const ON_CARD = 3

/** What the answers since the block opened wrote, for the card: how many,
    how many a file had, and the newest three as lines. Rows he removed
    since are not counted. */
export async function cameOnCard(
  ctx: QueryCtx,
  ownerId: string,
  came: NonNullable<Doc<'bankLinks'>['came']>,
) {
  type Line = typeof cameLine.type
  const lines: Array<Line> = []
  for (const id of came.trades) {
    const t = await ctx.db.get(id)
    if (t === null || t.ownerId !== ownerId) continue
    const inst = await ctx.db.get(t.instrumentId)
    const sum = Math.round(t.shares * t.priceEur * 100) / 100
    lines.push({
      kind: t.side,
      at: t.occurredAt,
      name: inst?.name ?? '',
      symbol: inst?.symbol ?? null,
      shares: t.shares,
      each: t.priceEur,
      amount: t.side === 'buy' ? -sum : sum,
      currency: 'EUR',
      other: null,
    })
  }
  for (const id of came.logs) {
    const l = await ctx.db.get(id)
    if (l === null || l.ownerId !== ownerId) continue
    const inst = l.meta?.instrumentId
      ? await ctx.db.get(l.meta.instrumentId)
      : null
    const pair = l.meta?.pairOf ? await ctx.db.get(l.meta.pairOf) : null
    const otherId = l.meta?.otherAccountId
    const other = otherId ? await ctx.db.get(otherId) : null
    const value = l.value ?? 0
    const kind: Line['kind'] =
      l.kind === 'move'
        ? 'transfer'
        : l.kind === 'expense'
          ? 'fee'
          : inst !== null
            ? 'dividend'
            : 'interest'
    lines.push({
      kind,
      at: l.occurredAt,
      name:
        kind === 'transfer'
          ? (other?.name ?? l.text ?? '')
          : kind === 'dividend'
            ? (l.text ?? '')
            : SOURCE,
      symbol: inst?.symbol ?? null,
      shares: l.meta?.shares ?? null,
      each:
        kind === 'dividend' && l.meta?.shares
          ? Math.round((value / l.meta.shares) * 100) / 100
          : null,
      amount: l.kind === 'expense' ? -value : value,
      currency: (l.unit ?? 'eur').toUpperCase(),
      other:
        other === null
          ? null
          : {
              name: other.name,
              domain: other.domain ?? null,
              at: pair?.occurredAt ?? null,
            },
    })
  }
  lines.sort((a, b) => b.at - a.at)
  return { rows: lines.length, had: came.had, lines: lines.slice(0, ON_CARD) }
}
