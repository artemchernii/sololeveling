import { v } from 'convex/values'

import type { QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

/* A trades file, opened again (14 Oct: his gold screenshot opened on "0
   rows in the file · 0 saved" and nothing under it). Each buy and sell
   as it was read — what it came to as printed, its units, its day — and
   whether this file saved it or it was in already, from another file. */

const ROWS = 2000

export const fileTrade = v.object({
  at: v.number(),
  side: v.union(v.literal('buy'), v.literal('sell'), v.literal('reward')),
  name: v.string(),
  shares: v.number(),
  /** Units × price, the fee in it, in `currency` as printed. */
  value: v.number(),
  currency: v.string(),
  landed: v.boolean(),
})

export async function fileTrades(
  ctx: QueryCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
) {
  const read = intake.trades ?? []
  const accountId = intake.accountId
  if (read.length === 0) return []
  const times = read.map((r) => r.occurredAt)
  const mine =
    accountId === undefined
      ? []
      : (
          await ctx.db
            .query('trades')
            .withIndex('by_owner_account_time', (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('accountId', accountId)
                .gte('occurredAt', Math.min(...times))
                .lte('occurredAt', Math.max(...times)),
            )
            .take(ROWS)
        ).filter((t) => t.importId === intake._id)
  /* A saved trade answers for one read row: two alike are two. */
  const left = [...mine]
  return read
    .map((r) => {
      const at = (t: Doc<'trades'>) =>
        t.occurredAt === r.occurredAt &&
        (t.reward ? 'reward' : t.side) === r.side
      /* Its units, unless a coin's fee took some of them. */
      const exact = left.findIndex(
        (t) => at(t) && Math.abs(t.shares - r.shares) < 1e-9,
      )
      const i = exact >= 0 ? exact : left.findIndex(at)
      if (i >= 0) left.splice(i, 1)
      const sign = r.side === 'sell' ? -1 : 1
      return {
        at: r.occurredAt,
        side: r.side,
        name: r.name,
        shares: r.shares,
        value:
          Math.round((r.shares * r.price + sign * (r.fee ?? 0)) * 100) / 100,
        currency: r.currency,
        landed: i >= 0,
      }
    })
    .sort((a, b) => b.at - a.at)
}
