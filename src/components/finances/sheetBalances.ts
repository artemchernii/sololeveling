import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'

/* Which balances the account sheet shows between its rows (split from
   OpenAccount.tsx, 29 Oct). */

type SheetData = NonNullable<
  FunctionReturnType<typeof api.aggregate.accountSheet>
>
type Reading = SheetData['readings'][number]

export function shownBalance(
  data: SheetData,
  bal: Reading,
  /** The bank's last answer: always shown. */
  latest: (r: Reading) => boolean,
): boolean {
  const checks = data.checks.filter(
    (c) => c.to === bal.at && c.currency === bal.currency,
  )
  /* A balance read again with nothing moved is not said twice (13 Oct:
     the bank answers every day, and Revolut's $0.00 stood there once a
     day): the first reading of an amount stays, with its file. */
  const same =
    bal.fileId === null &&
    checks.some(
      (c) => c.rows === 0 && c.missing === 0 && c.fromValue === bal.value,
    )
  /* A bank answer that saved no row and showed none pending is not a card
     (29 Oct: on 25 Oct ActivoBank had taken an MB Way €15 it listed only
     on the 26th — two cards, two balances, no row between them). The
     next answer that saves the row carries the balance; the last answer
     and one with a missing row stay. */
  const added = data.files.find((f) => f.id === bal.fileId)?.added ?? 0
  const quiet =
    bal.source === 'sync' &&
    !latest(bal) &&
    bal.pendingRows.length === 0 &&
    added === 0 &&
    !checks.some(
      (c) =>
        c.missing !== 0 || c.bookedLater !== null || c.pendingPart !== null,
    )
  return !same && !quiet
}
