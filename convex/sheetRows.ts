import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { requireUser } from './auth'
import { coveredBy } from '../src/lib/cashHistory'
import type { Reading } from '../src/lib/cashHistory'
import { query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* The account sheet's rows (split from aggregate.ts, 12 Oct). Revolut,
   connected to its bank, opened on hundreds of rows at once and the sheet
   lagged: the sheet now asks for its newest rows and for older ones when
   they are wanted. aggregate.accountSheet still reads every row for the
   balance check — the check is over all of them, loaded or not. */

export const SHEET_ROWS = 2000
const SHEET_TRADES = 6000

export const sheetRow = v.object({
  id: v.string(),
  at: v.number(),
  kind: v.union(
    v.literal('spend'),
    v.literal('income'),
    v.literal('move'),
    v.literal('buy'),
    v.literal('sell'),
  ),
  /** Signed, in `currency`, as this account sees it. */
  amount: v.number(),
  currency: v.string(),
  text: v.string(),
  category: v.union(v.string(), v.null()),
  /** A move's other account, when known. */
  other: v.union(v.string(), v.null()),
  /** Typed by him (no file): the only rows the sheet can delete. */
  logId: v.union(v.id('logs'), v.null()),
  /** A move written here because another account's file named this one
      as its other side — that account's name. He can say it did not come
      from here (3 Oct: BPI got a −€1,000 that left from elsewhere). */
  sideOf: v.union(v.string(), v.null()),
  sideLogId: v.union(v.id('logs'), v.null()),
  fileId: v.union(v.id('intakes'), v.null()),
  /** A typed row on a day a balance already covers: that balance's time —
      the row changed no balance after it. */
  inside: v.union(v.number(), v.null()),
})
type SheetRow = Infer<typeof sheetRow>

const rowKind = (l: Doc<'logs'>) =>
  l.area !== 'money' || l.value === undefined
    ? null
    : l.kind === 'expense'
      ? ('spend' as const)
      : l.kind === 'income'
        ? ('income' as const)
        : l.kind === 'move'
          ? ('move' as const)
          : null

/** A log the sheet shows as a row. */
export const isSheetLog = (l: Doc<'logs'>) => rowKind(l) !== null

/** Logs and trades as the sheet's rows, newest first. `coverOf` is each
    pocket's balances by lower-case currency: a typed row on a day one of
    them covers says so. */
export async function buildSheetRows(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  logs: ReadonlyArray<Doc<'logs'>>,
  trades: ReadonlyArray<Doc<'trades'>>,
  coverOf: ReadonlyMap<string, ReadonlyArray<Reading>>,
): Promise<Array<SheetRow>> {
  const others = new Map<Id<'accounts'>, string>()
  const otherName = async (id: Id<'accounts'> | undefined) => {
    if (id === undefined) return null
    if (!others.has(id)) {
      const o = await ctx.db.get(id)
      others.set(id, o !== null && o.ownerId === ownerId ? o.name : '')
    }
    return others.get(id) || null
  }
  /* Whose file wrote a move into this account: another account's, when
     this row is only the other side of what that file read. */
  const fileAccount = new Map<Id<'intakes'>, Id<'accounts'> | null>()
  const sideOf = async (l: Doc<'logs'>) => {
    const none = { sideOf: null, sideLogId: null }
    if (l.kind !== 'move' || l.meta?.intakeId === undefined) return none
    const id = l.meta.intakeId
    if (!fileAccount.has(id))
      fileAccount.set(id, (await ctx.db.get(id))?.accountId ?? null)
    const from = fileAccount.get(id) ?? null
    if (from === null || from === account._id) return none
    return { sideOf: await otherName(from), sideLogId: l._id }
  }
  const out: Array<SheetRow> = []
  for (const l of logs) {
    const kind = rowKind(l)
    if (kind === null || l.value === undefined) continue
    const typed = l.meta?.intakeId === undefined
    const cover = typed
      ? coveredBy(l.occurredAt, coverOf.get(l.unit ?? '') ?? [])
      : null
    out.push({
      id: l._id,
      at: l.occurredAt,
      kind,
      amount: kind === 'spend' ? -l.value : l.value,
      currency: (l.unit ?? 'eur').toUpperCase(),
      text: l.meta?.merchant ?? l.text ?? '',
      category: l.meta?.category ?? null,
      other: await otherName(l.meta?.otherAccountId),
      logId: typed ? l._id : null,
      ...(await sideOf(l)),
      fileId: l.meta?.intakeId ?? null,
      inside: cover?.at ?? null,
    })
  }
  const symbols = new Map<Id<'instruments'>, string>()
  for (const t of trades) {
    if (!symbols.has(t.instrumentId)) {
      const i = await ctx.db.get(t.instrumentId)
      symbols.set(
        t.instrumentId,
        i !== null && i.ownerId === ownerId ? i.symbol : 'A share',
      )
    }
    const cost = Math.round(t.shares * t.priceEur * 100) / 100
    out.push({
      id: t._id,
      at: t.occurredAt,
      kind: t.side,
      amount: t.side === 'buy' ? -cost : cost,
      currency: 'EUR',
      text: `${symbols.get(t.instrumentId)} · ${Math.round(t.shares * 1e6) / 1e6} sh`,
      category: null,
      other: null,
      logId: null,
      sideOf: null,
      sideLogId: null,
      fileId: t.importId ?? null,
      inside: null,
    })
  }
  out.sort((a, b) => b.at - a.at)
  return out
}

/**
 * The newest `show` rows of one account, and whether older ones are
 * saved. Reads `show` logs through the account's index, not the 2,000
 * the whole sheet may hold. Source 1: logged rows, listed.
 */
export const page = query({
  args: { accountId: v.id('accounts'), show: v.number() },
  returns: v.union(
    v.null(),
    v.object({ rows: v.array(sheetRow), older: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ctx.db.get(args.accountId)
    if (account === null || account.ownerId !== ownerId) return null
    const show = Math.min(Math.max(Math.floor(args.show), 1), SHEET_ROWS)
    const read = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', account._id),
      )
      .order('desc')
      .take(show + 1)
    const older = read.length > show && show < SHEET_ROWS
    const logs = read.slice(0, show)
    /* Trades have no index by time: a broker's are read whole (small
       rows) and shown down to the oldest row loaded. */
    const since = older ? logs[logs.length - 1].occurredAt : -Infinity
    const trades = account.kinds.includes('broker')
      ? (
          await ctx.db
            .query('trades')
            .withIndex('by_owner_account', (q) =>
              q.eq('ownerId', ownerId).eq('accountId', account._id),
            )
            .take(SHEET_TRADES)
        ).filter((t) => t.occurredAt >= since)
      : []
    const coverOf = new Map<string, Array<Reading>>()
    for (const currency of account.currencies) {
      const snaps = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', `balance:${account._id}:${currency}`),
        )
        .take(500)
      coverOf.set(
        currency.toLowerCase(),
        snaps.map((r) => ({ at: r.recordedAt, value: r.value ?? 0 })),
      )
    }
    return {
      rows: await buildSheetRows(ctx, ownerId, account, logs, trades, coverOf),
      older,
    }
  },
})
