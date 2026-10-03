/* SPENDING (Flow, 3 Oct): one month's groups beside the month before and
   the five before that. Every number here is one of aggregate.flowMonths'
   sums or the difference of two of them shown side by side — the journey's
   "what grew most since last month, said in one line" (his yes, 3 Oct). */

export type FlowMonth = {
  start: number
  in: number
  out: number
  rows: number
  groups: ReadonlyArray<{ category: string | null; sum: number; count: number }>
}

export type GroupLine = {
  category: string | null
  now: number
  prev: number
  count: number
  /** Oldest first, ending with this month; 0 for a month with none. */
  six: Array<number>
}

/* The mortgage does not "grow": a bill that moved is not news here. */
const STEADY = new Set(['home'])

/**
 * The groups of `months[at]`, biggest first, each with the month before
 * and six months of sums; the totals; and the group that grew most since
 * the month before (none when nothing grew).
 */
export function spendingOf(months: ReadonlyArray<FlowMonth>, at: number) {
  /* Out of range is no month, never the last one counted from the end. */
  const get = (i: number): FlowMonth | undefined =>
    i >= 0 && i < months.length ? months[i] : undefined
  const sumOf = (i: number, c: string | null) =>
    get(i)?.groups.find((g) => g.category === c)?.sum ?? 0
  const now = get(at)
  const lines: Array<GroupLine> = (now?.groups ?? []).map((g) => ({
    category: g.category,
    now: g.sum,
    prev: sumOf(at - 1, g.category),
    count: g.count,
    six: [5, 4, 3, 2, 1, 0].map((back) => sumOf(at - back, g.category)),
  }))
  const grew = lines
    .filter((l) => !STEADY.has(l.category ?? '') && l.now - l.prev > 0)
    .sort((a, b) => b.now - b.prev - (a.now - a.prev))
    .at(0)
  return {
    lines,
    total: now?.out ?? 0,
    prevTotal: get(at - 1)?.out ?? 0,
    hasPrev: (get(at - 1)?.rows ?? 0) > 0,
    grew: grew
      ? {
          category: grew.category,
          now: grew.now,
          change: Math.round((grew.now - grew.prev) * 100) / 100,
        }
      : null,
  }
}
