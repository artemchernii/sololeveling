/* + BILL's one line (Flow, 3 Oct): a bill not paid yet, typed as he would
   say it — "Holmes Place 49 monthly 1", "Allianz 218.40 yearly 22 Sep".
   The first number is the amount, the next one up to 31 the day, a month
   word makes it yearly unless he says monthly. Read as he types; what is
   missing is said, not guessed. */

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

export type BillLine = {
  name: string
  amount: number | null
  cadence: 'monthly' | 'yearly'
  day: number | null
  /** 0–11, yearly only. */
  month: number | null
}

const NUMBER = /^\d+([.,]\d{1,2})?$/
const FREQ = /^(monthly|month|yearly|year|annual|annually)$/i
const FILLER = /^(on|every|the|a|€|eur|euros?)$/i

function monthWord(w: string): number | null {
  if (!/^[a-z]{3,}$/i.test(w)) return null
  const i = MONTHS.indexOf(w.slice(0, 3).toLowerCase())
  return i === -1 ? null : i
}

export function readBillLine(text: string): BillLine {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const numbers: Array<number> = []
  let month: number | null = null
  let freq: string | null = null
  const name: Array<string> = []
  for (const w of words) {
    const clean = w.replace(/^€/, '')
    if (NUMBER.test(clean)) {
      numbers.push(Number(clean.replace(',', '.')))
    } else if (FREQ.test(w)) {
      freq = w.toLowerCase()
    } else if (name.length > 0 && monthWord(w) !== null && month === null) {
      month = monthWord(w)
    } else if (!FILLER.test(w)) {
      name.push(w)
    }
  }
  const yearly = freq ? /year|annual/.test(freq) : month !== null
  const [first, second] = [numbers.at(0), numbers.at(1)]
  const day =
    second !== undefined &&
    Number.isInteger(second) &&
    second >= 1 &&
    second <= 31
      ? second
      : null
  return {
    name: name.join(' '),
    amount: first !== undefined && first > 0 ? first : null,
    cadence: yearly ? 'yearly' : 'monthly',
    day,
    month: yearly ? month : null,
  }
}

/** What the line still needs, in words; empty when it can be added. */
export function missingFrom(b: BillLine): Array<string> {
  const out = []
  if (!b.name) out.push('a name')
  if (b.amount === null) out.push('the amount')
  if (b.day === null) out.push('the day')
  if (b.cadence === 'yearly' && b.month === null) out.push('the month')
  return out
}
