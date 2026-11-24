import { hasBrokerCash } from './accounts'
import { costPrice } from '../src/lib/tradeCost'
import type { QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

/* A statement's own orders, for the sum check in rowBalance.ts. Split
   from it on 21 Nov, when it passed 500 lines. */

const DAY = 86_400_000
const cents = (n: number) => Math.round(n * 100)

/** A file's own buys and sells as money rows (12 Nov: Trade Republic's
    statement ended at €399.72 after a €101.09 buy of that day, the buy
    among the file's orders — the check summed the money rows only and
    asked about "NO ROW · €101.09 OUT"). Only where shares are paid from
    these euros, only orders in the balance's currency dated after `from`,
    and not one the account already has: that one is in `was`
    (tradedSince). */
export async function tradeRows(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  orders: ReadonlyArray<FileTrade>,
  currency: string,
  from: number,
): Promise<Array<{ at: number; cents: number; name: string }>> {
  if (
    currency !== 'EUR' ||
    !account.kinds.includes('broker') ||
    hasBrokerCash(account)
  )
    return []
  const mine = orders.filter(
    (t) =>
      (t.side === 'buy' || t.side === 'sell') &&
      !t.crypto &&
      t.currency === currency &&
      t.occurredAt > from,
  )
  if (mine.length === 0) return []
  const stored = await ctx.db
    .query('trades')
    .withIndex('by_owner_account_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('accountId', account._id)
        .gt('occurredAt', from - 2 * DAY),
    )
    .take(200)
  const claimed = new Set<string>()
  return mine.flatMap((t) => {
    const twin = stored.find(
      (x) =>
        !claimed.has(x._id) &&
        x.side === t.side &&
        Math.abs(x.shares - t.shares) < 1e-6 &&
        Math.abs(x.occurredAt - t.occurredAt) <= 2 * DAY + 3_600_000,
    )
    if (twin) {
      claimed.add(twin._id)
      return []
    }
    const worth = cents(t.shares * costPrice(t))
    return [
      {
        at: t.occurredAt,
        cents: t.side === 'buy' ? -worth : worth,
        name: t.name,
      },
    ]
  })
}

export type FileTrade = NonNullable<Doc<'intakes'>['trades']>[number]
