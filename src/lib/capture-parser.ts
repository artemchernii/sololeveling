import type { Doc } from '../../convex/_generated/dataModel'

/* PLAN.md §3: five verbs, under three seconds, no form.
 
     workout 60            60 minutes of training
     workout 60 push day   …with a note
     pt 30                 a Portuguese session
     weight 75.4           a weigh-in
     spend 48 groceries    €48 on groceries
     note …                a thought, filed under 'life' until the badge says otherwise
 
   Everything the parser produces is a `logs` row. It never guesses a kind it
   was not given a verb for: an unrecognised line is refused with a message,
   not silently filed as 'custom'. */

export type Area = NonNullable<Doc<'tasks'>['area']>
export type LogKind = Doc<'logs'>['kind']

export type ParsedLog = {
  kind: LogKind
  area: Area
  value?: number
  unit?: string
  text?: string
}

export type ParseResult =
  { ok: true; log: ParsedLog; summary: string } | { ok: false; message: string }

type Verb = {
  kind: LogKind
  area: Area
  unit?: string
  /* Whether the number is required, optional, or not read at all. */
  amount: 'required' | 'none'
  /** What the value means, for the confirmation line. */
  describe: (log: ParsedLog) => string
  /** How to type it. Lives beside the rule that has to accept it, so the hint
      in the palette and the parser cannot drift apart. */
  example: string
}

/* `| undefined` is the honest type: this is looked up with whatever the user
   typed, and most strings are not verbs. */
const VERBS: Record<string, Verb | undefined> = {
  workout: {
    kind: 'workout',
    area: 'body',
    unit: 'min',
    amount: 'required',
    describe: (l) => `${l.value} min of training`,
    example: 'workout 60',
  },
  pt: {
    kind: 'session',
    area: 'portuguese',
    unit: 'min',
    amount: 'required',
    describe: (l) => `${l.value} min of Portuguese`,
    example: 'pt 30',
  },
  weight: {
    kind: 'weight',
    area: 'body',
    unit: 'kg',
    amount: 'required',
    describe: (l) => `${l.value} kg`,
    example: 'weight 75.4',
  },
  spend: {
    kind: 'expense',
    area: 'money',
    unit: 'eur',
    amount: 'required',
    describe: (l) => `€${l.value}${l.text ? ` on ${l.text}` : ''}`,
    example: 'spend 48 groceries',
  },
  note: {
    kind: 'note',
    area: 'life',
    amount: 'none',
    describe: (l) => l.text ?? '',
    example: 'note call the landlord',
  },
}

export const CAPTURE_VERBS = Object.keys(VERBS)

/** One example per verb, in the order they are listed — the palette's hints. */
export const CAPTURE_EXAMPLES = Object.values(VERBS).map(
  (verb) => verb!.example,
)

/* Accepts 75.4 and 75,4 — a comma decimal is what a European keyboard produces
   under the thumb, and rejecting it would cost a retype in the fastest path. */
function toNumber(token: string): number | null {
  if (!/^\d+([.,]\d+)?$/.test(token)) {
    return null
  }
  const n = Number(token.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function parseCapture(input: string): ParseResult {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: 'Type something to log.' }
  }

  const [word, ...rest] = trimmed.split(/\s+/)
  const verb = VERBS[word.toLowerCase()]

  if (!verb) {
    return {
      ok: false,
      message: `"${word}" is not a verb. Try: ${CAPTURE_VERBS.join(', ')}.`,
    }
  }

  if (verb.amount === 'none') {
    const text = rest.join(' ')
    if (text.length === 0) {
      return { ok: false, message: `${word} needs something after it.` }
    }
    const log: ParsedLog = { kind: verb.kind, area: verb.area, text }
    return { ok: true, log, summary: verb.describe(log) }
  }

  const value = rest.length > 0 ? toNumber(rest[0]) : null
  if (value === null) {
    return { ok: false, message: `${word} needs a number — like "${word} 60".` }
  }

  const text = rest.slice(1).join(' ')
  const log: ParsedLog = {
    kind: verb.kind,
    area: verb.area,
    value,
    unit: verb.unit,
    text: text.length > 0 ? text : undefined,
  }
  return { ok: true, log, summary: verb.describe(log) }
}
