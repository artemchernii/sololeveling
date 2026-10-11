import { balanceKey } from './accounts'
import { movedSince } from './aggregate'
import { HISTORY_GRACE_MS } from '../src/lib/cashHistory'
import { insideReadings } from '../src/lib/rowBalance'
import type { QueryCtx } from './_generated/server'
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
  let fresh = 0
  let added = 0
  for (const [i, r] of read.entries()) {
    if (r.pending || !kept.has(i)) continue
    added++
    if (r.currency === currency && r.occurredAt > since)
      fresh += cents(r.amount)
  }
  return {
    currency,
    was: was / 100,
    wasAt: last.recordedAt,
    since,
    had: booked.length - added,
    printed: balance !== undefined,
    gap: balance ? (cents(balance.value) - was - fresh) / 100 : 0,
  }
}
