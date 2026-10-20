/* Does a file add up, before any of it is saved (11 Oct). The balance the
   account holds, plus the rows the file calls new, should reach the
   balance the file prints. One ActivoBank screenshot wrote a −€700 top-up
   twice and took a pending −€505.20 off twice; both show here as a sum
   that is off, before a row is written. Arithmetic only — nothing the
   reader judged. */

import { reach } from './balanceRule'

export type CheckRow = {
  index: number
  at: number
  /** Signed cents: money out is negative. */
  cents: number
  /** A row the account already has of the same amount, days apart, that
      nothing matched: this one may be it again. */
  twin: boolean
}

export type SumCheck = {
  /** ok: it adds up. ask: it would without one row that looks like one
      he has. off: nothing explains it. bare: the file prints no balance. */
  state: 'ok' | 'ask' | 'off' | 'bare'
  outCents: number
  inCents: number
  /** The held balance, with saved rows of its day it had not seen. */
  wasCents: number
  /** What the held balance and the rows make. */
  nowCents: number
  /** printed − now: negative when money left that no row shows. */
  gapCents: number
  /** Rows the held balance had already taken off as pending: saved, not
      summed. */
  pending: Array<number>
  /** The row asked about. */
  twin: number | null
}

export function sumCheck(input: {
  /** The balance held, with what moved since. */
  wasCents: number
  /** Money that balance showed as pending, signed; 0 when none. */
  pendingCents: number
  /** The file's new rows dated after that balance. */
  rows: ReadonlyArray<CheckRow>
  /** Rows of that balance's own day it may not have seen: the file's, and
      saved ones (`saved`, counted into was). */
  earlier?: ReadonlyArray<CheckRow & { saved?: boolean }>
  printedCents: number | null
}): SumCheck {
  /* The one rule (src/lib/balanceRule.ts). */
  const rule = (row: CheckRow & { saved?: boolean }) => ({
    id: row.index,
    at: row.at,
    cents: row.cents,
    twin: row.twin,
    saved: row.saved,
  })
  const r = reach({
    was: { cents: input.wasCents, pending: input.pendingCents },
    to: { cents: input.printedCents },
    rows: input.rows.map(rule),
    earlier: input.earlier?.map(rule),
  })
  return {
    state: r.state,
    wasCents: r.wasCents,
    outCents: r.outCents,
    inCents: r.inCents,
    nowCents: r.nowCents,
    gapCents: r.gapCents,
    pending: r.pendingWas,
    twin: r.twin,
  }
}
