import { lookFamily, reconcile } from '../src/lib/holdings'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* What a Trading 212 account is now, for convex/t212.ts: its link, and
   the shares it holds by instrument. */

const ROWS = 2000

export async function linkOf(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
) {
  return await ctx.db
    .query('bankLinks')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .unique()
}

/* The shares the account holds now, by instrument: its trades and its
   looks, merged as every other reader merges them. */
export async function sharesHeld(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
) {
  const looks = await ctx.db
    .query('holdings')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .take(ROWS)
  const trades = await ctx.db
    .query('trades')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .take(ROWS)
  const ids = new Set([...looks, ...trades].map((r) => r.instrumentId))
  const held: Array<{ inst: Doc<'instruments'>; shares: number }> = []
  for (const id of ids) {
    const inst = await ctx.db.get(id)
    /* Trading 212 lists shares and funds: a coin or a metal is not its. */
    if (inst === null || lookFamily(inst) !== 'security') continue
    held.push({
      inst,
      shares: reconcile(
        trades.filter((t) => t.instrumentId === id),
        looks.filter((h) => h.instrumentId === id),
      ).shares,
    })
  }
  return { held, looks }
}
