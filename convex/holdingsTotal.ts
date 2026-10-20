import { v } from 'convex/values'

import { holdingsTotal } from '../src/lib/holdingsTotal'
import type { Id } from './_generated/dataModel'

/* A broker screenshot against the total it prints (11 Oct): the check of
   src/lib/holdingsTotal.ts as the review shows it, with what he answered.
   The numbers are the reading's own — the worth of each position, the
   cash and the total as the screenshot printed them. */

export const totalValue = v.object({
  state: v.union(v.literal('same'), v.literal('differs'), v.literal('none')),
  positions: v.number(),
  positionsEur: v.number(),
  cashEur: v.union(v.number(), v.null()),
  bothEur: v.number(),
  totalEur: v.union(v.number(), v.null()),
  withoutCash: v.boolean(),
  /** Positions on the screen the account's trades hold already (19 Oct):
      not saved again, and the total is not checked. */
  known: v.number(),
  /** What he said of one that differs. */
  answer: v.union(v.literal('save'), v.literal('skip'), v.null()),
  /** The positions the sum is of. */
  lines: v.array(
    v.object({
      name: v.string(),
      symbol: v.union(v.string(), v.null()),
      type: v.union(v.string(), v.null()),
      valueEur: v.union(v.number(), v.null()),
    }),
  ),
})

/** The key an answer about one account's screenshot is kept under. */
export const totalKey = (accountId: Id<'accounts'>, save: boolean): string =>
  `${save ? 'total' : 'nototal'}:${accountId}`

export function totalView(
  held: {
    values: ReadonlyArray<number | undefined>
    cashEur: number | null
    totalEur: number | null
    lines: (typeof totalValue.type)['lines']
  },
  accountId: Id<'accounts'> | null,
  dismissed: ReadonlyArray<string>,
  known = 0,
): typeof totalValue.type {
  const check = holdingsTotal(held.values, held.cashEur, held.totalEur)
  /* A few of many positions, every one already added: the screen is
     not the whole account, so its total says nothing of them. */
  if (known > 0)
    return { ...check, state: 'none', known, lines: held.lines, answer: null }
  const said = (save: boolean) =>
    accountId !== null && dismissed.includes(totalKey(accountId, save))
  return {
    ...check,
    known,
    lines: held.lines,
    answer:
      check.state !== 'differs'
        ? null
        : said(true)
          ? 'save'
          : said(false)
            ? 'skip'
            : null,
  }
}

/** An apply leaves it: it differs and he has not said "save it anyway". */
export const totalStops = (t: { state: string; answer: string | null }) =>
  t.state === 'differs' && t.answer !== 'save'
