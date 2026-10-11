/* The words of "take this file back" (11 Oct, mockup design/treasury-
   mockup/undo-file.html): what goes, said before the press, and what the
   account is afterwards. The counts and amounts are convex/undoFile's
   `preview`; nothing is worked out here but the sentence. */

export type Goes = {
  rows: number
  trades: number
  positions: number
  /** The day of the balance the file set, as it is said: "11 Oct". */
  balanceDay: string | null
  /** The file's cash is the account's too (a broker screen's). */
  cash: boolean
}

const n = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** The things that go, each said whole: ["2 rows", "the balance of 11 Oct"]. */
export function goesParts(g: Goes): Array<string> {
  const parts = []
  if (g.rows > 0) parts.push(n(g.rows, 'row', 'rows'))
  if (g.trades > 0) parts.push(n(g.trades, 'buy or sell', 'buys and sells'))
  if (g.positions > 0)
    parts.push(
      `${n(g.positions, 'position', 'positions')}${g.cash ? ' and the cash' : ''}`,
    )
  if (g.balanceDay !== null && !(g.positions > 0 && g.cash))
    parts.push(`the balance of ${g.balanceDay}`)
  return parts
}

/** "go" for several things or several of one, "goes" for a single one. */
export function goesVerb(g: Goes): 'go' | 'goes' {
  const parts = goesParts(g)
  return parts.length === 1 && /^(1 |the )/.test(parts[0]) && !g.cash
    ? 'goes'
    : 'go'
}

export type After = {
  account: string
  /** Amounts as shown: "€153.21". Null: the file says nothing of cash. */
  now: string | null
  after: string | null
}

/** The line under the tick, once it is taken back. */
export function afterWords(a: After): string {
  if (a.now === null) return `${a.account} is as it was before this file.`
  if (a.after === null) return `${a.account} has no balance now.`
  return a.after === a.now
    ? `${a.account} stays ${a.now}.`
    : `${a.account} is ${a.after} again.`
}
