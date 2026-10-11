import { v } from 'convex/values'

import { lookFamily } from '../src/lib/holdings'
import { sameCompany } from '../src/lib/intake'
import { sharesCheck } from '../src/lib/sharesCheck'
import type { SharesCheck } from '../src/lib/sharesCheck'
import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/* A trading history against the shares in the account (11 Oct): the rows
   the pure check in src/lib/sharesCheck.ts needs. The file's sums are on
   the intake since it was read (`historyShares`); the account's shares are
   its last screenshot's `holdings` — entity rows, nothing worked out. */

const DAY = 86_400_000
const LOOKS = 2000
const AFTER = 5

export const sharesValue = v.object({
  intakeId: v.id('intakes'),
  state: v.union(v.literal('checked'), v.literal('none'), v.literal('old')),
  /** The first day the file has a row of. */
  fileFrom: v.union(v.number(), v.null()),
  /** The day of the screenshot it is compared with. */
  lookAt: v.union(v.number(), v.null()),
  lines: v.array(
    v.object({
      n: v.number(),
      name: v.string(),
      symbol: v.union(v.string(), v.null()),
      file: v.number(),
      account: v.number(),
      buys: v.number(),
      sells: v.number(),
      rows: v.number(),
      same: v.boolean(),
      /** What he said of one that differs. */
      answer: v.union(v.literal('save'), v.literal('skip'), v.null()),
    }),
  ),
  sold: v.number(),
  after: v.array(
    v.object({ name: v.string(), shares: v.number(), at: v.number() }),
  ),
})

/** The key an answer about one company of one file is kept under. */
export const sharesKey = (
  intakeId: Id<'intakes'>,
  n: number,
  save: boolean,
): string => `${save ? 'shares' : 'noshares'}:${intakeId}:${n}`

export async function sharesFor(
  ctx: QueryCtx,
  ownerId: string,
  intake: Doc<'intakes'>,
  accountId: Id<'accounts'> | null,
): Promise<SharesCheck | null> {
  const history = intake.historyShares
  if (history === undefined) return null
  if (accountId === null) return sharesCheck(history.sums, history.to, [], null)
  const looks = await ctx.db
    .query('holdings')
    .withIndex('by_owner_account', (q) =>
      q.eq('ownerId', ownerId).eq('accountId', accountId),
    )
    .take(LOOKS)
  const docs = new Map<Id<'instruments'>, Doc<'instruments'> | null>()
  for (const h of looks)
    if (!docs.has(h.instrumentId))
      docs.set(h.instrumentId, await ctx.db.get(h.instrumentId))
  /* Shares only: a look at his coins or his gold is not a look at these. */
  const shares = looks.filter((h) => {
    const i = docs.get(h.instrumentId)
    return i != null && lookFamily(i) === 'security'
  })
  if (shares.length === 0)
    return sharesCheck(history.sums, history.to, [], null)
  const lookAt = Math.max(...shares.map((h) => h.asOf))
  /* Screens of the same day are one look; the newest row a company. */
  const last = new Map<Id<'instruments'>, Doc<'holdings'>>()
  for (const h of shares) {
    if (h.asOf <= lookAt - DAY) continue
    const had = last.get(h.instrumentId)
    if (!had || h.asOf > had.asOf) last.set(h.instrumentId, h)
  }
  const held = [...last.values()].flatMap((h) => {
    const i = docs.get(h.instrumentId)
    return i ? [{ h, i }] : []
  })
  const found = new Map(
    (intake.historyFound ?? []).map((f) => [
      f.name,
      f.candidates.at(f.preferred ?? 0)?.symbol ?? null,
    ]),
  )
  const taken = new Set<number>()
  const matched = history.sums.map((s) => {
    const same = sameCompany(
      { name: s.name, isin: s.isin },
      held.map((x) => x.i),
    )
    const symbol = found.get(s.name)
    const at = same >= 0 ? same : held.findIndex((x) => x.i.symbol === symbol)
    if (at < 0 || taken.has(at)) return -1
    taken.add(at)
    return at
  })
  return sharesCheck(
    history.sums,
    history.to,
    held.map((x, at) => {
      const sum = matched.indexOf(at)
      return {
        sum: sum < 0 ? null : sum,
        name: x.i.name,
        symbol: x.i.symbol,
        shares: x.h.shares,
        calculated: x.h.sharesCalculated === true,
      }
    }),
    lookAt,
  )
}

/** The check as the review shows it, with what he answered. */
export function sharesView(
  intake: Doc<'intakes'>,
  check: SharesCheck,
  dismissed: ReadonlyArray<string>,
): typeof sharesValue.type {
  return {
    intakeId: intake._id,
    fileFrom: intake.historyShares?.from ?? null,
    state: check.state,
    lookAt: check.lookAt,
    lines: check.lines.map((l) => ({
      ...l,
      answer: l.same
        ? null
        : dismissed.includes(sharesKey(intake._id, l.n, true))
          ? ('save' as const)
          : dismissed.includes(sharesKey(intake._id, l.n, false))
            ? ('skip' as const)
            : null,
    })),
    sold: check.sold,
    after: check.after.slice(0, AFTER),
  }
}

/** The companies of this file an apply leaves: `<intake>:<n>` each. */
export function notSaved(view: typeof sharesValue.type): Array<string> {
  return view.lines.flatMap((l) =>
    !l.same && l.answer !== 'save' ? [`${view.intakeId}:${l.n}`] : [],
  )
}
