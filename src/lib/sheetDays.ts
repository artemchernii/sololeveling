/* The clean account list's day line (31 Oct, sync-line.html): what went
   out that day — the count and the sum of its listed rows under 0, in one
   currency — and that day's balance, only when the bank or a file gave
   one that day. Nothing derived: a sum of shown rows and a stored reading. */

export type DayLine = {
  currency: string
  outCount: number
  outSum: number
  balance: number | null
}

export function dayLine(
  rows: ReadonlyArray<{ amount: number; currency: string }>,
  readings: ReadonlyArray<{ at: number; value: number; currency: string }>,
  dayStart: number,
  dayEnd: number,
): DayLine | null {
  const first = rows.at(0)
  if (first === undefined) return null
  const currency = first.currency
  const out = rows.filter((r) => r.currency === currency && r.amount < 0)
  const that = readings
    .filter((r) => r.currency === currency && r.at >= dayStart && r.at < dayEnd)
    .sort((a, b) => b.at - a.at)
    .at(0)
  return {
    currency,
    outCount: out.length,
    outSum: Math.round(out.reduce((t, r) => t + r.amount, 0) * 100) / 100,
    balance: that?.value ?? null,
  }
}
