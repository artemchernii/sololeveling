/* Who a payment went to, as a key that stays the same month to month
   (Flow, 3 Oct). The display name drifts — his statements say "Vodafone",
   "PAG. 919703708 - VODAFONE" and "Vodafone Portugal" — so bills are
   matched on the line the bank printed, cleaned of what changes each time:
   reference numbers, dates, the bank's own words for how it paid. */

/** How the bank says it paid, not who it paid. */
const NOISE = new Set([
  'DD',
  'PAG',
  'PAGSERV',
  'TRF',
  'CR',
  'DB',
  'SEPA',
  'COMPRA',
  'DE',
  'DO',
  'DA',
  'DOS',
  'DAS',
])
/* Revolut prints "<merchant> To: <merchant>, <city> Card: …" or
   "<merchant> Revolut Rate €1.00 = $1.15": what follows is not the payee. */
const STOP = new Set(['TO', 'CARD', 'RATE', 'REVOLUT'])

/** A row's name as words: upper case, accents gone, words with a digit
    dropped (references change every month), bank words dropped, repeats
    dropped, the first `max` of them. */
export function payeeWords(line: string, max: number): Array<string> {
  const words = line
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 1 && !/\d/.test(w))
  const out: Array<string> = []
  for (const w of words) {
    if (STOP.has(w) && out.length > 0) break
    if (NOISE.has(w) || STOP.has(w) || out.includes(w)) continue
    out.push(w)
    if (out.length === max) break
  }
  return out
}

/**
 * The payee key of a money row: its first three words (`payeeWords`). ''
 * when nothing is left.
 */
export function payeeKey(line: string): string {
  return payeeWords(line, 3).join(' ')
}

/**
 * The payee of a row. PayPal is a middleman — one PayPal debit is Preply,
 * the next a jacket — so a PayPal row is keyed by the mandate code on it
 * (the long reference with letters and digits), not by "PayPal".
 */
export function payeeIdOf(line: string): string {
  const base = payeeKey(line)
  if (!/\bPAYPAL\b/i.test(line)) return base
  const mandate = line
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .find((w) => w.length >= 10 && /\d/.test(w) && /[A-Z]/.test(w))
  return mandate ? `PAYPAL ${mandate}` : base
}

/** A row's key: from what the bank printed, else its name. A PayPal
    row is keyed by its mandate (4 Oct), so Preply through PayPal is one
    payee a bill can be found on. */
export function rowKey(row: {
  text?: string
  meta?: { raw?: string; merchant?: string; payee?: string }
}): string {
  /* A PayPal payment he named on its own ("Preply - Portuguese") is that
     payee, so a bill made from it is paid by the next one he names so. */
  if (row.meta?.payee) return `NAMED ${payeeKey(row.meta.payee)}`
  return payeeIdOf(row.meta?.raw ?? row.meta?.merchant ?? row.text ?? '')
}

/** Two payee keys of one payee: the same, or the same first two words
 * (29 Oct: the EDP bill keyed "EDP COMERCIAL COMERCIALIZACAO" from
 * August's statement, BPI's new line "EDP COMERCIAL-COMERCIAL.ENERGIA
 * S.A" keys "EDP COMERCIAL ENERGIA", and the bill stayed not seen). One
 * word is not enough: "UBER" is not "UBER EATS". */
export function sameKey(a: string, b: string): boolean {
  if (a === '' || b === '') return false
  if (a === b) return true
  const two = (k: string) => k.split(' ').slice(0, 2)
  return two(a).length === 2 && two(a).join(' ') === two(b).join(' ')
}
