/* Rows from the bank itself (11 Oct, a connected bank, slice 2): what
   Enable Banking answers for one account, turned into the rows a read file
   has, so they go through the same check before saving. No Convex and no
   network here. */

export type BankTx = {
  /** BOOK is booked; PDNG and HOLD are pending: the bank's available
      balance has them taken off already. Anything else is no money. */
  status: string
  /** Unsigned, as the bank prints it: "25.00". */
  amount: string
  currency: string
  /** CRDT came in, DBIT went out. */
  indicator: string
  bookingDate?: string
  valueDate?: string
  /** The day the card was used: a pending row often has only this. */
  transactionDate?: string
  creditor?: string
  debtor?: string
  remittance: Array<string>
}

export type BankRow = {
  occurredAt: number
  merchant: string
  raw: string
  amount: number
  currency: string
  pending: boolean
  self: boolean
}

const DAY = 86_400_000

/** The day asked from: the day before the balance held, as the bank
    writes days. Rows older than that balance are dropped by `rowsSince`. */
export function dateFrom(heldAt: number): string {
  return new Date(heldAt - DAY).toISOString().slice(0, 10)
}

const PENDING = ['PDNG', 'HOLD']

/** A booked or a pending row, or null. A pending row is never written
    (it is once the bank books it); it goes to the check, as a file's
    pending row does, because Revolut's balance has it taken off already
    (17 Oct: €14.65 of two pending payments drew a question). A row with
    no day or amount is no row. */
export function bankRow(t: BankTx, now: number): BankRow | null {
  const pending = PENDING.includes(t.status)
  if (t.status !== 'BOOK' && !pending) return null
  const day = t.bookingDate ?? t.valueDate ?? t.transactionDate
  const value = Number(t.amount)
  if (day === undefined || !Number.isFinite(value) || value === 0) return null
  /* A day is noon UTC, as a file's rows are — the same day from Lisbon to
     New York. Never ahead of the moment the bank answered. */
  const at = Date.parse(`${day}T12:00:00Z`)
  if (!Number.isFinite(at)) return null
  const out = t.indicator === 'DBIT'
  const words = t.remittance.map((w) => w.trim()).filter((w) => w !== '')
  const other = (out ? t.creditor : t.debtor)?.trim()
  const merchant = (other || words.at(0) || 'Payment').slice(0, 80)
  return {
    occurredAt: Math.min(at, now),
    merchant,
    raw: (words.join(' ') || merchant).slice(0, 200),
    amount: (out ? -1 : 1) * Math.abs(value),
    currency: t.currency,
    pending,
    self: false,
  }
}

/** The bank's booked rows from the balance held on: a first connect takes
    nothing older (the balance already has it). A row of that balance's own
    day is kept — the check decides whether the balance had counted it.
    Every pending row is kept, however old: the balance has it off now.
    So is a booked row an earlier reading had as pending — the same amount,
    the card's day within three days: Revolut books it under the day the
    card was used, before the reading that saw it pending (31 Oct: three
    23 Oct payments pending on the 24th were never saved). */
export function rowsSince(
  list: ReadonlyArray<BankTx>,
  heldAt: number,
  now: number,
  wasPending: ReadonlyArray<{ amount: number; at: number }> = [],
): Array<BankRow> {
  const near = (r: BankRow) =>
    wasPending.some(
      (p) =>
        Math.abs(p.amount - r.amount) < 0.005 &&
        Math.abs(p.at - r.occurredAt) <= 3 * DAY_MS,
    )
  return list
    .flatMap((t) => bankRow(t, now) ?? [])
    .filter(
      (r) => r.pending || r.occurredAt > heldAt - 18 * 3_600_000 || near(r),
    )
    .sort((a, b) => b.occurredAt - a.occurredAt)
}

const DAY_MS = 86_400_000
/** How far back a pending payment is looked for once it is booked. */
export const PENDING_LOOKBACK_MS = 14 * DAY_MS

/** The day to ask the bank from: the balance held's, or the first pending
    payment an earlier reading had, if older. */
export function askFrom(
  heldAt: number,
  wasPending: ReadonlyArray<{ at: number }>,
): string {
  return dateFrom(Math.min(heldAt, ...wasPending.map((p) => p.at)))
}
