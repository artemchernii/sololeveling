import { codeOf } from '../src/lib/holdingLine'
import { METALS } from '../src/lib/metals'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

/* A screenshot of an account whose positions come from its statement (19
   Oct, Revolut Invest: "I want add only cash and those 6 positions already
   in the portfolio"). A position on the screen that the account's trades
   already hold is already added: it is not saved again, and a screen that
   shows a few of many positions is not checked against the total. Matched
   by the code he knows it by — the screen's XAU is the statement's GC=F. */

/** Whether the account's own trades hold this ticker. */
export async function inStatement(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  candidate: { symbol: string; type?: string },
): Promise<boolean> {
  const code = codeOf({ symbol: candidate.symbol, type: candidate.type ?? '' })
  const symbols = new Set([candidate.symbol, code])
  const metal = METALS[code] as (typeof METALS)[string] | undefined
  if (metal) symbols.add(metal.candidate.symbol)
  for (const symbol of symbols) {
    const instruments = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', ownerId).eq('symbol', symbol),
      )
      .take(5)
    for (const i of instruments) {
      const trade = await ctx.db
        .query('trades')
        .withIndex('by_owner_account_instrument_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('accountId', accountId)
            .eq('instrumentId', i._id),
        )
        .first()
      if (trade !== null) return true
    }
  }
  return false
}

/** How many of a screen's positions the account's trades hold already. */
export async function knownCount(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  rows: ReadonlyArray<{ candidate: { symbol: string; type?: string } } | null>,
): Promise<number> {
  let n = 0
  for (const r of rows)
    if (r !== null && (await inStatement(ctx, ownerId, accountId, r.candidate)))
      n++
  return n
}
