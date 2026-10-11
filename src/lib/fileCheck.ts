/* Does a file add up, before any of it is saved (11 Oct). The balance the
   account holds, plus the rows the file calls new, should reach the
   balance the file prints. One ActivoBank screenshot wrote a −€700 top-up
   twice and took a pending −€505.20 off twice; both show here as a sum
   that is off, before a row is written. Arithmetic only — nothing the
   reader judged. */

export type CheckRow = {
  index: number
  at: number
  /** Signed cents: money out is negative. */
  cents: number
  /** A row the account already has of the same amount, days apart, that
      nothing matched: this one may be it again. */
  twin: boolean
}

export type SumCheck = {
  /** ok: it adds up. ask: it would without one row that looks like one
      he has. off: nothing explains it. bare: the file prints no balance. */
  state: 'ok' | 'ask' | 'off' | 'bare'
  outCents: number
  inCents: number
  /** What the held balance and the rows make. */
  nowCents: number
  /** printed − now: negative when money left that no row shows. */
  gapCents: number
  /** Rows the held balance had already taken off as pending: saved, not
      summed. */
  pending: Array<number>
  /** The row asked about. */
  twin: number | null
}

/** One row, else two, else the first rows in date order, that sum to
    `target`. */
function rowsSumming(
  target: number,
  rows: ReadonlyArray<CheckRow>,
): Array<number> | null {
  const sorted = [...rows].sort((a, b) => a.at - b.at)
  const one = sorted.find((r) => r.cents === target)
  if (one) return [one.index]
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      if (sorted[i].cents + sorted[j].cents === target)
        return [sorted[i].index, sorted[j].index]
  let sum = 0
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i].cents
    if (sum === target) return sorted.slice(0, i + 1).map((r) => r.index)
  }
  return null
}

export function sumCheck(input: {
  /** The balance held, with what moved since. */
  wasCents: number
  /** Money that balance showed as pending, signed; 0 when none. */
  pendingCents: number
  /** The file's new rows dated after that balance. */
  rows: ReadonlyArray<CheckRow>
  printedCents: number | null
}): SumCheck {
  const { wasCents, pendingCents, rows, printedCents } = input
  const result = (
    state: SumCheck['state'],
    pending: Array<number>,
    twin: number | null,
  ): SumCheck => {
    let outCents = 0
    let inCents = 0
    for (const r of rows) {
      if (pending.includes(r.index)) continue
      if (r.cents < 0) outCents -= r.cents
      else inCents += r.cents
    }
    const nowCents = wasCents - outCents + inCents
    return {
      state,
      outCents,
      inCents,
      nowCents,
      gapCents: printedCents === null ? 0 : printedCents - nowCents,
      pending,
      twin,
    }
  }
  if (printedCents === null) return result('bare', [], null)
  const sum = rows.reduce((t, r) => t + r.cents, 0)
  const over = wasCents + sum - printedCents
  if (over === 0) return result('ok', [], null)
  /* Rows that were pending: they sum to what is over, and to no more
     than the balance showed as pending. */
  const wasPending = (target: number, pool: ReadonlyArray<CheckRow>) =>
    target !== 0 &&
    Math.sign(target) === Math.sign(pendingCents) &&
    Math.abs(target) <= Math.abs(pendingCents)
      ? rowsSumming(target, pool)
      : null
  const all = wasPending(over, rows)
  const isTwin = (i: number) => rows.some((r) => r.index === i && r.twin)
  if (all && !all.some(isTwin)) return result('ok', all, null)
  for (const t of rows) {
    if (!t.twin) continue
    const rest = over - t.cents
    if (rest === 0) return result('ask', [], t.index)
    const p = wasPending(
      rest,
      rows.filter((r) => r.index !== t.index),
    )
    if (p) return result('ask', p, t.index)
  }
  if (all) return result('ok', all, null)
  /* Off. One row may still have been pending (his 3 Oct balance had
     €1,205.20 off): the one that leaves the least unexplained. */
  let best: CheckRow | null = null
  for (const r of rows) {
    if (r.twin || wasPending(r.cents, [r]) === null) continue
    if (
      Math.abs(over - r.cents) <
      Math.abs(over - (best === null ? 0 : best.cents))
    )
      best = r
  }
  return result('off', best ? [best.index] : [], null)
}
