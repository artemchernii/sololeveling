import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* A trade two files read (15 Oct, mockup remove-clash.html). His gold
   screenshots overlap: IMG_9290's last three rows are IMG_9291's first
   three. The save writes such a trade once, under the file saved first
   (`writeTrades`' twin). Removing that file hands the trade to the other
   file — it stays — instead of taking a real buy off the position. */

const DAY_MS = 86_400_000
/* As the save's twin: within two days (and an hour of clock change). */
const NEAR_MS = 2 * DAY_MS + 3_600_000
/* Files of the account looked at: as many as "just added" lists. */
const FILES = 40
const ROWS = 2000

type Read = NonNullable<Doc<'intakes'>['trades']>[number]
type Trade = Pick<
  Doc<'trades'>,
  '_id' | 'occurredAt' | 'side' | 'shares' | 'reward' | 'split'
>

const sideOf = (t: Trade) => (t.reward ? 'reward' : t.split ? 'split' : t.side)

/* The save's twin, read from the file's side: same side and units within
   two days — else, as `fileTrades`, the same day and side (a coin's fee
   took some of its units). */
function take(t: Trade, left: Array<Read>): boolean {
  const near = (r: Read) =>
    r.side === sideOf(t) && Math.abs(r.occurredAt - t.occurredAt) <= NEAR_MS
  const exact = left.findIndex(
    (r) => near(r) && Math.abs(r.shares - t.shares) < 1e-6,
  )
  const i =
    exact >= 0
      ? exact
      : left.findIndex(
          (r) => r.side === sideOf(t) && r.occurredAt === t.occurredAt,
        )
  if (i < 0) return false
  left.splice(i, 1)
  return true
}

/** Of `theirs`, the trades `rows` read too, once `own` (the trades the
    reading file saved itself) have answered for their rows. Each read row
    answers for one trade: two alike are two. */
export function alsoRead(
  rows: ReadonlyArray<Read>,
  own: ReadonlyArray<Trade>,
  theirs: ReadonlyArray<Trade>,
): Array<Id<'trades'>> {
  const left = [...rows]
  for (const t of own) take(t, left)
  return theirs.filter((t) => take(t, left)).map((t) => t._id)
}

export type Stay = { to: Id<'intakes'>; name: string }

/** Which of a file's trades another saved file of its account read too,
    and that file: the trade stays, under it, when this file goes. */
export async function staysWith(
  ctx: QueryCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  trades: ReadonlyArray<Doc<'trades'>>,
): Promise<Map<Id<'trades'>, Stay>> {
  const out = new Map<Id<'trades'>, Stay>()
  const accountId = intake.accountId
  if (accountId === undefined || trades.length === 0) return out
  const others = (
    await ctx.db
      .query('intakes')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', accountId),
      )
      .order('desc')
      .take(FILES)
  ).filter(
    (i) =>
      i._id !== intake._id &&
      i.status === 'done' &&
      i.takenBackAt === undefined &&
      (i.trades ?? []).length > 0,
  )
  for (const other of others) {
    const theirs = trades.filter((t) => !out.has(t._id))
    if (theirs.length === 0) break
    const rows = other.trades ?? []
    const times = rows.map((r) => r.occurredAt)
    const own = (
      await ctx.db
        .query('trades')
        .withIndex('by_owner_account_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('accountId', accountId)
            .gte('occurredAt', Math.min(...times) - NEAR_MS)
            .lte('occurredAt', Math.max(...times) + NEAR_MS),
        )
        .take(ROWS)
    ).filter((t) => t.importId === other._id)
    const name = (other.files ?? []).map((f) => f.name).join(' · ') || 'a file'
    for (const id of alsoRead(rows, own, theirs))
      out.set(id, { to: other._id, name })
  }
  return out
}
