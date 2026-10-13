/* ADD BUYS on one position's page (14 Oct, mockup add-buys.html): the
   buys a dropped file holds for this one thing, which of them are saved
   already, and the units they reach beside the units held. Sums of
   trade rows and nothing else; the two unit numbers are always shown
   side by side, never the difference alone. */

export type ReadBuy = {
  occurredAt: number
  side: 'buy' | 'sell' | 'reward'
  shares: number
  price: number
  currency: string
  symbol: string | null
}
export type SavedTrade = {
  occurredAt: number
  side: 'buy' | 'sell'
  shares: number
}

const DAY = 86_400_000
const day = (t: number) => Math.floor(t / DAY)
const same = (a: ReadBuy, b: SavedTrade) =>
  a.side === b.side &&
  day(a.occurredAt) === day(b.occurredAt) &&
  Math.abs(a.shares - b.shares) < 1e-6
const net = (rows: ReadonlyArray<{ side: string; shares: number }>) =>
  rows.reduce((t, r) => t + (r.side === 'sell' ? -r.shares : r.shares), 0)

export function buysCheck(
  read: ReadonlyArray<ReadBuy>,
  saved: ReadonlyArray<SavedTrade>,
  /** Every listing the thing is owned under. */
  symbols: ReadonlyArray<string>,
  held: number,
) {
  const mine = read.filter(
    (r) => r.symbol !== null && symbols.includes(r.symbol),
  )
  /* A saved row answers for one read row, not for two alike. */
  const left = [...saved]
  const rows = [...mine]
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .map((r) => {
      const i = left.findIndex((s) => same(r, s))
      if (i >= 0) left.splice(i, 1)
      return {
        ...r,
        had: i >= 0,
        /* What it was for, where it is printed in euros. */
        eur:
          r.currency === 'EUR'
            ? Math.round(r.shares * r.price * 100) / 100
            : null,
      }
    })
  const buys = rows.filter((r) => r.side === 'buy')
  const fresh = rows.filter((r) => !r.had)
  const units = Number((net(saved) + net(fresh)).toFixed(8))
  const missing = Number((held - units).toFixed(8))
  /* Brokers round what they print: a fifth of a percent is the same. */
  const near = Math.max(1e-6, held * 0.002)
  return {
    rows,
    /* Rows of the file that are for something else: not saved here. */
    others: read.length - mine.length,
    fresh: fresh.length,
    totalEur: buys.some((r) => r.eur === null)
      ? null
      : Math.round(buys.reduce((t, r) => t + (r.eur ?? 0), 0) * 100) / 100,
    readUnits: Number(net(rows).toFixed(8)),
    units,
    held,
    missing,
    state:
      missing > near
        ? ('missing' as const)
        : missing < -near
          ? ('over' as const)
          : ('reaches' as const),
  }
}
