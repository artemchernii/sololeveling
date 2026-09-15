/* The words under a tile that has a target (PLAN.md §3 item 4). Calendar
   arithmetic, and the composition of two sanctioned values — a log count and
   a goal's targetValue — the same shape as "2 of 4". Not a fifth source.

   Being short reads as words, never as red (§3, 15 Sep): "4 to go" is what
   is true, and it needs no colour to be heard. */

/** Days left in the month, counting today: 16 on 15 Sep, 1 on the 30th. */
export function daysLeftInMonth(date: Date): number {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return lastDay - date.getDate() + 1
}

/** "4 to go · 16 days left", "target met · 16 days left", "2 to go · last day". */
export function targetLine(
  count: number,
  target: number,
  daysLeft: number,
): string {
  const days = daysLeft === 1 ? 'last day' : `${daysLeft} days left`
  return count >= target
    ? `target met · ${days}`
    : `${target - count} to go · ${days}`
}
