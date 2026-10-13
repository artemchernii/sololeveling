/* A bank's own line as a name to read (13 Oct, mockup row-names.html):
   "COMPRA 2789 EASYPAY LISBOA" → "Easypay Lisboa". Only what is drawn:
   the row keeps the bank's line, and groups, bills and the same-payment
   checks go on matching that. Pure. */

/** How the bank says it paid, not who it paid. */
const HOW = new Set([
  'COMPRA',
  'DD',
  'PAG',
  'PAGSERV',
  'SERV',
  'TRF',
  'TRANSF',
  'TRANSFERENCIA',
  'SEPA',
  'CR',
  'DB',
])
/* "P/" (para) and "P/O" (por ordem de) before a person's name. */
const TO_WHOM = /(^|\s)P\/O?(?=\s|$)/g
const SMALL = new Set(['DE', 'DO', 'DA', 'DOS', 'DAS', 'E'])

/**
 * The line without the bank's own words, card digits and reference
 * numbers, in normal case. Null when there is nothing to do: the line is
 * already a name (it has a lower-case letter), or nothing is left of it —
 * "PAG SERV 21345 678901234" stays as the bank wrote it.
 */
export function plainName(line: string): string | null {
  if (/\p{Ll}/u.test(line)) return null
  const words = line
    .replace(TO_WHOM, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0 && !/\d/.test(w) && !HOW.has(w))
  if (words.length === 0) return null
  const name = words
    .map((w, i) =>
      i > 0 && SMALL.has(w) ? w.toLowerCase() : w[0] + w.slice(1).toLowerCase(),
    )
    .join(' ')
  return name === line ? null : name
}
