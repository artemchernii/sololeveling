/* A transfer between two of his accounts, matched before it is saved (11
   Oct, docs/specs/2026-10-11-transfer-match.md). Revolut's file wrote
   ActivoBank's side of a €700 top-up on Sat 3 Oct and ActivoBank's own
   screenshot booked it on Tue the 6th as "COMPRA 2789 REVOLUT": written
   twice. ActivoBank sent Trade Republic €505.20 and €500.63 arrived: two
   rows where there is one transfer and a fee. The rule is mechanical —
   amount, a small fee, days, his own accounts; the check only asks when
   that is not enough to be sure. */

import { FEE_MAX_CENTS, FEE_SHARE } from './gapMatch'

const DAY_MS = 86_400_000
/** The two banks book it at most this far apart (3 Oct and the 6th; a
    pending transfer booked four days after it arrived). */
export const APART_MS = 5 * DAY_MS + 3_600_000

/** A new row of a dropped file, booked, not one he has. */
export type Row = {
  key: string
  accountId: string
  /** The file it is in: two rows of one file are never one transfer. */
  file: string
  at: number
  /** Signed cents: negative when it left the account. */
  cents: number
  /** It was read as his own money moving. */
  move: boolean
  /** His accounts its line names, by name or by an IBAN or card ending. */
  names: ReadonlyArray<string>
}

/** A row already in the app. */
export type Stored = Omit<Row, 'key' | 'file'> & {
  id: string
  /** It has its other side. */
  paired: boolean
  /** Another account's file wrote it here: this bank has not shown it. */
  fromOther: boolean
}

export type Fit = {
  /** A stored row's id, or the key of another row in the drop. */
  id: string
  /** It is in the row's own account: the same money, already there. */
  here: boolean
  /** What arrived less than was sent. */
  feeCents: number
}

export type Found = {
  key: string
  /** sure: one side fits, to the cent, and the lines say it is his own
      money. ask: a fee, no name, or more than one side fits. */
  state: 'sure' | 'ask'
  /** The closest first. */
  sides: Array<Fit>
}

const mostFee = (sentCents: number) =>
  Math.min(FEE_MAX_CENTS, Math.round(Math.abs(sentCents) * FEE_SHARE))

type Side = Omit<Stored, 'id'> & { id: string; file: string | null }

/** Is `side` the same money as `row`, and with what fee? */
export function fit(row: Row, side: Side): Fit | null {
  if (side.file !== null && side.file === row.file) return null
  if (Math.abs(side.at - row.at) > APART_MS) return null
  if (row.cents === 0 || side.cents === 0) return null
  if (side.accountId === row.accountId) {
    /* Here already, written by the other bank's file. A row that left is
       the same to the cent; one that arrived may be a fee less. */
    if (side.file !== null || !side.fromOther) return null
    if (Math.sign(side.cents) !== Math.sign(row.cents)) return null
    const feeCents = side.cents - row.cents
    if (row.cents < 0 ? feeCents !== 0 : feeCents < 0) return null
    return feeCents > mostFee(side.cents)
      ? null
      : { id: side.id, here: true, feeCents }
  }
  if (side.paired || Math.sign(side.cents) === Math.sign(row.cents)) return null
  /* A line that names another of his accounts is that account's. */
  if (
    (side.names.length > 0 && !side.names.includes(row.accountId)) ||
    (row.names.length > 0 && !row.names.includes(side.accountId))
  )
    return null
  const sent = Math.abs(row.cents < 0 ? row.cents : side.cents)
  const arrived = Math.abs(row.cents < 0 ? side.cents : row.cents)
  const feeCents = sent - arrived
  return feeCents < 0 || feeCents > mostFee(sent)
    ? null
    : { id: side.id, here: false, feeCents }
}

function sure(row: Row, side: Side, f: Fit): boolean {
  if (f.feeCents !== 0) return false
  if (f.here) return row.move || row.names.some((n) => side.names.includes(n))
  return (
    (row.move && side.move) ||
    row.names.includes(side.accountId) ||
    side.names.includes(row.accountId)
  )
}

/** For each new row that is one side of a transfer he has, or of one in
    another file of the drop: the sides that fit, and whether to ask. Each
    side is the best fit of one row only. */
export function transferMatches(
  rows: ReadonlyArray<Row>,
  stored: ReadonlyArray<Stored>,
): Array<Found> {
  const sides: Array<Side> = [
    ...stored.map((s) => ({ ...s, file: null })),
    ...rows.map((r) => ({
      ...r,
      id: r.key,
      paired: false,
      fromOther: false,
    })),
  ]
  const pairs: Array<{ r: number; s: number; f: Fit; apart: number }> = []
  for (const [r, row] of rows.entries())
    for (const [s, side] of sides.entries()) {
      if (side.id === row.key) continue
      const f = fit(row, side)
      if (f) pairs.push({ r, s, f, apart: Math.abs(side.at - row.at) })
    }
  pairs.sort(
    (x, y) =>
      x.f.feeCents - y.f.feeCents ||
      x.apart - y.apart ||
      x.r - y.r ||
      x.s - y.s,
  )
  /* A stored side is one row's; two rows of a drop that are each other's
     keep each other. */
  const best = new Map<number, (typeof pairs)[number]>()
  const taken = new Map<string, string>()
  for (const p of pairs) {
    const row = rows[p.r]
    if (best.has(p.r)) continue
    const by = taken.get(p.f.id)
    if (by !== undefined && by !== row.key) continue
    const mine = taken.get(row.key)
    if (mine !== undefined && mine !== p.f.id) continue
    best.set(p.r, p)
    taken.set(p.f.id, row.key)
    if (sides[p.s].file !== null) taken.set(row.key, p.f.id)
  }
  const out: Array<Found> = []
  for (const [r, p] of best) {
    const row = rows[r]
    const also = pairs.filter(
      (q) =>
        q.r === r &&
        q.f.id !== p.f.id &&
        (taken.get(q.f.id) ?? row.key) === row.key,
    )
    out.push({
      key: row.key,
      state: also.length === 0 && sure(row, sides[p.s], p.f) ? 'sure' : 'ask',
      sides: [p.f, ...also.map((q) => q.f)],
    })
  }
  return out.sort((x, y) => x.key.localeCompare(y.key))
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** His accounts a bank's line names: the account's name as whole words,
    or one of its IBAN or card endings as a number of its own. */
export function namedAccounts(
  line: string,
  accounts: ReadonlyArray<{
    id: string
    name: string
    tails: ReadonlyArray<string>
  }>,
): Array<string> {
  const said = ` ${plain(line)} `
  return accounts
    .filter((a) => {
      const name = plain(a.name)
      return (
        (name.length >= 3 && said.includes(` ${name} `)) ||
        a.tails.some((t) => t.length >= 4 && said.includes(` ${t} `))
      )
    })
    .map((a) => a.id)
}
