import { tailsIn } from './institutions'
import { matchAccount } from './intake'

/**
 * Which of his accounts is the other side of a transfer row, and which
 * endings on it belong to that other side.
 *
 * 11 Oct: ActivoBank's "COMPRA 2789 TRADE REPUBLIC BERLIN DE" (−505.20)
 * was paired to Revolut. 2789 is ActivoBank's own card — the card that
 * paid — and Revolut had learned it from "COMPRA 2789 REVOLUT 8134 …",
 * where every ending on the line was kept as Revolut's. The ending was
 * matched before the name, so TRADE REPUBLIC was never looked at.
 */

/* "COMPRA 2789 …", "CARD 2789 …": the card that paid, printed right after
   the word for a card purchase. */
const PAID_WITH =
  /\b(?:compras?|pagamento|pag|card|cartao|cartão)\s+(?:n[º.o]?\s*)?\*?(\d{4})\b/giu

/** The endings of the card that paid a row — the paying account's. */
export function payingCardTails(text: string): Array<string> {
  return [...new Set([...text.matchAll(PAID_WITH)].map((m) => m[1]))]
}

/** The endings a row prints for the other side: every ending on the line
    but the paying card's. */
export function otherTails(text: string): Array<string> {
  const paid = new Set(payingCardTails(text))
  return tailsIn(text).filter((t) => !paid.has(t))
}

type Candidate = {
  id: string
  name: string
  domain?: string
  tails: ReadonlyArray<string>
}

/**
 * The other side of a self row: the institution the line names first
 * ("TRADE REPUBLIC", "REVOLUT"), then an ending of the other side that
 * exactly one account has. Never the paying card's ending, never one of
 * this account's own. Null when it is not certain — he picks, once.
 */
export function pickOtherSide(
  row: { counterparty?: string; merchant: string; raw: string },
  others: ReadonlyArray<Candidate>,
  here?: { id: string; tails: ReadonlyArray<string> },
): string | null {
  const named =
    matchAccount(row.counterparty ?? row.merchant, others, here?.id) ??
    matchAccount(row.raw, others)
  if (named !== null) return named
  const mine = new Set(here?.tails ?? [])
  const tails = otherTails(`${row.counterparty ?? ''} ${row.raw}`).filter(
    (t) => !mine.has(t),
  )
  const hits = new Set(
    others
      .filter((a) => a.tails.some((t) => tails.includes(t)))
      .map((a) => a.id),
  )
  return hits.size === 1 ? [...hits][0] : null
}

/**
 * Whether the ending a reader gave for a statement is the statement's own.
 * Revolut's "Top-up by *2789 / From: *2789" prints the card that sent the
 * money: an ending printed on an incoming row is the sender's, not this
 * account's.
 */
export function ownTail(
  tail: string | undefined,
  rows: ReadonlyArray<{ amount: number; raw: string; merchant: string }>,
): string | undefined {
  if (tail === undefined) return undefined
  const sent = rows.some(
    (r) => r.amount > 0 && tailsIn(`${r.merchant} ${r.raw}`).includes(tail),
  )
  return sent ? undefined : tail
}
