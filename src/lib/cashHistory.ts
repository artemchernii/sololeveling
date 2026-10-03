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

export type Reading = {
  at: number
  value: number
  /** Money the bank showed as pending with this balance, signed — the
      balance has it taken off, no row itemises it yet. */
  pending?: number
}
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

/** One pair of readings checked: the earlier balance, the rows between
    and their sum, and what the later one read. `missing` is 0 when it
    adds up — or when the difference is explained: `bookedLater`, rows
    the balance already had that the bank dates after it; `pendingPart`,
    money the bank showed pending with the balance. */
export type Check = Gap & {
  fromValue: number
  rows: number
  sum: number
  bookedLater: { amount: number; at: number } | null
  pendingPart: number | null
}

/* An app's balance moves the instant money does; its statement books
   the row a day or two later (3 Oct: the €575.36 screenshot of 27 Sep
   already had MB WAY's −€100, dated 28 Sep). */
export const BOOKED_LATER_MS = 3 * 86_400_000

/** The rows just after a balance that it already counted: one row of
    exactly the gap, else the first rows in date order that add up to it. */
export function bookedLater<TRow extends { at: number; cents: number }>(
  gapCents: number,
  rows: ReadonlyArray<TRow>,
): Array<TRow> | null {
  if (gapCents === 0) return null
  const sorted = [...rows].sort((a, b) => a.at - b.at)
  const one = sorted.find((m) => m.cents === gapCents)
  if (one) return [one]
  let sum = 0
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i].cents
    if (sum === gapCents) return sorted.slice(0, i + 1)
  }
  return null
}

export function balanceChecks(
  readingsIn: ReadonlyArray<Reading>,
  moves: ReadonlyArray<Move>,
): Array<Check> {
  const readings = [...readingsIn].sort((a, b) => a.at - b.at)
  const checks: Array<Check> = []
  /* Rows a balance already counted: not counted again after it. */
  const counted = new Set<Move>()
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1]
    const b = readings[i]
    let sum = 0
    let rows = 0
    for (const m of moves)
      if (after(m, a) && !after(m, b) && !counted.has(m)) {
        sum += m.cents
        rows++
      }
    const cents = Math.round(a.value * 100) + sum
    const read = Math.round(b.value * 100)
    let gap = read - cents
    let later: Check['bookedLater'] = null
    let pendingPart: number | null = null
    if (gap !== 0) {
      const found = bookedLater(
        gap,
        moves.filter(
          (m) =>
            after(m, b) && m.at <= b.at + BOOKED_LATER_MS && !counted.has(m),
        ),
      )
      if (found) {
        for (const m of found) counted.add(m)
        later = { amount: gap / 100, at: found[0].at }
        gap = 0
      }
    }
    const pend = Math.round((b.pending ?? 0) * 100)
    if (
      gap !== 0 &&
      pend !== 0 &&
      Math.sign(pend) === Math.sign(gap) &&
      Math.abs(gap) <= Math.abs(pend)
    ) {
      pendingPart = gap / 100
      gap = 0
    }
    checks.push({
      from: a.at,
      to: b.at,
      fromValue: a.value,
      rows,
      sum: sum / 100,
      expected: cents / 100,
      read: read / 100,
      missing: gap / 100,
      bookedLater: later,
      pendingPart,
    })
  }
  return checks
}

export function balanceGaps(
  readings: ReadonlyArray<Reading>,
  moves: ReadonlyArray<Move>,
): Array<Gap> {
  return balanceChecks(readings, moves)
    .filter((c) => c.missing !== 0)
    .map(({ from, to, expected, read, missing }) => ({
      from,
      to,
      expected,
      read,
      missing,
    }))
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
