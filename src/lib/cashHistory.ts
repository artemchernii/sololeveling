/* A pocket's balance at the end of each day (Treasury, 27 Sep — the
   Overview chart and the account cards' lines). From his own rows only: the
   nearest reading, and what moved between it and the day. After a reading
   the moves are added; before the first one they are taken back off it. A
   day before anything he has told the app is null — never a flat line
   drawn into the past.

   A statement's own rows sit inside its closing reading (they are what
   made it), so a row read off a file within GRACE after a reading counts
   as before it — the rule balances already follow (aggregate.movedSince). */

export const HISTORY_GRACE_MS = 12 * 3_600_000

export type Reading = { at: number; value: number }
export type Move = { at: number; cents: number; fromFile: boolean }

const after = (m: Move, r: Reading) =>
  m.at > r.at && !(m.fromFile && m.at <= r.at + HISTORY_GRACE_MS)

export function balanceSeries(
  dayEnds: ReadonlyArray<number>,
  readingsIn: ReadonlyArray<Reading>,
  movesIn: ReadonlyArray<Move>,
): Array<number | null> {
  const readings = [...readingsIn].sort((a, b) => a.at - b.at)
  const moves = [...movesIn].sort((a, b) => a.at - b.at)
  if (readings.length === 0) return dayEnds.map(() => null)
  const start = Math.min(readings[0].at, moves.at(0)?.at ?? Infinity)
  return dayEnds.map((end) => {
    if (end < start) return null
    let anchor: Reading | undefined
    for (const r of readings) if (r.at <= end) anchor = r
    if (anchor) {
      const a = anchor
      let cents = Math.round(a.value * 100)
      for (const m of moves) if (m.at <= end && after(m, a)) cents += m.cents
      return cents / 100
    }
    const first = readings[0]
    let cents = Math.round(first.value * 100)
    for (const m of moves) if (m.at > end && !after(m, first)) cents -= m.cents
    return cents / 100
  })
}

/* An account joining is not money made (1 Oct: Cash typed as €5,000 and
   Trade Republic's cash read on Sep 27 drew "+€5,417 in 3M"). Within a
   range, an account whose line starts after the range's first day joins
   on that day; its balance then is taken out of the change and the day is
   marked instead. */

export type Join<TId> = { index: number; accountId: TId; value: number }

export function rangeChange<TId>(
  total: ReadonlyArray<number | null>,
  accounts: ReadonlyArray<{
    accountId: TId
    values: ReadonlyArray<number | null>
  }>,
  from: number,
): { change: number | null; joins: Array<Join<TId>> } {
  const drawn: Array<number> = []
  for (let i = Math.max(0, from); i < total.length; i++)
    if (total[i] !== null) drawn.push(i)
  const joins: Array<Join<TId>> = []
  if (drawn.length < 2) return { change: null, joins }
  const start = drawn[0]
  for (const a of accounts) {
    const i = a.values.findIndex((x, k) => k >= start && x !== null)
    if (i > start)
      joins.push({ index: i, accountId: a.accountId, value: a.values[i] ?? 0 })
  }
  joins.sort((x, y) => x.index - y.index)
  const end = drawn[drawn.length - 1]
  const joined = joins.reduce((s, j) => s + Math.round(j.value * 100), 0)
  const cents =
    Math.round((total[end] ?? 0) * 100) -
    Math.round((total[start] ?? 0) * 100) -
    joined
  return { change: cents / 100, joins }
}
