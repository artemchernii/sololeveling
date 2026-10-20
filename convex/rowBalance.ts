import { v } from 'convex/values'

import { balanceKey } from './accounts'
import { movedSince } from './aggregate'
import { HISTORY_GRACE_MS } from '../src/lib/cashHistory'
import { sumCheck } from '../src/lib/fileCheck'
import type { CheckRow } from '../src/lib/fileCheck'
import { insideReadings } from '../src/lib/rowBalance'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

/* A file's rows against the balances he already has (11 Oct, balance
   from the rows). Arithmetic on his own readings and rows, nothing the
   reader judged: src/lib/rowBalance.ts is the pure part. */

const DAY = 86_400_000
const cents = (n: number) => Math.round(n * 100)

/** The read rows an earlier balance of this account had already counted:
    they are "you already had", and are not written again. */
export async function countedRows(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  intake: Doc<'intakes'>,
): Promise<Set<number>> {
  const read = intake.transactions ?? []
  const printed = read.filter((r) => r.balanceAfter !== undefined)
  if (printed.length === 0) return new Set()
  const times = printed.map((r) => r.occurredAt)
  const readings = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('key', balanceKey(account._id, printed[0].currency))
        .gte('recordedAt', Math.min(...times) - 10 * DAY)
        .lte('recordedAt', Math.max(...times) + DAY),
    )
    .take(40)
  return insideReadings(
    read,
    readings.flatMap((s) =>
      s.value === undefined ? [] : [{ at: s.recordedAt, value: s.value }],
    ),
    HISTORY_GRACE_MS,
  )
}

/** The saved rows of a held balance's own day, at or before it: one it
    had not seen counts when it is exactly what is missing (20 Oct, BPI's
    €422 to ActivoBank from a screenshot, the bank's 15:01 answer without
    it). Negative ids, apart from a file's row indexes. */
async function heldDayRows(
  ctx: QueryCtx,
  ownerId: string,
  accountId: Doc<'accounts'>['_id'],
  currency: string,
  heldAt: number,
): Promise<Array<CheckRow & { saved: true }>> {
  const day = new Date(heldAt)
  day.setUTCHours(0, 0, 0, 0)
  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', accountId)
        .gte('occurredAt', day.getTime())
        .lte('occurredAt', heldAt),
    )
    .take(50)
  const unit = currency.toLowerCase()
  return logs.flatMap((l, i) => {
    if (l.area !== 'money' || l.unit !== unit || l.value === undefined)
      return []
    const signed =
      l.kind === 'expense'
        ? -l.value
        : l.kind === 'income' || l.kind === 'move'
          ? l.value
          : 0
    return signed === 0
      ? []
      : [
          {
            index: -1000 - i,
            at: l.occurredAt,
            cents: cents(signed),
            twin: false,
            saved: true as const,
          },
        ]
  })
}

/** The sum, from a held balance, by the one rule (src/lib/balanceRule.ts):
    the file's rows after it, and as `earlier` the rows of its own day it
    may not have seen — the file's (10 Oct, Sep 1–15 in, then Sep 1–30
    dropped) and, only when the sum is off, the saved ones. */
async function checkFrom(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  currency: string,
  last: { recordedAt: number; pending?: number },
  wasCents: number,
  rows: ReadonlyArray<CheckRow>,
  printedCents: number | null,
) {
  const since = last.recordedAt + HISTORY_GRACE_MS
  const dayBefore = last.recordedAt - 18 * 3_600_000
  const ask = (saved: ReadonlyArray<CheckRow & { saved: true }>) =>
    sumCheck({
      wasCents,
      pendingCents: cents(last.pending ?? 0),
      rows: rows.filter((r) => r.at > since),
      earlier: [
        ...rows.filter((r) => r.at > dayBefore && r.at <= since),
        ...saved,
      ],
      printedCents,
    })
  const first = ask([])
  if (first.state === 'ok' || first.state === 'bare') return first
  return ask(
    await heldDayRows(ctx, ownerId, account._id, currency, last.recordedAt),
  )
}

/** What saving `kept` of a file's rows finds, before any is written: the
    balance the app holds now, and whether it and the new rows reach the
    balance the file prints. Null when the account has no balance yet. */
export async function landedCheck(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  intake: Doc<'intakes'>,
  kept: ReadonlySet<number>,
  keepBalance: boolean,
  /** Fees saving will add beside rows the account already has (a
      transfer matched before saving, convex/transferMatch.ts). */
  feeCents = 0,
): Promise<NonNullable<Doc<'intakes'>['landed']> | null> {
  const read = intake.transactions ?? []
  const balance = keepBalance ? intake.balance : undefined
  const currency =
    balance?.currency ?? read.at(0)?.currency ?? account.currencies[0]
  const now = Date.now()
  const at = balance ? Math.min(balance.asOf + 6 * 3_600_000, now) : now
  const last = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('key', balanceKey(account._id, currency))
        .lte('recordedAt', at),
    )
    .order('desc')
    .first()
  if (last?.value === undefined) return null
  const moved = await movedSince(
    ctx,
    ownerId,
    account,
    currency,
    last.recordedAt,
    at,
  )
  const was = cents(last.value) + moved.cents
  const since = last.recordedAt + HISTORY_GRACE_MS
  const booked = read.filter((r) => !r.pending)
  const fresh: Array<CheckRow> = []
  let added = 0
  for (const [i, r] of read.entries()) {
    if (r.pending || !kept.has(i)) continue
    added++
    if (r.currency === currency)
      fresh.push({
        index: i,
        at: r.occurredAt,
        cents: cents(r.amount),
        twin: false,
      })
  }
  if (feeCents > 0) fresh.push({ index: -1, at, cents: -feeCents, twin: false })
  /* The same sum the review showed (src/lib/fileCheck.ts): a row the held
     balance had taken off as pending is saved and not counted again. */
  const sum = await checkFrom(
    ctx,
    ownerId,
    account,
    currency,
    last,
    was,
    fresh,
    balance ? cents(balance.value) : null,
  )
  const pending = fresh
    .filter((r) => sum.pending.includes(r.index))
    .reduce((t, r) => t + r.cents, 0)
  return {
    currency,
    was: sum.wasCents / 100,
    wasAt: last.recordedAt,
    since,
    had: booked.length - added,
    printed: balance !== undefined,
    gap: sum.gapCents / 100,
    ...(pending !== 0 ? { pending: pending / 100 } : {}),
  }
}

const sumRow = v.object({
  key: v.string(),
  merchant: v.string(),
  amount: v.number(),
})

/** What the review shows of an account before apply: was, out, in, now —
    and, when that is not the balance the file prints, why. */
export const sumCheckValue = v.object({
  currency: v.string(),
  was: v.number(),
  wasAt: v.number(),
  out: v.number(),
  in: v.number(),
  /* What the held balance and the new rows make. */
  now: v.number(),
  printed: v.union(v.number(), v.null()),
  /* printed − now: negative when money left that no row shows. */
  gap: v.number(),
  state: v.union(
    v.literal('ok'),
    v.literal('ask'),
    v.literal('off'),
    v.literal('bare'),
  ),
  /* "Save it as it is": the file's balance wins. */
  accepted: v.boolean(),
  /* Rows the held balance had taken off as pending. */
  pending: v.array(sumRow),
  /* The row that may be one he has, and the one he has. */
  twin: v.union(
    v.object({
      key: v.string(),
      merchant: v.string(),
      amount: v.number(),
      occurredAt: v.number(),
      mine: v.object({ occurredAt: v.number(), merchant: v.string() }),
    }),
    v.null(),
  ),
  /* His answers so far, each one undoable. */
  skipped: v.array(sumRow),
  kept: v.array(sumRow),
})

type SumRow = {
  key: string
  occurredAt: number
  merchant: string
  amount: number
  currency: string
  twinOf: { occurredAt: number; merchant: string } | null
  /** He said it is another payment than the one it looks like. */
  two: boolean
}

/** Does the account add up with these files' new rows (`rows`: not
    pending, not ones he has)? Null when it holds no balance to start
    from. Reads only; the review and apply both ask it. */
export async function accountCheck(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  printed: Doc<'intakes'>['balance'],
  rows: ReadonlyArray<SumRow>,
  skipped: ReadonlyArray<{ key: string; merchant: string; amount: number }>,
  accepted: boolean,
  /** Money pending with the printed balance, signed, when the list is
      whole (a bank's answer); null when it may not be (a file). */
  pendingNowCents: number | null = null,
): Promise<typeof sumCheckValue.type | null> {
  const currency = printed?.currency ?? rows.at(0)?.currency
  if (currency === undefined) return null
  const at = printed ? printed.asOf + 6 * 3_600_000 : undefined
  const last = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) => {
      const key = q
        .eq('ownerId', ownerId)
        .eq('key', balanceKey(account._id, currency))
      return at === undefined ? key : key.lte('recordedAt', at)
    })
    .order('desc')
    .first()
  if (last?.value === undefined) return null
  const moved = await movedSince(
    ctx,
    ownerId,
    account,
    currency,
    last.recordedAt,
    at,
  )
  /* With the whole list, the rows reach the printed balance less what
     became pending since the held one: what was pending then and is
     booked now is a row again (17 Oct, Revolut's two card payments). */
  const pendingMove =
    pendingNowCents === null ? 0 : pendingNowCents - cents(last.pending ?? 0)
  const checkRows = rows.flatMap((r, index) =>
    r.currency === currency
      ? [
          {
            index,
            at: r.occurredAt,
            cents: cents(r.amount),
            twin: r.twinOf !== null && !r.two,
          },
        ]
      : [],
  )
  const sum = await checkFrom(
    ctx,
    ownerId,
    account,
    currency,
    pendingNowCents === null ? last : { ...last, pending: 0 },
    cents(last.value) + moved.cents,
    checkRows,
    printed ? cents(printed.value) - pendingMove : null,
  )
  const line = ({ key, merchant, amount }: SumRow) => ({
    key,
    merchant,
    amount,
  })
  const twin = sum.twin === null ? undefined : rows[sum.twin]
  return {
    currency,
    was: sum.wasCents / 100,
    wasAt: last.recordedAt,
    out: sum.outCents / 100,
    in: sum.inCents / 100,
    now: sum.nowCents / 100,
    printed: printed?.value ?? null,
    gap: sum.gapCents / 100,
    state: sum.state,
    accepted,
    pending: sum.pending.map((i) => line(rows[i])),
    twin:
      twin?.twinOf != null
        ? { ...line(twin), occurredAt: twin.occurredAt, mine: twin.twinOf }
        : null,
    skipped: [...skipped],
    kept: rows.filter((r) => r.two).map(line),
  }
}

/** A file's printed balance the account does not hold yet: every row of
    it can be one he has, and it still has something to save (11 Oct: his
    card stood at −€1,114.85 and the screenshot that says €90.35 was
    "nothing to save"). */
export async function balanceIsNews(
  ctx: QueryCtx,
  ownerId: string,
  accountId: Doc<'accounts'>['_id'],
  balance: NonNullable<Doc<'intakes'>['balance']>,
): Promise<boolean> {
  const account = await ctx.db.get(accountId)
  const held = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('key', balanceKey(accountId, balance.currency))
        .lte('recordedAt', balance.asOf + DAY),
    )
    .order('desc')
    .first()
  if (account === null || held?.value === undefined) return true
  /* What the card shows: the reading and the rows after it. */
  const moved = await movedSince(
    ctx,
    ownerId,
    account,
    balance.currency,
    held.recordedAt,
  )
  return (
    cents(held.value) + moved.cents !== cents(balance.value) ||
    held.recordedAt < balance.asOf - DAY / 2
  )
}

/** Rows of this account that a file dated after today (the bank's booking
    day), saved before `notAhead` (src/lib/noYear.ts) brought such rows to
    the day they were read: brought to today, so the balance read today
    has them. Only rows from files; `dayStart` is today's local midnight. */
export async function pullBackAhead(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Doc<'accounts'>['_id'],
  dayStart: number,
): Promise<number> {
  const ahead = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', accountId)
        .gte('occurredAt', dayStart + DAY),
    )
    .take(50)
  let moved = 0
  for (const l of ahead) {
    if (l.area !== 'money' || l.meta?.intakeId === undefined) continue
    await ctx.db.patch(l._id, { occurredAt: dayStart + DAY / 2 })
    moved++
  }
  return moved
}
