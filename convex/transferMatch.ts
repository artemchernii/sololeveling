import { v } from 'convex/values'

import {
  APART_MS,
  fit,
  namedAccounts,
  transferMatches,
} from '../src/lib/transferMatch'
import type { Stored } from '../src/lib/transferMatch'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* A transfer between two of his accounts, matched before a dropped file
   is saved (11 Oct, docs/specs/2026-10-11-transfer-match.md). `forDrop`
   is what the check shows; `applyRow` is what saving such a row writes.
   The rule itself is src/lib/transferMatch. Helpers only: the review and
   apply in convex/intake.ts call them, already scoped to their owner. */

const WINDOW_ROWS = 300
const cents = (n: number) => Math.round(n * 100)

/** A new row of the drop: booked, not one he has, not left out. */
export type DropRow = {
  /** `<intake>:<row>`, as the check's answers name it. */
  key: string
  intakeId: Id<'intakes'>
  accountId: Id<'accounts'>
  occurredAt: number
  /** Signed: negative when it left the account. */
  amount: number
  currency: string
  merchant: string
  raw?: string
  counterparty?: string | null
  /** It was read as his own money moving. */
  move: boolean
}

const side = v.object({
  /** A stored row's id, or the key of another row of the drop. */
  id: v.string(),
  accountId: v.id('accounts'),
  occurredAt: v.number(),
  amount: v.number(),
  merchant: v.string(),
  /** What arrived less than was sent. */
  fee: v.number(),
  /** It is in the row's own account already. */
  here: v.boolean(),
  /** In the app; false for a row of another file of this drop. */
  stored: v.boolean(),
  /** The account a stored row says it went to or came from. */
  otherAccountId: v.union(v.id('accounts'), v.null()),
})

/** One row of the drop that is a side of a transfer, for the check. */
export const transferValue = v.object({
  key: v.string(),
  accountId: v.id('accounts'),
  occurredAt: v.number(),
  amount: v.number(),
  merchant: v.string(),
  /* sure: nothing asked. ask: not saved until answered. same / apart: his
     answer, undoable. */
  state: v.union(
    v.literal('sure'),
    v.literal('ask'),
    v.literal('same'),
    v.literal('apart'),
  ),
  /* The side it is saved as one transfer with: sure and same. */
  chosen: v.union(v.string(), v.null()),
  sides: v.array(side),
})
export type Transfer = typeof transferValue.type

const tails = (a: Doc<'accounts'>) => [
  ...(a.ibanTails ?? []),
  ...(a.cardTails ?? []),
]

/** Signed cents of a money row, as its account sees it. */
function signed(l: Doc<'logs'>): number {
  const c = cents(l.value ?? 0)
  return l.kind === 'expense' ? -Math.abs(c) : c
}

/** The money rows he has around these days that could be a side. */
async function storedSides(
  ctx: QueryCtx,
  ownerId: string,
  accounts: ReadonlyArray<Doc<'accounts'>>,
  unit: string,
  from: number,
  to: number,
) {
  const named = accounts.map((a) => ({
    id: a._id,
    name: a.name,
    tails: tails(a),
  }))
  const logs: Array<Doc<'logs'>> = []
  for (const a of accounts) {
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('accountId', a._id)
          .gte('occurredAt', from - APART_MS)
          .lte('occurredAt', to + APART_MS),
      )
      .take(WINDOW_ROWS)
    for (const l of rows)
      if (
        l.area === 'money' &&
        l.unit === unit &&
        l.value !== undefined &&
        (l.kind === 'move' || l.kind === 'income' || l.kind === 'expense') &&
        l.meta?.recurringId === undefined
      )
        logs.push(l)
  }
  const pairedTo = new Set(logs.map((l) => l.meta?.pairOf))
  const fileAccount = new Map<Id<'intakes'>, Id<'accounts'> | undefined>()
  const out: Array<Stored & { log: Doc<'logs'> }> = []
  for (const l of logs) {
    if (l.accountId === undefined) continue
    const file = l.meta?.intakeId
    if (file !== undefined && !fileAccount.has(file))
      fileAccount.set(file, (await ctx.db.get(file))?.accountId)
    const wroteIt = file === undefined ? undefined : fileAccount.get(file)
    out.push({
      log: l,
      id: l._id,
      accountId: l.accountId,
      at: l.occurredAt,
      cents: signed(l),
      move: l.kind === 'move',
      names: l.meta?.otherAccountId
        ? [l.meta.otherAccountId]
        : namedAccounts(
            `${l.meta?.merchant ?? l.text ?? ''} ${l.meta?.raw ?? ''}`,
            named,
          ).filter((id) => id !== l.accountId),
      paired: l.meta?.pairOf !== undefined || pairedTo.has(l._id),
      fromOther:
        l.kind === 'move' && wroteIt !== undefined && wroteIt !== l.accountId,
    })
  }
  return out
}

/** The rows of a drop that are one side of a transfer he has, or of one
    in another file of the drop, with his answers so far (`dismissed`:
    "same:<row>:<side>", "apart:<row>"). Reads only. */
export async function forDrop(
  ctx: QueryCtx,
  ownerId: string,
  accounts: ReadonlyArray<Doc<'accounts'>>,
  rows: ReadonlyArray<DropRow>,
  dismissed: ReadonlyArray<string>,
): Promise<Array<Transfer>> {
  const named = accounts.map((a) => ({
    id: a._id,
    name: a.name,
    tails: tails(a),
  }))
  const out: Array<Transfer> = []
  for (const currency of new Set(rows.map((r) => r.currency))) {
    const mine = rows.filter((r) => r.currency === currency)
    const times = mine.map((r) => r.occurredAt)
    const stored = await storedSides(
      ctx,
      ownerId,
      accounts,
      currency.toLowerCase(),
      Math.min(...times),
      Math.max(...times),
    )
    const found = transferMatches(
      mine.map((r) => ({
        key: r.key,
        accountId: r.accountId,
        file: r.intakeId,
        at: r.occurredAt,
        cents: cents(r.amount),
        move: r.move,
        names: namedAccounts(
          `${r.merchant} ${r.counterparty ?? ''} ${r.raw ?? ''}`,
          named,
        ).filter((id) => id !== r.accountId),
      })),
      stored,
    )
    const rowBy = new Map(mine.map((r) => [r.key, r]))
    const logBy = new Map(stored.map((s) => [s.id, s.log]))
    for (const f of found) {
      const row = rowBy.get(f.key)
      if (!row) continue
      const sides = f.sides.flatMap((s) => {
        const log = logBy.get(s.id)
        const other = rowBy.get(s.id)
        const base = { id: s.id, fee: s.feeCents / 100, here: s.here }
        if (log?.accountId !== undefined)
          return [
            {
              ...base,
              accountId: log.accountId,
              occurredAt: log.occurredAt,
              amount: signed(log) / 100,
              merchant: log.meta?.merchant ?? log.text ?? '',
              stored: true,
              otherAccountId: log.meta?.otherAccountId ?? null,
            },
          ]
        return other
          ? [
              {
                ...base,
                accountId: other.accountId,
                occurredAt: other.occurredAt,
                amount: other.amount,
                merchant: other.merchant,
                stored: false,
                otherAccountId: null,
              },
            ]
          : []
      })
      const same = sides.find((s) =>
        dismissed.includes(`same:${f.key}:${s.id}`),
      )
      const apart = dismissed.includes(`apart:${f.key}`)
      out.push({
        key: f.key,
        accountId: row.accountId,
        occurredAt: row.occurredAt,
        amount: row.amount,
        merchant: row.merchant,
        state: apart ? 'apart' : same ? 'same' : f.state,
        chosen: apart
          ? null
          : (same?.id ?? (f.state === 'sure' ? sides[0].id : null)),
        sides,
      })
    }
  }
  return out
}

/** The stored row a side names: a log, or the row another file of the
    drop has written by now. Null when it is not there (yet). */
async function sideLog(
  ctx: MutationCtx,
  ownerId: string,
  sideId: string,
): Promise<Doc<'logs'> | null> {
  if (!sideId.includes(':')) {
    const id = ctx.db.normalizeId('logs', sideId)
    const log = id === null ? null : await ctx.db.get(id)
    return log !== null && log.ownerId === ownerId ? log : null
  }
  const [file, index] = sideId.split(':')
  const intakeId = ctx.db.normalizeId('intakes', file)
  const intake = intakeId === null ? null : await ctx.db.get(intakeId)
  const r = intake?.transactions?.[Number(index)]
  if (!intake || intake.ownerId !== ownerId || !r) return null
  const written = await ctx.db
    .query('logs')
    .withIndex('by_owner_intake', (q) =>
      q.eq('ownerId', ownerId).eq('meta.intakeId', intake._id),
    )
    .take(WINDOW_ROWS)
  return (
    written.find(
      (l) =>
        l.accountId === intake.accountId &&
        l.occurredAt === r.occurredAt &&
        signed(l) === cents(r.amount),
    ) ?? null
  )
}

/** The side of `log`'s transfer that is in `accountId`, when it has one. */
async function pairIn(
  ctx: MutationCtx,
  ownerId: string,
  log: Doc<'logs'>,
  accountId: Id<'accounts'>,
): Promise<Doc<'logs'> | null> {
  if (log.meta?.pairOf !== undefined) {
    const first = await ctx.db.get(log.meta.pairOf)
    return first !== null && first.accountId === accountId ? first : null
  }
  const near = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', accountId)
        .gte('occurredAt', log.occurredAt - APART_MS)
        .lte('occurredAt', log.occurredAt + APART_MS),
    )
    .take(WINDOW_ROWS)
  return near.find((l) => l.meta?.pairOf === log._id) ?? null
}

/**
 * Saving a row that is one side of a transfer (sure, or answered "same
 * transfer") with the side `sideId`:
 * - the same money is in this account already → nothing but the fee;
 * - the other side is in another account → this side, paired to it, and
 *   the fee as spending in the account the money arrived in. An arrival
 *   saved a fee less becomes what was sent, with the fee beside it: its
 *   account's balance does not change.
 * Returns what it did and the fee, or null when the side is not there or no longer fits — the row is
 * then saved as the file shows it.
 */
export async function applyRow(
  ctx: MutationCtx,
  ownerId: string,
  args: {
    account: Doc<'accounts'>
    intakeId: Id<'intakes'>
    row: {
      occurredAt: number
      amount: number
      currency: string
      merchant: string
      raw?: string
    }
    sideId: string
    /** Say what it would do, and write nothing. */
    dry?: boolean
  },
): Promise<{ did: 'skipped' | 'written'; feeCents: number } | null> {
  const { account, intakeId, row } = args
  const found = await sideLog(ctx, ownerId, args.sideId)
  if (
    found === null ||
    found.accountId === undefined ||
    found.unit !== row.currency.toLowerCase()
  )
    return null
  const unit = row.currency.toLowerCase()
  const fee = async (
    accountId: Id<'accounts'>,
    feeCents: number,
    occurredAt: number,
  ) => {
    if (feeCents <= 0) return
    await ctx.db.insert('logs', {
      ownerId,
      area: 'money',
      kind: 'expense',
      occurredAt,
      value: feeCents / 100,
      unit,
      text: 'Transfer fee',
      accountId,
      meta: { category: 'fees', merchant: 'Transfer fee', intakeId },
    })
  }
  const mine = {
    key: '',
    file: '',
    accountId: account._id as string,
    at: row.occurredAt,
    cents: cents(row.amount),
    move: true,
    names: [],
  }
  /* The same money already in this account: the other bank's file wrote
     it, or the two sides were written together. */
  const here =
    found.accountId === account._id
      ? found
      : await pairIn(ctx, ownerId, found, account._id)
  if (here !== null) {
    const f = fit(mine, {
      id: here._id,
      file: null,
      accountId: account._id,
      at: here.occurredAt,
      cents: signed(here),
      move: true,
      names: [],
      paired: true,
      fromOther: true,
    })
    if (f === null) return null
    if (!args.dry) await fee(account._id, f.feeCents, row.occurredAt)
    return { did: 'skipped', feeCents: f.feeCents }
  }
  const f = fit(mine, {
    id: found._id,
    file: null,
    accountId: found.accountId,
    at: found.occurredAt,
    cents: signed(found),
    move: found.kind === 'move',
    names: [],
    paired: found.meta?.pairOf !== undefined,
    fromOther: false,
  })
  if (f === null) return null
  if (args.dry) return { did: 'written', feeCents: f.feeCents }
  const arrives = row.amount > 0
  const sent = Math.abs(arrives ? signed(found) : cents(row.amount)) / 100
  const moveId = await ctx.db.insert('logs', {
    ownerId,
    area: 'money',
    kind: 'move',
    occurredAt: row.occurredAt,
    value: arrives ? sent : -sent,
    unit,
    text: row.merchant,
    accountId: account._id,
    meta: {
      merchant: row.merchant,
      raw: row.raw,
      intakeId,
      otherAccountId: found.accountId,
      ...(arrives ? { pairOf: found._id } : {}),
    },
  })
  /* The arriving side names the leaving one (schema, logs.meta.pairOf). */
  const { category: _filed, ...meta } = found.meta ?? {}
  await ctx.db.patch(found._id, {
    kind: 'move',
    value: arrives ? -sent : sent,
    meta: {
      ...meta,
      otherAccountId: account._id,
      ...(arrives ? {} : { pairOf: moveId }),
    },
  })
  await fee(
    arrives ? account._id : found.accountId,
    f.feeCents,
    arrives ? row.occurredAt : found.occurredAt,
  )
  return { did: 'written', feeCents: f.feeCents }
}
