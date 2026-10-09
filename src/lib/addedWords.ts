/* What an account got, in words (9 Oct: the landed line said "1 added",
   and he had "no fucking clue" what). Counts by what they are — movements
   from a statement, trades, positions — then the names of what was bought
   or held. */
export type Added = {
  rows: number
  movements?: number
  trades?: number
  positions?: number
  names?: ReadonlyArray<string>
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

export function addedWords(a: Added): string {
  if (a.rows === 0) return 'nothing new'
  const parts = [
    a.movements ? count(a.movements, 'movement', 'movements') : null,
    a.trades ? count(a.trades, 'trade', 'trades') : null,
    a.positions ? count(a.positions, 'position', 'positions') : null,
  ].filter((p) => p !== null)
  const what = parts.length ? parts.join(', ') : count(a.rows, 'row', 'rows')
  const names = (a.names ?? []).slice(0, 4)
  const more = (a.names?.length ?? 0) - names.length
  return names.length
    ? `${what} added · ${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}`
    : `${what} added`
}
