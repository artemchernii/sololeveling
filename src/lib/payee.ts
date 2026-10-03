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

/**
 * The payee key of a money row: upper case, accents gone, words with a
 * digit dropped (references change every month), bank words dropped,
 * repeats dropped, the first three words. '' when nothing is left.
 */
export function payeeKey(line: string): string {
  const words = line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 1 && !/\d/.test(w))
  const out: Array<string> = []
  for (const w of words) {
    if (STOP.has(w) && out.length > 0) break
    if (NOISE.has(w) || STOP.has(w) || out.includes(w)) continue
    out.push(w)
    if (out.length === 3) break
  }
  return out.join(' ')
}

/** A row's key: from what the bank printed, else its name. */
export function rowKey(row: {
  text?: string
  meta?: { raw?: string; merchant?: string }
}): string {
  return payeeKey(row.meta?.raw ?? row.meta?.merchant ?? row.text ?? '')
}
