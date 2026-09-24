/* The quick deadlines on the new-goal composer (24 Sep): a month from
   today, three months, or the end of the year — the three answers most
   goals have, one tap each, instead of a raw date field. All local ISO
   dates in, local ISO dates out.

   A month from 31 Jan is the last day of February, not 3 March: the day
   is kept where it can be and clamped to the month's end where it cannot. */

export type QuickDeadline = 'month' | 'quarter' | 'year'

export const QUICK_DEADLINES: ReadonlyArray<{
  key: QuickDeadline
  label: string
}> = [
  { key: 'month', label: 'In a month' },
  { key: 'quarter', label: 'In 3 months' },
  { key: 'year', label: 'By year end' },
]

export function quickDeadline(kind: QuickDeadline, today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  if (kind === 'year') return `${y}-12-31`
  const add = kind === 'month' ? 1 : 3
  const month0 = m - 1 + add
  const year = y + Math.floor(month0 / 12)
  const month = (month0 % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
