/* How a day of Body logs is laid out in History (26 Sep: "a bit hard to
   distinguish different types"). Rows are grouped by what they were — a
   weigh-in first, then the kinds in the hero's order — and a session's
   text is split into its workout and the moves ticked in it. No React, no
   Convex: it arranges rows and counts nothing. */

/** The hero's order, and History's (26 Sep: "make history same order"). */
export const BODY_ORDER: ReadonlyArray<string> = [
  'stretch',
  'gym',
  'boxing',
  'hiking',
  'supplements',
]

type GroupKey = { kind: string; meta?: { category?: string } }

/** What a row is grouped under: `weight`, its category, or null. */
export function groupOf(row: GroupKey): string | null {
  if (row.kind === 'weight') return 'weight'
  return row.meta?.category ?? null
}

function rank(key: string | null): number {
  if (key === 'weight') return -1
  if (key === null) return 1000
  const i = BODY_ORDER.indexOf(key)
  return i < 0 ? 500 : i
}

/** Rows in groups, weight first, then the hero's order, other words after
    and unsorted last; each group keeps the rows' own order. */
export function groupByKind<T extends GroupKey>(
  rows: ReadonlyArray<T>,
): Array<{ key: string | null; rows: Array<T> }> {
  const groups = new Map<string | null, Array<T>>()
  for (const row of rows) {
    const key = groupOf(row)
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, rows: list }))
    .sort(
      (a, b) =>
        rank(a.key) - rank(b.key) || (a.key ?? '').localeCompare(b.key ?? ''),
    )
}

/** "Back day — Lat pulldown, Face pull" → the workout and its moves. */
export function splitSession(text: string): {
  title: string
  moves: Array<string>
} {
  const at = text.indexOf(' — ')
  if (at < 0) return { title: text, moves: [] }
  return {
    title: text.slice(0, at),
    moves: text
      .slice(at + 3)
      .split(', ')
      .filter((m) => m.length > 0),
  }
}
