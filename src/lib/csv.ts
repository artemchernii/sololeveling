/* A CSV as a bank or broker exports it (Treasury, 27 Sep): read in code,
   not by the model. His Revolut trading history is 4,008 rows; asking a
   model to copy them out cost 23 cents, took five minutes and failed.
   Quoted fields, doubled quotes, CRLF, and a `;` delimiter (European
   exports) are handled; a BOM is dropped. */

export function parseCsv(text: string): Array<Array<string>> {
  const src = text.replace(/^\uFEFF/, '')
  const delimiter = sniffDelimiter(src)
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows.map((r) => r.map((f) => f.trim()))
}

/* The first line decides: whichever of , ; tab it has more of, outside
   quotes. */
function sniffDelimiter(src: string): string {
  const nl = src.search(/\r?\n/)
  const line = nl === -1 ? src : src.slice(0, nl)
  const count = (d: string) => {
    let n = 0
    let q = false
    for (const c of line) {
      if (c === '"') q = !q
      else if (!q && c === d) n++
    }
    return n
  }
  const scores = [',', ';', '\t'].map((d) => [d, count(d)] as const)
  scores.sort((a, b) => b[1] - a[1])
  return scores[0][1] > 0 ? scores[0][0] : ','
}

/** The same export from the same bank has the same header: the key its
    column map is remembered by. */
export function headerKey(header: ReadonlyArray<string>): string {
  return header
    .map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim())
    .join('|')
    .slice(0, 400)
}

/**
 * A money cell as exports print it: "USD 21.45", "-€12,40", "1.234,56",
 * "(15.00)", "12.40 EUR". The currency comes back when the cell names it.
 */
export function parseMoney(
  cell: string,
  decimal: '.' | ',' = '.',
): { value: number; currency?: string } | null {
  let s = cell.trim()
  if (s === '') return null
  let currency: string | undefined
  const code = /\b([A-Z]{3})\b/.exec(s)
  if (code) {
    currency = code[1]
    s = s.replace(code[0], '')
  }
  const symbols: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP' }
  for (const [sym, cur] of Object.entries(symbols)) {
    if (s.includes(sym)) {
      currency ??= cur
      s = s.replace(sym, '')
    }
  }
  let negative = false
  if (/^\(.*\)$/.test(s.trim())) {
    negative = true
    s = s.trim().slice(1, -1)
  }
  s = s.replace(/[\s\u00A0']/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const value = Number(s) * (negative ? -1 : 1)
  return Number.isFinite(value) ? { value, currency } : null
}

export type DateOrder = 'ymd' | 'dmy' | 'mdy'

/** A date cell → local noon that day, the way a statement's day is kept. */
/** The time printed beside a date ("2026-10-01 13:20:45" → "13:20"), as
    printed — kept as words, not folded into the date: the server reads in
    UTC, and a 23:30 payment must not move to the next day (5 Oct). */
export function parseClock(cell: string): string | undefined {
  const m = /(?:^|[ T])(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?\s*$/.exec(
    cell.trim(),
  )
  if (!m || +m[1] > 23 || +m[2] > 59) return undefined
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

export function parseDay(cell: string, order: DateOrder): number | undefined {
  const s = cell.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(s)
  let y: number, m: number, d: number
  if (iso) {
    y = +iso[1]
    m = +iso[2]
    d = +iso[3]
  } else {
    const parts = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/.exec(s)
    if (!parts) return undefined
    const [a, b, c] = [+parts[1], +parts[2], +parts[3]]
    if (order === 'ymd') [y, m, d] = [a, b, c]
    else if (order === 'dmy') [d, m, y] = [a, b, c]
    else [m, d, y] = [a, b, c]
    if (y < 100) y += 2000
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const at = new Date(y, m - 1, d, 12)
  return at.getMonth() === m - 1 ? at.getTime() : undefined
}
