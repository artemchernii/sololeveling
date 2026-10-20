/* Do the rows reach the balance (20 Oct, one rule for every door). A
   balance is an observation and rows are the ledger (PLAN A.5): the
   earlier balance plus the rows between should be the later one. Where it
   is not, the same few things have explained it, each found in his real
   money — and each used to live in one door and not the next (the €422 of
   3 Oct was fixed in the sheet on the 19th and broke in the bank's answer
   on the 20th). The doors now fetch their rows and ask this.

   Arithmetic on his own balances and rows, nothing the reader judged.
   Every amount in signed cents: money out is negative. */

export type RuleRow = {
  id: number
  at: number
  cents: number
  /** A saved row of the same amount, days apart, that nothing matched:
      this one may be it again. Only a door that can ask marks it. */
  twin?: boolean
}

export type Reach = {
  /** ok: it adds up, or a rule explains it. ask: it would without one
      twin row. off: nothing explains it. bare: no later balance. */
  state: 'ok' | 'ask' | 'off' | 'bare'
  /** The rows counted: not carried, not pending at `was`. */
  counted: Array<number>
  outCents: number
  inCents: number
  /** `was` and the counted rows. */
  nowCents: number
  /** What nothing explains: `to` − now; 0 when ok or bare. */
  gapCents: number
  /** Rows dated after `to` it already had (an app's balance moves the
      instant money does; the statement books the row up to 3 days later
      — 27 Sep, MB WAY's −€100). */
  bookedLater: Array<RuleRow>
  /** Rows of `to`'s own day, dated only by the day, that it had not seen
      yet (19 Oct, BPI's €422 sent in the evening, ActivoBank's 15:01
      balance without it): they belong after it. */
  carried: Array<RuleRow>
  /** Rows `was` had already taken off as pending (11 Oct, ActivoBank's
      −€505.20): saved, not summed. */
  pendingWas: Array<number>
  /** The gap `to`'s own pending money explains (3 Oct). */
  pendingTo: number | null
  /** The row asked about. */
  twin: number | null
}

/** How long after a balance the bank may book a row it already had. */
export const BOOKED_LATER_MS = 3 * 86_400_000

/** One row, else two, else the first rows in date order, that sum to
    `target`. */
export function rowsSumming<T extends { at: number; cents: number }>(
  target: number,
  rows: ReadonlyArray<T>,
): Array<T> | null {
  if (target === 0) return null
  const sorted = [...rows].sort((a, b) => a.at - b.at)
  const one = sorted.find((r) => r.cents === target)
  if (one) return [one]
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      if (sorted[i].cents + sorted[j].cents === target)
        return [sorted[i], sorted[j]]
  let sum = 0
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i].cents
    if (sum === target) return sorted.slice(0, i + 1)
  }
  return null
}

const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString()

export function reach(input: {
  /** The earlier balance, with the money it showed as pending. */
  was: { cents: number; pending?: number }
  /** The later balance; cents null when there is none to reach, `at`
      unknown to a door that has only the rows. */
  to: { at?: number; cents: number | null; pending?: number }
  /** The rows between them. */
  rows: ReadonlyArray<RuleRow>
  /** Rows just after `to`, within BOOKED_LATER_MS, that it may have had. */
  later?: ReadonlyArray<RuleRow>
}): Reach {
  const { was, to, rows } = input
  const pendWas = was.pending ?? 0
  const pendTo = to.pending ?? 0
  const result = (
    state: Reach['state'],
    found: Partial<
      Pick<Reach, 'bookedLater' | 'carried' | 'pendingWas' | 'pendingTo'>
    > & { twin?: number | null } = {},
  ): Reach => {
    const left = new Set([
      ...(found.carried ?? []).map((r) => r.id),
      ...(found.pendingWas ?? []),
    ])
    let outCents = 0
    let inCents = 0
    const counted: Array<number> = []
    for (const r of rows) {
      if (left.has(r.id)) continue
      counted.push(r.id)
      if (r.cents < 0) outCents -= r.cents
      else inCents += r.cents
    }
    const nowCents = was.cents - outCents + inCents
    return {
      state,
      counted,
      outCents,
      inCents,
      nowCents,
      gapCents:
        state === 'ok' || state === 'bare' || to.cents === null
          ? 0
          : to.cents - nowCents,
      bookedLater: found.bookedLater ?? [],
      carried: found.carried ?? [],
      pendingWas: found.pendingWas ?? [],
      pendingTo: found.pendingTo ?? null,
      twin: found.twin ?? null,
    }
  }
  if (to.cents === null) return result('bare')
  /* What the rows make beyond `to`: positive when they make too much. */
  const over = was.cents + rows.reduce((t, r) => t + r.cents, 0) - to.cents
  if (over === 0) return result('ok')

  const booked = rowsSumming(-over, input.later ?? [])
  if (booked) return result('ok', { bookedLater: booked })

  const toAt = to.at
  const carried =
    toAt === undefined
      ? null
      : rowsSumming(
          over,
          rows.filter((r) => r.at <= toAt && sameDay(r.at, toAt)),
        )
  if (carried) return result('ok', { carried })

  /* Rows that were pending: they sum to what is over, and to no more
     than `was` showed as pending. */
  const wasPending = (target: number, pool: ReadonlyArray<RuleRow>) =>
    target !== 0 &&
    Math.sign(target) === Math.sign(pendWas) &&
    Math.abs(target) <= Math.abs(pendWas)
      ? rowsSumming(target, pool)?.map((r) => r.id)
      : undefined
  const all = wasPending(over, rows)
  const isTwin = (id: number) => rows.some((r) => r.id === id && r.twin)
  if (all && !all.some(isTwin)) return result('ok', { pendingWas: all })
  for (const t of rows) {
    if (!t.twin) continue
    const rest = over - t.cents
    if (rest === 0) return result('ask', { twin: t.id })
    const p = wasPending(
      rest,
      rows.filter((r) => r.id !== t.id),
    )
    if (p) return result('ask', { pendingWas: p, twin: t.id })
  }
  if (all) return result('ok', { pendingWas: all })

  const gap = -over
  if (
    pendTo !== 0 &&
    Math.sign(pendTo) === Math.sign(gap) &&
    Math.abs(gap) <= Math.abs(pendTo)
  )
    return result('ok', { pendingTo: gap })

  /* Off. One row may still have been pending (his 3 Oct balance had
     €1,205.20 off): the one that leaves the least unexplained. */
  let best: RuleRow | null = null
  for (const r of rows) {
    if (r.twin || wasPending(r.cents, [r]) === undefined) continue
    if (
      Math.abs(over - r.cents) <
      Math.abs(over - (best === null ? 0 : best.cents))
    )
      best = r
  }
  return result('off', { pendingWas: best ? [best.id] : [] })
}
