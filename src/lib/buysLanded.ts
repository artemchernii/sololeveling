/* Where a save's buys sit, split for one thing's ADD BUYS (14 Oct): on
   the thing (any listing it is owned under), or on another thing — the
   save that said "9 buys saved · iShares Physical Gold" while all nine
   sat on iShares Digital Security. Counts of saved rows, nothing worked
   out. */
export type Landed = {
  symbol: string
  name: string
  type: string
  buys: number
  sells: number
  read: Array<string>
}

export function landedSplit(
  landed: ReadonlyArray<Landed>,
  symbols: ReadonlyArray<string>,
) {
  const mine = landed.filter((l) => symbols.includes(l.symbol))
  const away = landed.filter((l) => !symbols.includes(l.symbol))
  const rows = (ls: ReadonlyArray<Landed>) =>
    ls.reduce((t, l) => t + l.buys + l.sells, 0)
  return { here: rows(mine), away, all: rows(landed) }
}
