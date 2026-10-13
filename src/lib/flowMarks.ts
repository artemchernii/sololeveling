/* Two small rules of how Flow draws money (13 Oct). Pure, so both are
   tested: a zero has no sign, and a day's two bars share one room. */

function euro(n: number, cents: boolean): string {
  return (
    '€' +
    Math.abs(n).toLocaleString('en-GB', {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
  )
}

/** Money out: "−€12". An amount that shows as zero is "€0", never "−€0". */
export function outEur(n: number, cents = false): string {
  const text = euro(n, cents)
  return Number(text.replace(/[^\d.]/g, '')) === 0 ? text : `−${text}`
}

/** Money in: "+€12", and "€0" for nothing. */
export function inEur(n: number, cents = false): string {
  const text = euro(n, cents)
  return Number(text.replace(/[^\d.]/g, '')) === 0 ? text : `+${text}`
}

/** The heights of a day's green and red bars on the Movements strip. Each
 * is the square root of its share of the biggest day out; together they
 * never pass `room`, so a salary over a big payment does not climb over
 * the bill's ring above them. The smallest bar is still a bar. */
export function dayBars(
  moneyIn: number,
  moneyOut: number,
  biggest: number,
  room = 44,
): { in: number; out: number } {
  const top = Math.max(1, biggest)
  let a =
    moneyIn > 0
      ? Math.max(2, Math.min(room, Math.sqrt(moneyIn / top) * room))
      : 0
  let b =
    moneyOut > 0
      ? Math.max(5, Math.min(room, Math.sqrt(moneyOut / top) * room))
      : 0
  if (a + b > room) {
    const k = room / (a + b)
    a = Math.max(2, a * k)
    b = Math.max(5, b * k)
  }
  return { in: a, out: b }
}
