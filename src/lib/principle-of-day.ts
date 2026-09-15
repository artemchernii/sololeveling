/* Which of the six principles Today shows (PLAN.md §3). Chosen by the local
   date, so it is the same line all day and a different one tomorrow — the
   weekly review already picks one per week the same way. A principle that
   changes when you refresh is decoration.

   The day number is taken from the local calendar date read as UTC, not from
   local midnight in milliseconds: a clock change moves local midnight by an
   hour, and dividing that by a day's length gives two days one number. */
export function principleIndex(date: Date, count: number): number {
  if (count <= 0) return -1
  const day =
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  return ((day % count) + count) % count
}
