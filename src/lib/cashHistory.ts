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
  /* A wallet of notes (1 Oct, his pick): no statement will ever take it
     further back, so its earliest balance is drawn flat before it rather
     than the line jumping on the day he first typed it. */
  carryBack = false,
): Array<number | null> {
  const readings = [...readingsIn].sort((a, b) => a.at - b.at)
  const moves = [...movesIn].sort((a, b) => a.at - b.at)
  if (readings.length === 0) return dayEnds.map(() => null)
  const start = Math.min(readings[0].at, moves.at(0)?.at ?? Infinity)
  const series = known(dayEnds, readings, moves, start)
  const first = series.find((x) => x !== null)
  return carryBack && first !== undefined
    ? series.map((x) => x ?? first)
    : series
}

function known(
  dayEnds: ReadonlyArray<number>,
  readings: ReadonlyArray<Reading>,
  moves: ReadonlyArray<Move>,
  start: number,
): Array<number | null> {
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

/* ---- Does it add up? -------------------------------------------------- */

/* A bank's balance is an observation and its rows are the ledger (1 Oct,
   PLAN A.5): balance then, plus the rows between, should be balance now.
   His ActivoBank screenshot lost one −€100 row off its edge; the two
   balances around it are what say so. */

export type Gap = {
  /** The earlier reading and the later one it should have reached. */
  from: number
  to: number
  /** What the rows between say it should be, and what was read. */
  expected: number
  read: number
  /** read − expected: negative when money left that no row shows. */
  missing: number
}

export function balanceGaps(
  readingsIn: ReadonlyArray<Reading>,
  moves: ReadonlyArray<Move>,
): Array<Gap> {
  const readings = [...readingsIn].sort((a, b) => a.at - b.at)
  const gaps: Array<Gap> = []
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1]
    const b = readings[i]
    let cents = Math.round(a.value * 100)
    for (const m of moves) if (after(m, a) && !after(m, b)) cents += m.cents
    const read = Math.round(b.value * 100)
    if (read !== cents)
      gaps.push({
        from: a.at,
        to: b.at,
        expected: cents / 100,
        read: read / 100,
        missing: (read - cents) / 100,
      })
  }
  return gaps
}

/** The reading a row on `at` sits inside: a row typed there changes no
    balance after it, because that balance already counted it. */
export function coveredBy(
  at: number,
  readings: ReadonlyArray<Reading>,
): Reading | null {
  let latest: Reading | null = null
  for (const r of readings)
    if (r.at >= at && (!latest || r.at < latest.at)) latest = r
  return latest
}
