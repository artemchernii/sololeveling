import type { Doc } from '../../convex/_generated/dataModel'

/* PLAN.md §3: under three seconds, no form.

     gym                   a session at the gym — minutes only if you give them
     gym 60 push day       …with minutes and a note
     pt                    a Portuguese class: 50 min unless you say otherwise
     pt homework 20        homework, 20 min
     weight 75.4           a weigh-in
     spend 48 groceries    €48 on groceries
     invest 500            €500 moved into savings or investments
     note …                a thought, filed under 'life' until the badge says otherwise

   The number can sit anywhere after the verb — `pt homework 20` and
   `pt 20 homework` are the same line — because the order you think of them in
   is not a rule worth enforcing.

   Everything the parser produces is a `logs` row. It never guesses a kind it
   was not given a verb for: an unrecognised line is refused, and offered as a
   note you choose, not filed as one. */

export type Area = NonNullable<Doc<'tasks'>['area']>
export type LogKind = Doc<'logs'>['kind']

export type ParsedLog = {
  kind: LogKind
  area: Area
  value?: number
  unit?: string
  text?: string
}

/** What the capture modal needs to know about a recognised verb, whether or
    not the rest of the line is complete yet. */
export type VerbInfo = {
  /** The word to write back into the line — the verb's first spelling. */
  word: string
  kind: LogKind
  area: Area
  unit?: string
  amount: Amount
}

export type ParseResult =
  | {
      ok: true
      log: ParsedLog
      verb: VerbInfo
      summary: string
      /* Which parts were filled in rather than typed. They are real values
         you can see and edit before Enter — but the modal shows them as
         defaults, so nothing lands in the database looking typed when it
         was not. */
      defaulted: { value: boolean; text: boolean }
      /** The words you actually typed, without defaults — what a chip edit
          writes back alongside the part it changed. */
      typed: { value?: number; text?: string }
    }
  | {
      ok: false
      message: string
      /** Present when the verb was recognised and something after it is
          missing, so the modal can still show what it is about to become. */
      verb?: VerbInfo
      typed?: { value?: number; text?: string }
    }

/* Whether the number is required, optional, or not read at all. */
type Amount = 'required' | 'optional' | 'none'

type Verb = {
  /** Every spelling that means this verb. The first is the one written back. */
  words: Array<string>
  kind: LogKind
  area: Area
  unit?: string
  amount: Amount
  /* Filled in when the line leaves them out. Shown, and editable, before
     anything is written — see `defaulted` above. */
  defaultValue?: number
  defaultText?: string
  /** What the value means, for the confirmation line. */
  describe: (log: ParsedLog) => string
  /** How to type it. Lives beside the rule that has to accept it, so the hint
      in the palette and the parser cannot drift apart. */
  example: string
  /** What that line records, in the palette's example list. Here for the same
      reason as `example`, and because a unit is otherwise invisible until
      after you have typed the number. */
  hint: string
}

const VERBS: Array<Verb> = [
  {
    /* Gym first: it is the word actually used. Duration is optional because
       the count of sessions is what the dashboard reads — monthCounts() adds
       one per row and never looks at minutes. */
    words: ['gym', 'workout'],
    kind: 'workout',
    area: 'body',
    unit: 'min',
    amount: 'optional',
    describe: (l) =>
      l.value !== undefined ? `${l.value} min of training` : 'a gym session',
    example: 'gym',
    hint: 'a session — minutes if you want them',
  },
  {
    /* A class is 50 minutes, so a bare `pt` means one. The 50 is shown and
       editable before Enter rather than written silently: a default nobody
       saw would become "hours of Portuguese" in a month, and half of them
       would be guesses. */
    words: ['pt'],
    kind: 'session',
    area: 'portuguese',
    unit: 'min',
    amount: 'optional',
    defaultValue: 50,
    defaultText: 'class',
    describe: (l) =>
      `${l.value} min of Portuguese${l.text ? ` · ${l.text}` : ''}`,
    example: 'pt',
    hint: 'a class, 50 min — or pt homework 20',
  },
  {
    words: ['weight'],
    kind: 'weight',
    area: 'body',
    unit: 'kg',
    amount: 'required',
    describe: (l) => `${l.value} kg`,
    example: 'weight 75.4',
    hint: 'a weigh-in, in kg',
  },
  {
    words: ['spend'],
    kind: 'expense',
    area: 'money',
    unit: 'eur',
    amount: 'required',
    describe: (l) => `€${l.value}${l.text ? ` on ${l.text}` : ''}`,
    example: 'spend 48 groceries',
    hint: 'euros, and what on',
  },
  {
    words: ['invest'],
    kind: 'transfer',
    area: 'money',
    unit: 'eur',
    amount: 'required',
    describe: (l) => `€${l.value} invested${l.text ? ` · ${l.text}` : ''}`,
    example: 'invest 500',
    hint: 'euros into savings or investments',
  },
  {
    words: ['note'],
    kind: 'note',
    area: 'life',
    amount: 'none',
    describe: (l) => l.text ?? '',
    example: 'note call the landlord',
    hint: 'a thought, filed under life',
  },
]

const BY_WORD = new Map<string, Verb>(
  VERBS.flatMap((verb) => verb.words.map((word) => [word, verb] as const)),
)

/** Every spelling, in the order they are listed. */
export const CAPTURE_VERBS = VERBS.flatMap((verb) => verb.words)

/** One row per verb, in the order they are listed — the palette's example
    list, shown until there is a history of your own to show instead. */
export const CAPTURE_HINTS = VERBS.map((verb) => ({
  example: verb.example,
  hint: verb.hint,
}))

function info(verb: Verb): VerbInfo {
  return {
    word: verb.words[0],
    kind: verb.kind,
    area: verb.area,
    unit: verb.unit,
    amount: verb.amount,
  }
}

/* Accepts 75.4 and 75,4 — a comma decimal is what a European keyboard produces
   under the thumb, and rejecting it would cost a retype in the fastest path. */
export function toNumber(token: string): number | null {
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
  const verb = BY_WORD.get(word.toLowerCase())

  if (!verb) {
    return { ok: false, message: `"${word}" isn't a verb.` }
  }

  if (verb.amount === 'none') {
    const text = rest.join(' ')
    const typed = { text: text.length > 0 ? text : undefined }
    if (text.length === 0) {
      return {
        ok: false,
        message: `${verb.words[0]} needs something after it.`,
        verb: info(verb),
        typed,
      }
    }
    const log: ParsedLog = { kind: verb.kind, area: verb.area, text }
    return {
      ok: true,
      log,
      verb: info(verb),
      summary: verb.describe(log),
      defaulted: { value: false, text: false },
      typed,
    }
  }

  /* The first token that reads as a number is the amount, wherever it sits;
     every other word is the text. */
  const numberAt = rest.findIndex((token) => toNumber(token) !== null)
  const typedValue = numberAt === -1 ? undefined : toNumber(rest[numberAt])!
  const words = rest.filter((_, i) => i !== numberAt).join(' ')
  const typedText = words.length > 0 ? words : undefined
  const typed = { value: typedValue, text: typedText }

  if (typedValue === undefined && verb.amount === 'required') {
    return {
      ok: false,
      message: `${verb.words[0]} needs a number — like "${verb.example}".`,
      verb: info(verb),
      typed,
    }
  }

  const value = typedValue ?? verb.defaultValue
  const text = typedText ?? verb.defaultText
  const log: ParsedLog = {
    kind: verb.kind,
    area: verb.area,
    value,
    unit: verb.unit,
    text,
  }
  return {
    ok: true,
    log,
    verb: info(verb),
    summary: verb.describe(log),
    defaulted: {
      value: typedValue === undefined && value !== undefined,
      text: typedText === undefined && text !== undefined,
    },
    typed,
  }
}

/**
 * The line a verb, a number and some words make — how a chip edit writes back
 * into the line, and how a past log is turned into something you can re-log.
 * The line stays the one source of truth; the chips only ever rewrite it.
 */
export function formatLine(parts: {
  word: string
  value?: number
  text?: string
}): string {
  return [parts.word, parts.value, parts.text]
    .filter((part) => part !== undefined && part !== '')
    .join(' ')
}

/**
 * Verbs that start with what you have typed so far, for the grey completion
 * and the tappable suggestions. Only while the first word is still being
 * typed — once there is a space, the verb is settled one way or the other.
 *
 * `recent` are words you have used, most recent first, and they win: `w`
 * should become whatever you logged yesterday, not whatever sorts first.
 */
export function suggestVerbs(
  input: string,
  recent: Array<string> = [],
): Array<string> {
  if (input.length === 0 || /\s/.test(input)) {
    return []
  }
  const prefix = input.toLowerCase()
  const matches = CAPTURE_VERBS.filter(
    (word) => word.startsWith(prefix) && word !== prefix,
  )
  const rank = (word: string) => {
    const i = recent.indexOf(word)
    return i === -1 ? recent.length + CAPTURE_VERBS.indexOf(word) : i
  }
  return matches.sort((a, b) => rank(a) - rank(b))
}

/**
 * A past log as a line you can log again, or null when no verb can say it —
 * a task_done, or a kind only written elsewhere. A pt class that was the
 * default goes back as plain `pt`, not `pt 50 class`.
 */
export function lineFromLog(log: {
  kind: LogKind
  area: Area
  value?: number
  text?: string
}): string | null {
  const candidates = VERBS.filter((verb) => verb.kind === log.kind)
  const verb =
    candidates.find((candidate) => candidate.area === log.area) ??
    candidates.at(0)
  if (!verb) {
    return null
  }
  const value = log.value === verb.defaultValue ? undefined : log.value
  const text = log.text === verb.defaultText ? undefined : log.text
  return formatLine({ word: verb.words[0], value, text })
}
