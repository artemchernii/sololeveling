import { PENDING_LOOKBACK_MS } from '../src/lib/bankRows'
import { balanceKey } from './accounts'
import type { Unbooked } from '../src/lib/bankRows'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* Money the app has as a row before the bank has booked it (11 Nov).
   He sent €300 from ActivoBank to Revolut on the 6th. On the 8th Revolut's
   answer saved both sides of the transfer; ActivoBank's booked balance
   that day still had the €300 in, and the app asked "€300 came in with no
   row" about his own transfer. A bank's booked balance is stored less
   such rows, with the rows named beside it (stateSnapshots.unbooked),
   until the bank books them. Only the other bank's side of a transfer
   counts: a row this bank gave is in its balance already. */

const row = (l: Doc<'logs'>): Unbooked => ({
  merchant: l.meta?.merchant ?? l.text ?? '',
  amount: l.value ?? 0,
  at: l.occurredAt,
})

/** A move on this account that another account's file or bank answer
    wrote, or that he typed: not one of this bank's own rows. */
async function fromOther(
  ctx: QueryCtx,
  l: Doc<'logs'>,
  accountId: Id<'accounts'>,
  unit: string,
): Promise<boolean> {
  if (
    l.area !== 'money' ||
    l.kind !== 'move' ||
    l.unit !== unit ||
    l.value === undefined ||
    l.meta?.otherAccountId === undefined
  )
    return false
  if (l.meta.intakeId === undefined) return false
  const intake = await ctx.db.get(l.meta.intakeId)
  return intake !== null && intake.accountId !== accountId
}

/** The saved rows a booked reading of this account may not have yet: the
    ones the held balance already had off, if they are still saved, and
    the other bank's sides saved since it. */
export async function maybeUnbooked(
  ctx: QueryCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  currency: string,
  held: Doc<'stateSnapshots'>,
): Promise<Array<Unbooked>> {
  const unit = currency.toLowerCase()
  const out: Array<Unbooked> = []
  for (const u of held.unbooked ?? []) {
    const still = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('accountId', accountId)
          .eq('occurredAt', u.at),
      )
      .take(50)
    /* Taken back since (a file undone): the bank's number stands. */
    if (
      still.some(
        (l) =>
          l.kind === 'move' &&
          l.unit === unit &&
          Math.abs((l.value ?? 0) - u.amount) < 0.005,
      )
    )
      out.push(u)
  }
  const since = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', accountId)
        .gt('occurredAt', held.recordedAt),
    )
    .take(500)
  for (const l of since)
    if (await fromOther(ctx, l, accountId, unit)) out.push(row(l))
  return out
}

/** A transfer's side was just written on an account whose latest balance
    is a bank's booked one, dated after the transfer: that balance did not
    have it (the bank would have given the row), so it comes off now and
    is named beside it. */
export async function takeOffUnbooked(
  ctx: MutationCtx,
  ownerId: string,
  side: Doc<'logs'>,
) {
  const { accountId, unit } = side
  if (accountId === undefined || unit === undefined) return
  if (!(await fromOther(ctx, side, accountId, unit))) return
  const held = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('key', balanceKey(accountId, unit.toUpperCase())),
    )
    .order('desc')
    .first()
  if (
    held?.value === undefined ||
    held.unbooked === undefined ||
    held.recordedAt < side.occurredAt ||
    side.occurredAt < held.recordedAt - PENDING_LOOKBACK_MS
  )
    return
  await ctx.db.patch(held._id, {
    value: Math.round((held.value + (side.value ?? 0)) * 100) / 100,
    unbooked: [...held.unbooked, row(side)],
  })
}
