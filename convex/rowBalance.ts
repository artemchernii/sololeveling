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

/** The sum, from a held balance. A new row dated the day of that balance
    may be inside it (a statement's closing balance) or after it (an app
    screenshot taken that morning): counted after it only when that is what
    makes the file's balance (10 Oct, Sep 1–15 in, then Sep 1–30 dropped). */
function checkFrom(
  last: { recordedAt: number; pending?: number },
  wasCents: number,
  rows: ReadonlyArray<CheckRow>,
  printedCents: number | null,
) {
  const from = (after: number) =>
    sumCheck({
      wasCents,
      pendingCents: cents(last.pending ?? 0),
      rows: rows.filter((r) => r.at > after),
      printedCents,
    })
  const strict = from(last.recordedAt + HISTORY_GRACE_MS)
  if (strict.state === 'ok' || strict.state === 'bare') return strict
  const sameDay = from(last.recordedAt - 18 * 3_600_000)
  return sameDay.state === 'ok' ? sameDay : strict
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
  /* The same sum the review showed (src/lib/fileCheck.ts): a row the held
     balance had taken off as pending is saved and not counted again. */
  const sum = checkFrom(last, was, fresh, balance ? cents(balance.value) : null)
  const pending = fresh
    .filter((r) => sum.pending.includes(r.index))
    .reduce((t, r) => t + r.cents, 0)
  return {
    currency,
    was: was / 100,
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
  const sum = checkFrom(
    last,
    cents(last.value) + moved.cents,
    rows.flatMap((r, index) =>
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
    ),
    printed ? cents(printed.value) : null,
  )
  const line = ({ key, merchant, amount }: SumRow) => ({
    key,
    merchant,
    amount,
  })
  const twin = sum.twin === null ? undefined : rows[sum.twin]
  return {
    currency,
    was: (cents(last.value) + moved.cents) / 100,
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
