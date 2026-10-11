/* The balance a bank prints beside each row (11 Oct). One ActivoBank
   screenshot, read twice: the first reading gave a closing balance, the
   second none, and the app showed €153.21 minus four "new" rows =
   −€1,114.85 — two of which that €153.21 had already counted. The numbers
   under the rows say all of it, so the code reads them rather than the
   model deciding: the newest row's balance is the account's, and the
   trail of balances shows which rows an earlier balance already held. */

export type PrintedRow = {
  occurredAt: number
  /** Signed: money out is negative. */
  amount: number
  pending: boolean
  /** The balance printed beside the row, after it. */
  balanceAfter?: number
}

type Link = { index: number; at: number; cents: number; after: number }

const cents = (n: number) => Math.round(n * 100)

/** The rows that print a balance, oldest first. A bank app lists the
    newest on top and a statement the oldest; when every row is of one
    day, the balances themselves say which way they run. */
export function trail(rows: ReadonlyArray<PrintedRow>): Array<Link> {
  const links: Array<Link> = rows.flatMap((r, index) =>
    r.balanceAfter === undefined || r.pending
      ? []
      : [
          {
            index,
            at: r.occurredAt,
            cents: cents(r.amount),
            after: cents(r.balanceAfter),
          },
        ],
  )
  if (links.length < 2) return links
  const first = links[0]
  const last = links[links.length - 1]
  let newestFirst = first.at > last.at
  if (first.at === last.at) {
    let down = 0
    let up = 0
    for (let i = 0; i + 1 < links.length; i++) {
      if (links[i].after === links[i + 1].after + links[i].cents) down++
      if (links[i + 1].after === links[i].after + links[i + 1].cents) up++
    }
    newestFirst = down >= up
  }
  return newestFirst ? links.reverse() : links
}

/** The file's own balance: the one printed with its newest row. */
export function printedBalance(
  rows: ReadonlyArray<PrintedRow>,
): { value: number; asOf: number } | null {
  const newest = trail(rows).at(-1)
  return newest ? { value: newest.after / 100, asOf: newest.at } : null
}

/** Rows a balance he already has had counted: dated after it (past
    `graceMs`, when a file's row no longer counts as inside a reading),
    yet in the trail at or before the first point showing that balance. */
export function insideReadings(
  rows: ReadonlyArray<PrintedRow>,
  readings: ReadonlyArray<{ at: number; value: number }>,
  graceMs: number,
): Set<number> {
  const links = trail(rows)
  const inside = new Set<number>()
  for (const r of readings) {
    const p = links.findIndex((l) => l.after === cents(r.value))
    for (let i = 0; i <= p; i++)
      if (links[i].at > r.at + graceMs) inside.add(links[i].index)
  }
  return inside
}
