/* Chart by account (3 Oct). Artem: "graph with sources and different
   lines … make it smart." Spec: docs/specs/2026-10-03-chart-by-account.md;
   mockup: design/treasury-mockup/accounts-chart.html. Pure — what the
   ACCOUNTS view draws, worked out from aggregate.worthHistory's own
   per-account series, so it is tested without a chart. */

const DAY_MS = 86_400_000

type Values = ReadonlyArray<number | null>

/** Each account's worth per day: its cash and its shares together. A day
    with neither is null — no line is drawn before the app knew it. */
export function accountLines<TId extends string>(
  cash: ReadonlyArray<{ accountId: TId; values: Values }>,
  invested: ReadonlyArray<{ accountId: TId; values: Values }>,
): Array<{ accountId: TId; values: Array<number | null> }> {
  const out = new Map<TId, Array<number | null>>()
  const add = (id: TId, values: Values) => {
    const into = out.get(id) ?? values.map(() => null)
    out.set(
      id,
      into.map((v, i) => {
        const x = values[i] ?? null
        if (x === null) return v
        return Math.round(((v ?? 0) + x) * 100) / 100
      }),
    )
  }
  for (const a of cash) add(a.accountId, a.values)
  for (const a of invested) add(a.accountId, a.values)
  return [...out].map(([accountId, values]) => ({ accountId, values }))
}

/** The axis: four steps of 1 · 2 · 2.5 · 5 × 10ⁿ that reach `max`. */
export function niceStep(max: number): number {
  if (!(max > 0)) return 1
  const raw = max / 4
  const m = Math.pow(10, Math.floor(Math.log10(raw)))
  return (
    [1, 2, 2.5, 5, 10].map((k) => k * m).find((k) => k * 4 >= max) ?? m * 10
  )
}

export type Layout<TId> = {
  /** Drawn as lines: two or more days in the range. */
  lined: Array<TId>
  /** One day in the range — new: a pin on the right, not the scale (3 Oct:
      Trading 212's single €15k point pressed five lines into the floor). */
  pinned: Array<TId>
  step: number
}

export function layout<TId>(
  lines: ReadonlyArray<{ accountId: TId; values: Values }>,
  from: number,
): Layout<TId> {
  const lined: Array<TId> = []
  const pinned: Array<TId> = []
  let max = 0
  for (const l of lines) {
    const days = l.values.slice(from).filter((v): v is number => v !== null)
    if (days.length === 0) continue
    if (days.length === 1) pinned.push(l.accountId)
    else {
      lined.push(l.accountId)
      max = Math.max(max, ...days)
    }
  }
  if (lined.length === 0)
    for (const l of lines)
      for (const v of l.values.slice(from))
        if (v !== null) max = Math.max(max, v)
  return { lined, pinned, step: niceStep(max) }
}

/** The first day an account has a value: when the app first knew it. */
export function firstDay(values: Values): number | null {
  const i = values.findIndex((v) => v !== null)
  return i < 0 ? null : i
}

/** Accounts that joined within a week of each other share one tag. */
export function joinGroups<TId>(
  joins: ReadonlyArray<{ accountId: TId; at: number }>,
  window = 7 * DAY_MS,
): Array<{ at: number; accountIds: Array<TId> }> {
  const out: Array<{ at: number; last: number; accountIds: Array<TId> }> = []
  for (const j of [...joins].sort((a, b) => a.at - b.at)) {
    const g = out.at(-1)
    if (g && j.at - g.last <= window) {
      g.accountIds.push(j.accountId)
      g.last = j.at
    } else out.push({ at: j.at, last: j.at, accountIds: [j.accountId] })
  }
  return out.map(({ at, accountIds }) => ({ at, accountIds }))
}

export type OwnMove<TId> = { at: number; from: TId; to: TId; amount: number }

/**
 * His moves between his own accounts, once each. A transfer is stored as
 * two rows, and either may be the one that names the other account (3 Oct:
 * BPI's −€1,100 names ActivoBank, ActivoBank's +€1,100 names nobody). Each
 * row that names another of his accounts says from and to; the same amount
 * between the same two within three days is one move.
 */
export function ownMoves<TId>(
  rows: ReadonlyArray<{
    at: number
    accountId: TId
    value: number
    otherAccountId: TId | null
  }>,
): Array<OwnMove<TId>> {
  const out: Array<OwnMove<TId>> = []
  for (const r of [...rows].sort((a, b) => a.at - b.at)) {
    if (r.otherAccountId === null || r.otherAccountId === r.accountId) continue
    if (Math.abs(r.value) < 0.005) continue
    const m: OwnMove<TId> = {
      at: r.at,
      from: r.value < 0 ? r.accountId : r.otherAccountId,
      to: r.value < 0 ? r.otherAccountId : r.accountId,
      amount: Math.round(Math.abs(r.value) * 100) / 100,
    }
    const twin = out.some(
      (o) =>
        o.from === m.from &&
        o.to === m.to &&
        o.amount === m.amount &&
        Math.abs(o.at - m.at) <= 3 * DAY_MS,
    )
    if (!twin) out.push(m)
  }
  return out
}

/** Which of two rows each label in the lane sits on: the first row unless
    it would overlap a label already there. Spans are where each label is
    drawn — a label near the right edge reads leftwards. */
export function laneRows(
  spans: ReadonlyArray<{ start: number; end: number }>,
): Array<0 | 1> {
  const taken: [
    Array<{ start: number; end: number }>,
    Array<{ start: number; end: number }>,
  ] = [[], []]
  const free = (row: 0 | 1, s: { start: number; end: number }) =>
    taken[row].every((t) => s.end + 8 < t.start || s.start > t.end + 8)
  return spans.map((s) => {
    const row: 0 | 1 = free(0, s) ? 0 : 1
    taken[row].push(s)
    return row
  })
}

/**
 * Events too close to label apart become one (3 Oct, his data on 1Y: six
 * moves inside two months piled into one smear). Greedy, left to right:
 * an event within `gap` of the cluster's first joins it. Returns the
 * indices of each cluster, in order.
 */
export function laneClusters(
  xs: ReadonlyArray<number>,
  gap: number,
): Array<Array<number>> {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
  const out: Array<{ x: number; members: Array<number> }> = []
  for (const e of order) {
    const c = out.at(-1)
    if (c && e.x - c.x < gap) c.members.push(e.i)
    else out.push({ x: e.x, members: [e.i] })
  }
  return out.map((c) => c.members)
}

/** Stacked bands (3 Oct, his pick "A", by default): the steadiest account
    at the bottom — the one with the most days — so the bands that move
    sit on top where their changes read. */
export function stackOrder<TId>(
  lines: ReadonlyArray<{ accountId: TId; values: Values }>,
): Array<TId> {
  return [...lines]
    .map((l, i) => ({ l, i, days: l.values.filter((v) => v !== null).length }))
    .sort((a, b) => b.days - a.days || a.i - b.i)
    .map((x) => x.l.accountId)
}

/** Each account's band per day: [bottom, top], stacked in `order`. A day
    an account has no value it is a band of nothing. */
export function stackBands<TId>(
  lines: ReadonlyArray<{ accountId: TId; values: Values }>,
  order: ReadonlyArray<TId>,
): Map<TId, Array<[number, number]>> {
  const days = lines[0]?.values.length ?? 0
  const out = new Map<TId, Array<[number, number]>>()
  const floor = Array.from({ length: days }, () => 0)
  for (const id of order) {
    const vals = lines.find((l) => l.accountId === id)?.values ?? []
    const band: Array<[number, number]> = []
    for (let i = 0; i < days; i++) {
      const lo = floor[i]
      const hi = Math.round((lo + (vals[i] ?? 0)) * 100) / 100
      band.push([lo, hi])
      floor[i] = hi
    }
    out.set(id, band)
  }
  return out
}
