/* A broker screenshot against the total it prints (11 Oct,
   docs/specs/2026-10-11-holdings-total.md): the worth of the positions it
   shows, added, with the cash, beside the total on the same screenshot.
   Both are printed at the same moment, so they differ only by rounding:
   a cent for each printed line. Nothing here is saved or worked out
   beyond the sum of the screenshot's own rows. */

export type TotalCheck = {
  /* `none`: the screenshot prints no total, or shows no position, or one
     of them has no worth — there is nothing to compare. */
  state: 'same' | 'differs' | 'none'
  positions: number
  positionsEur: number
  cashEur: number | null
  /** The positions and the cash. */
  bothEur: number
  totalEur: number | null
  /** The total it reached is the positions alone (Trading 212's list). */
  withoutCash: boolean
}

const cents = (n: number) => Math.round(n * 100)

export function holdingsTotal(
  values: ReadonlyArray<number | undefined>,
  cashEur: number | null,
  totalEur: number | null,
): TotalCheck {
  const known = values.flatMap((v) => (v === undefined ? [] : [v]))
  const positions = known.reduce((t, v) => t + cents(v), 0)
  const both = positions + cents(cashEur ?? 0)
  const out = {
    positions: values.length,
    positionsEur: positions / 100,
    cashEur,
    bothEur: both / 100,
    totalEur,
  }
  if (totalEur === null || values.length === 0 || known.length < values.length)
    return { ...out, state: 'none', withoutCash: false }
  /* Each printed line is rounded to a cent; a total printed in whole
     euros is rounded to a euro. */
  const room = Number.isInteger(totalEur)
    ? 100
    : Math.max(5, values.length + (cashEur === null ? 0 : 1))
  const total = cents(totalEur)
  if (Math.abs(both - total) <= room)
    return { ...out, state: 'same', withoutCash: false }
  if (cashEur !== null && Math.abs(positions - total) <= room)
    return { ...out, state: 'same', withoutCash: true }
  return { ...out, state: 'differs', withoutCash: false }
}

/** What most likely happened, in the words the screen uses. */
export const totalWhy = (c: TotalCheck): string =>
  c.totalEur !== null && c.bothEur < c.totalEur
    ? 'A position is missing from the screenshot, or a number was read wrong.'
    : 'A number was read wrong, or a position is on the screenshot twice.'
