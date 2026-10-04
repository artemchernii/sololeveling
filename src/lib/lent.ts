/* Lent and paid back (4 Oct: €100 to Oleksandr by MB WAY on 28 Sep,
   €100 back from him on 1 Oct). He says "I lent it" on the money out;
   the money back is found by itself: an income row after it, from the
   same person, up to what is still owed. Pure, so it is tested here. */

/** How the bank says it moved, not who: never a person's name. */
const NOT_NAMES = new Set([
  'TRF',
  'MB',
  'WAY',
  'TRANSF',
  'TRANSFER',
  'SEPA',
  'INST',
  'DE',
  'DA',
  'DO',
  'PARA',
])

/** The words of a person's name on a bank line: "TRF MB WAY P/ OLEKSANDR
    SAKHNO" and "TRF. P/O OLEKSANDR SAKHNO" share OLEKSANDR and SAKHNO. */
export function personWords(line: string): Array<string> {
  return line
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !NOT_NAMES.has(w))
}

export type LentRow = {
  id: string
  kind: 'expense' | 'income'
  amount: number
  t: number
  line: string
  lent: boolean
}

const DAY = 86_400_000
const BACK_WITHIN = 365 * DAY

/** The income rows that are money back for what he lent, oldest first,
    never more than was lent to that person. */
export function backFor(rows: ReadonlyArray<LentRow>): Array<string> {
  const sorted = [...rows].sort((a, b) => a.t - b.t)
  const owed = new Map<string, { cents: number; since: number }>()
  const back: Array<string> = []
  for (const r of sorted) {
    const who = personWords(r.line)
    if (who.length === 0) continue
    const key = [...who].sort().join(' ')
    if (r.kind === 'expense' && r.lent) {
      const o = owed.get(key) ?? { cents: 0, since: r.t }
      owed.set(key, {
        cents: o.cents + Math.round(r.amount * 100),
        since: o.since,
      })
      continue
    }
    if (r.kind !== 'income') continue
    const match = [...owed.entries()].find(
      ([k, o]) =>
        o.cents > 0 &&
        r.t - o.since <= BACK_WITHIN &&
        k.split(' ').some((w) => who.includes(w)),
    )
    if (!match) continue
    const [k, o] = match
    const c = Math.round(r.amount * 100)
    if (c > o.cents) continue
    if (!r.lent) back.push(r.id)
    owed.set(k, { ...o, cents: o.cents - c })
  }
  return back
}
