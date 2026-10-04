/* Local month bounds for Flow's queries: the client knows his midnight,
   the server does not (as everywhere else in Finances). */

export type Span = { start: number; end: number }

/** `n` months ending with the one `today` is in, oldest first. */
export function monthsBack(today: number, n: number): Array<Span> {
  const d = new Date(today)
  const out: Array<Span> = []
  for (let back = n - 1; back >= 0; back--) {
    out.push({
      start: new Date(d.getFullYear(), d.getMonth() - back, 1).getTime(),
      end: new Date(d.getFullYear(), d.getMonth() - back + 1, 1).getTime(),
    })
  }
  return out
}

/* en-US for the short month: en-GB writes September "Sept". */
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' })
const LONG = new Intl.DateTimeFormat('en-GB', { month: 'long' })
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })

export const monthName = (t: number) => MONTH.format(new Date(t))
export const monthLong = (t: number) => LONG.format(new Date(t))
export const dayMonth = (t: number) =>
  `${new Date(t).getDate()} ${monthName(t)}`
export const weekday = (t: number) => WEEKDAY.format(new Date(t))

/** Whole days from one local day to another's (noon UTC or midnight). */
export function daysBetween(from: number, to: number): number {
  const a = new Date(from)
  const b = new Date(to)
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86_400_000,
  )
}

/** "€1,234" for a big figure, "€12.30" where cents matter. */
export function eur(n: number, cents = false): string {
  return (
    '€' +
    Math.abs(n).toLocaleString('en-GB', {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
  )
}
