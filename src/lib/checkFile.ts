/* The check screen's words (5 Oct, mockup design/treasury-mockup/
   check.html): the span a file covers, its rows a day at a time, and the
   button that says what pressing it does. */

const SPAN_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** "Oct 1, 2026 → Oct 4, 2026", or one day alone. */
export function rowsSpan(times: ReadonlyArray<number>): string | null {
  if (times.length === 0) return null
  const from = SPAN_FMT.format(new Date(Math.min(...times)))
  const to = SPAN_FMT.format(new Date(Math.max(...times)))
  return from === to ? from : `${from} → ${to}`
}

/** Rows in order, under one heading a local day — the order kept. */
export function groupByDay<T extends { occurredAt: number }>(
  rows: ReadonlyArray<T>,
): Array<[string, Array<T>]> {
  const out: Array<[string, Array<T>]> = []
  for (const r of rows) {
    const d = new Date(r.occurredAt)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const last = out.at(-1)
    if (last && last[0] === key) last[1].push(r)
    else out.push([key, [r]])
  }
  return out
}

/** "add 2 payments and the balance", "update the balance", "add 3 rows". */
export function addLabel(o: {
  rows: number
  noun: string
  orders: number
  balance: boolean
}): string {
  const parts = [
    ...(o.rows > 0 ? [`${o.rows} ${o.noun}`] : []),
    ...(o.orders > 0
      ? [`${o.orders} ${o.orders === 1 ? 'order' : 'orders'}`]
      : []),
  ]
  if (parts.length === 0) return o.balance ? 'update the balance' : 'done'
  return `add ${parts.join(', ')}${o.balance ? ' and the balance' : ''}`
}
