/* Rows grouped under the day they happened — "Today", "Yesterday", then
   "Sat 13 Sep" — for a Recent list that reads like a diary rather than a
   log file (25 Sep). Grouping only: it counts nothing. Rows arrive newest
   first and keep that order. */

export type DayGroup<T> = { key: number; label: string; rows: Array<T> }

export function groupByDay<T extends { occurredAt: number }>(
  rows: ReadonlyArray<T>,
  now: Date = new Date(),
): Array<DayGroup<T>> {
  const today = new Date(now).setHours(0, 0, 0, 0)
  const groups: Array<DayGroup<T>> = []
  for (const row of rows) {
    const key = new Date(row.occurredAt).setHours(0, 0, 0, 0)
    let group = groups.at(-1)
    if (group?.key !== key) {
      const days = Math.round((today - key) / 86_400_000)
      group = {
        key,
        label:
          days === 0
            ? 'Today'
            : days === 1
              ? 'Yesterday'
              : new Date(key).toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                }),
        rows: [],
      }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}
