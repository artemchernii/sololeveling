import type { Doc, Id } from '../../convex/_generated/dataModel'

/* PLAN.md §3: under three seconds, no form.

     gym · run 30 · boxing 60          body — minutes only if you give them
     pt · portuguese · pt homework 20  a Portuguese class is 50 min unless said
     work 90 · office                  a working session, filed under career
     sololeveling 90 · oreum 45        time on a project — one verb per project
     event dinner · date Ana · meeting social — something you went to
     style 80 jacket                   a piece bought or altered
     weight 75.4                       a weigh-in
     spend 48 groceries · invest 500   money out, and into savings
     earn 3000 · salary 3000           money in
     note · plan                       a note, written in the sheet
     todo buy a lamp                   a task, to the backlog

   The number can sit anywhere after the verb — `pt homework 20` and
   `pt 20 homework` are the same line — because the order you think of them in
   is not a rule worth enforcing.

   Most verbs write a `logs` row. Three do not: `note` and `plan` hand over to
   the note sheet, and `todo` creates a task — a note is written down and a
   task is intent, and neither is something that happened. The parser never
   guesses a kind it was not given a verb for: an unrecognised line is refused,
   and offered as a note you choose, not filed as one. */

export type Area = NonNullable<Doc<'tasks'>['area']>
export type LogKind = Doc<'logs'>['kind']

export type ParsedLog = {
  kind: LogKind
  area: Area
  value?: number
  unit?: string
  text?: string
  projectId?: Id<'projects'>
}

/** What Enter does with a line: log it, write it as a note, or add a task. */
export type VerbAction = 'log' | 'note' | 'task'

/* Whether the number is required, optional, or not read at all. */
type Amount = 'required' | 'optional' | 'none'

/** What the capture modal needs to know about a recognised verb, whether or
    not the rest of the line is complete yet. */
export type VerbInfo = {
  /** The word to write back into the line — the verb's first spelling. */
  word: string
  kind: LogKind
  area: Area
  unit?: string
  amount: Amount
  action: VerbAction
  /** Which icon the modal draws for it. Names, not components, so this file
      stays free of React. */
  icon: VerbIcon
  projectId?: Id<'projects'>
}

export type VerbIcon =
  | 'dumbbell'
  | 'footprints'
  | 'swords'
  | 'languages'
  | 'scale'
  | 'receipt'
  | 'trending-up'
  | 'wallet'
  | 'briefcase'
  | 'building'
  | 'folder'
  | 'party'
  | 'heart'
  | 'users'
  | 'shirt'
  | 'sticky-note'
  | 'list-todo'

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

export type Verb = {
  /** Every spelling that means this verb. The first is the one written back. */
  words: Array<string>
  kind: LogKind
  area: Area
  unit?: string
  amount: Amount
  action?: VerbAction
  icon: VerbIcon
  /* Filled in when the line leaves them out. Shown, and editable, before
     anything is written — see `defaulted` above. */
  defaultValue?: number
  defaultText?: string
  /* The word itself is part of what happened: `boxing` and `run` are both a
     workout, and the row should still say which. Kept at the front of the
     text — `boxing sparring` — so a past log can be turned back into the line
     that wrote it. */
  keepsWord?: boolean
  projectId?: Id<'projects'>
  /** The confirmation line under the chips: a sentence about what happened. */
  describe: (log: ParsedLog) => string
  /** How to type it. Lives beside the rule that has to accept it, so the hint
      in the palette and the parser cannot drift apart. */
  example: string
  /** What that line records, in the palette's example list and the / list. */
  hint: string
  /** What someone who has forgotten the verb might type instead. The `/`
      list matches these, because typing `/pt` is no help to a person who
      does not remember `pt` — `/portuguese` or `/class` is what they reach
      for. */
  keywords: Array<string>
}

/* The summary under the chips reads as a sentence about what happened —
   "Spent €23", not "€23" — so a line with no words after the number still
   says something. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function joined(...parts: Array<string | number | undefined | null>): string {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== '')
    .join(' · ')
}

const minutes = (l: ParsedLog) =>
  l.value !== undefined ? `${l.value} min` : undefined

const VERBS: Array<Verb> = [
  /* — Body. The count of sessions is what the dashboard reads — monthCounts()
       adds one per row and never looks at minutes — so minutes are optional. */
  {
    words: ['gym', 'workout'],
    kind: 'workout',
    area: 'body',
    unit: 'min',
    amount: 'optional',
    icon: 'dumbbell',
    describe: (l) => joined('Gym session', minutes(l), l.text),
    example: 'gym',
    hint: 'a gym session — minutes if you want them',
    keywords: ['training', 'exercise', 'lift', 'weights', 'fitness'],
  },
  {
    words: ['run'],
    kind: 'workout',
    area: 'body',
    unit: 'min',
    amount: 'optional',
    icon: 'footprints',
    keepsWord: true,
    describe: (l) => joined(capitalise(l.text ?? 'run'), minutes(l)),
    example: 'run 30',
    hint: 'a run — counts as a workout',
    keywords: ['running', 'jog', 'cardio', 'training', 'exercise'],
  },
  {
    words: ['boxing'],
    kind: 'workout',
    area: 'body',
    unit: 'min',
    amount: 'optional',
    icon: 'swords',
    keepsWord: true,
    describe: (l) => joined(capitalise(l.text ?? 'boxing'), minutes(l)),
    example: 'boxing 60',
    hint: 'boxing — counts as a workout',
    keywords: ['box', 'sparring', 'fight', 'training', 'exercise'],
  },
  {
    words: ['weight'],
    kind: 'weight',
    area: 'body',
    unit: 'kg',
    amount: 'required',
    icon: 'scale',
    describe: (l) => `Weighed ${l.value} kg`,
    example: 'weight 75.4',
    hint: 'a weigh-in, in kg',
    keywords: ['weigh', 'kg', 'scale', 'kilos'],
  },

  /* — Portuguese. A class is 50 minutes, so a bare `pt` means one. The 50 is
       shown and editable before Enter rather than written silently: a default
       nobody saw would become "hours of Portuguese" in a month, and half of
       them would be guesses. No area in the sentence: the chip says where it
       is filed, and it can be changed. */
  {
    words: ['pt', 'portuguese'],
    kind: 'session',
    area: 'portuguese',
    unit: 'min',
    amount: 'optional',
    icon: 'languages',
    defaultValue: 50,
    defaultText: 'class',
    describe: (l) => joined(capitalise(l.text ?? 'session'), minutes(l)),
    example: 'pt',
    hint: 'a class, 50 min — or pt homework 20',
    keywords: ['class', 'lesson', 'homework', 'language', 'study', 'português'],
  },

  /* — Work. Filed under career, and a session like pt — which is why the
       Portuguese tile now counts sessions filed under Portuguese, not every
       session (aggregate.ts). */
  {
    words: ['work'],
    kind: 'session',
    area: 'career',
    unit: 'min',
    amount: 'optional',
    icon: 'briefcase',
    describe: (l) => joined('Work', minutes(l), l.text),
    example: 'work 90',
    hint: 'a working session, filed under career',
    keywords: ['job', 'career', 'deep work', 'focus'],
  },
  {
    words: ['office'],
    kind: 'session',
    area: 'career',
    unit: 'min',
    amount: 'optional',
    icon: 'building',
    keepsWord: true,
    describe: (l) => joined(capitalise(l.text ?? 'office'), minutes(l)),
    example: 'office',
    hint: 'a day or a session at the office',
    keywords: ['job', 'career', 'commute', 'onsite'],
  },

  /* — Social. The Social tile counts events attended, and until these nothing
       could write one. */
  {
    words: ['event', 'social'],
    kind: 'event',
    area: 'social',
    amount: 'none',
    icon: 'party',
    describe: (l) => capitalise(l.text ?? ''),
    example: 'event dinner with Ana',
    hint: 'something you went to — counts on the Social tile',
    keywords: ['party', 'dinner', 'friends', 'going out', 'concert'],
  },
  {
    words: ['date'],
    kind: 'event',
    area: 'social',
    amount: 'none',
    icon: 'heart',
    keepsWord: true,
    describe: (l) => capitalise(l.text ?? 'date'),
    example: 'date Ana',
    hint: 'a date — counts as a social event',
    keywords: ['romance', 'dating', 'dinner'],
  },
  {
    words: ['meeting'],
    kind: 'event',
    area: 'social',
    amount: 'none',
    icon: 'users',
    keepsWord: true,
    describe: (l) => capitalise(l.text ?? 'meeting'),
    example: 'meeting founders',
    hint: 'a meeting with people — a social event',
    keywords: ['meetup', 'network', 'people', 'coffee'],
  },

  /* — Style. The Style tile counts pieces bought or altered. */
  {
    words: ['style'],
    kind: 'piece',
    area: 'style',
    unit: 'eur',
    amount: 'optional',
    icon: 'shirt',
    describe: (l) =>
      joined(
        'Piece',
        l.text,
        l.value !== undefined ? `€${l.value}` : undefined,
      ),
    example: 'style 80 jacket',
    hint: 'a piece bought or altered — price if you want it',
    keywords: ['clothes', 'wardrobe', 'outfit', 'tailor', 'shoes', 'piece'],
  },

  /* — Money. */
  {
    words: ['spend'],
    kind: 'expense',
    area: 'money',
    unit: 'eur',
    amount: 'required',
    icon: 'receipt',
    describe: (l) => `Spent €${l.value}${l.text ? ` on ${l.text}` : ''}`,
    example: 'spend 48 groceries',
    hint: 'euros out, and what on',
    keywords: ['expense', 'buy', 'bought', 'paid', 'cost', 'purchase'],
  },
  {
    words: ['invest'],
    kind: 'transfer',
    area: 'money',
    unit: 'eur',
    amount: 'required',
    icon: 'trending-up',
    describe: (l) => `Invested €${l.value}${l.text ? ` in ${l.text}` : ''}`,
    example: 'invest 500',
    hint: 'euros into savings or investments',
    keywords: [
      'stock',
      'shares',
      'savings',
      'transfer',
      'etf',
      'crypto',
      'save',
    ],
  },
  {
    words: ['earn'],
    kind: 'income',
    area: 'money',
    unit: 'eur',
    amount: 'required',
    icon: 'wallet',
    describe: (l) => `Earned €${l.value}${l.text ? ` · ${l.text}` : ''}`,
    example: 'earn 1200 freelance',
    hint: 'euros in',
    keywords: ['income', 'paid', 'revenue', 'freelance', 'money in'],
  },
  {
    words: ['salary'],
    kind: 'income',
    area: 'money',
    unit: 'eur',
    amount: 'required',
    icon: 'wallet',
    keepsWord: true,
    describe: (l) => `Earned €${l.value} · ${l.text ?? 'salary'}`,
    example: 'salary 3000',
    hint: 'your salary — money in',
    keywords: ['income', 'paycheck', 'wage', 'pay'],
  },

  /* — Writing things down. Not logs. */
  {
    words: ['note', 'plan'],
    kind: 'note',
    area: 'knowledge',
    amount: 'none',
    action: 'note',
    icon: 'sticky-note',
    describe: (l) => l.text ?? '',
    example: 'note',
    hint: 'a note or a plan — its first line is the title',
    keywords: ['thought', 'idea', 'remember', 'write', 'notes', 'planning'],
  },
  {
    /* A task is intent, not evidence, so it goes to the tasks table and waits
       on the backlog — the only place unpicked tasks live (§3c). Its kind is
       a placeholder the modal never writes as a log. `task` is the same verb
       (17 Sep): it is the word people reach for. */
    words: ['todo', 'task'],
    kind: 'custom',
    area: 'life',
    amount: 'none',
    action: 'task',
    icon: 'list-todo',
    describe: (l) => `To the backlog: ${l.text ?? ''}`,
    example: 'todo buy a desk lamp',
    hint: 'a task, added to the backlog',
    keywords: ['task', 'backlog', 'do', 'reminder', 'later'],
  },
]

/**
 * One verb per live project, from its title — `sololeveling 90`, `oreum 45`.
 * Generated, never listed here: a project is created in the app, and a verb
 * for a project that does not exist would be a fixture. A title that would
 * shadow a built-in verb is skipped, since `work` must keep meaning work.
 */
export function projectVerbs(
  projects: Array<{ _id: Id<'projects'>; title: string }>,
): Array<Verb> {
  const taken = new Set(VERBS.flatMap((verb) => verb.words))
  const out: Array<Verb> = []
  for (const project of projects) {
    const word = project.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    if (word.length < 2 || taken.has(word)) continue
    taken.add(word)
    out.push({
      words: [word],
      kind: 'session',
      area: 'business',
      unit: 'min',
      amount: 'optional',
      icon: 'folder',
      projectId: project._id,
      describe: (l) => joined(project.title, minutes(l), l.text),
      example: `${word} 90`,
      hint: `time on ${project.title}`,
      keywords: [
        'project',
        'build',
        'ship',
        ...project.title.toLowerCase().split(/\s+/),
      ],
    })
  }
  return out
}

function all(extra: Array<Verb>): Array<Verb> {
  return extra.length === 0 ? VERBS : [...VERBS, ...extra]
}

function byWord(extra: Array<Verb>): Map<string, Verb> {
  return new Map(
    all(extra).flatMap((verb) =>
      verb.words.map((word) => [word, verb] as const),
    ),
  )
}

/** Every built-in spelling, in the order they are listed. */
export const CAPTURE_VERBS = VERBS.flatMap((verb) => verb.words)

/** One row per verb, in the order they are listed — the palette's example
    list, shown until there is a history of your own to show instead. */
export const CAPTURE_HINTS = VERBS.map((verb) => ({
  example: verb.example,
  hint: verb.hint,
  area: verb.area,
  icon: verb.icon,
}))

function info(verb: Verb): VerbInfo {
  return {
    word: verb.words[0],
    kind: verb.kind,
    area: verb.area,
    unit: verb.unit,
    amount: verb.amount,
    action: verb.action ?? 'log',
    icon: verb.icon,
    projectId: verb.projectId,
  }
}

/** A spelling's verb, for tinting a suggestion before it is typed. */
export function verbFor(
  word: string,
  extra: Array<Verb> = [],
): VerbInfo | undefined {
  const verb = byWord(extra).get(word.toLowerCase())
  return verb ? info(verb) : undefined
}

export type VerbChoice = {
  word: string
  area: Area
  hint: string
  icon: VerbIcon
}

function choice(verb: Verb): VerbChoice {
  return {
    word: verb.words[0],
    area: verb.area,
    hint: verb.hint,
    icon: verb.icon,
  }
}

/** The verbs as the modal offers them when a word is not one: one chip per
    verb, in its first spelling, tinted by the area it files under. */
export const CAPTURE_CHOICES = VERBS.map(choice)

/**
 * The verbs that fit what you typed, by name or by meaning — for the `/` list
 * and for "that isn't a verb". An empty query is every verb, in listed order.
 *
 * Ordered by how the match was made, not by a score: a verb whose own name
 * starts with the query, then one whose area or keyword does, then one whose
 * hint merely contains it. Three tiers is a sort order anyone can predict;
 * a weighted relevance number is not, and it would be a number with no
 * sanctioned source.
 */
export function searchVerbs(
  query: string,
  extra: Array<Verb> = [],
): Array<VerbChoice> {
  const q = query.trim().toLowerCase()
  const tier = (verb: Verb): number => {
    if (q.length === 0) return 0
    if (verb.words.some((w) => w.startsWith(q))) return 0
    if (verb.area.startsWith(q) || verb.keywords.some((k) => k.startsWith(q))) {
      return 1
    }
    if (verb.hint.toLowerCase().includes(q)) return 2
    return -1
  }
  return all(extra)
    .map((verb, index) => ({ verb, index, rank: tier(verb) }))
    .filter(({ rank }) => rank !== -1)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ verb }) => choice(verb))
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

export function parseCapture(
  input: string,
  extra: Array<Verb> = [],
): ParseResult {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: 'Type something to log.' }
  }

  const [word, ...rest] = trimmed.split(/\s+/)
  const verb = byWord(extra).get(word.toLowerCase())

  if (!verb) {
    return { ok: false, message: `"${word}" isn't a verb.` }
  }

  /* The word stays at the front of the text for verbs where it is part of
     what happened — `boxing`, `date` — and is the whole text when nothing
     else was typed. */
  const withWord = (text: string | undefined): string | undefined =>
    verb.keepsWord ? [verb.words[0], text].filter(Boolean).join(' ') : text

  if (verb.amount === 'none') {
    const text = rest.join(' ')
    const typed = { text: text.length > 0 ? text : undefined }
    const written = withWord(typed.text)
    if (written === undefined || written.length === 0) {
      /* The note sheet is where a note is written, so a bare `note` is not
         incomplete — it is the start of one. */
      return {
        ok: false,
        message:
          verb.action === 'note'
            ? 'Write the note below.'
            : `${verb.words[0]} needs something after it.`,
        verb: info(verb),
        typed,
      }
    }
    const log: ParsedLog = {
      kind: verb.kind,
      area: verb.area,
      text: written,
      projectId: verb.projectId,
    }
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
  const text = withWord(typedText ?? verb.defaultText)
  const log: ParsedLog = {
    kind: verb.kind,
    area: verb.area,
    value,
    unit: verb.unit,
    text,
    projectId: verb.projectId,
  }
  return {
    ok: true,
    log,
    verb: info(verb),
    summary: verb.describe(log),
    defaulted: {
      value: typedValue === undefined && value !== undefined,
      text: typedText === undefined && verb.defaultText !== undefined,
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
  extra: Array<Verb> = [],
): Array<string> {
  if (input.length === 0 || /\s/.test(input)) {
    return []
  }
  const prefix = input.toLowerCase()
  const words = all(extra).flatMap((verb) => verb.words)
  const matches = words.filter(
    (word) => word.startsWith(prefix) && word !== prefix,
  )
  const rank = (word: string) => {
    const i = recent.indexOf(word)
    return i === -1 ? recent.length + words.indexOf(word) : i
  }
  return matches.sort((a, b) => rank(a) - rank(b))
}

/**
 * A past log as a line you can log again, or null when no verb can say it —
 * a task_done, or a kind only written elsewhere. A pt class that was the
 * default goes back as plain `pt`, not `pt 50 class`; a boxing session goes
 * back as `boxing`, because its text starts with the word; time on a project
 * goes back as that project's verb.
 */
export function lineFromLog(
  log: {
    kind: LogKind
    area: Area
    value?: number
    text?: string
    projectId?: Id<'projects'>
  },
  extra: Array<Verb> = [],
): string | null {
  const verbs = all(extra).filter(
    (verb) => verb.kind === log.kind && (verb.action ?? 'log') === 'log',
  )
  const firstWord = log.text?.split(/\s+/)[0]
  const verb =
    (log.projectId
      ? verbs.find((candidate) => candidate.projectId === log.projectId)
      : undefined) ??
    verbs.find(
      (candidate) => candidate.keepsWord && candidate.words[0] === firstWord,
    ) ??
    verbs.find(
      (candidate) =>
        !candidate.keepsWord &&
        candidate.projectId === undefined &&
        candidate.area === log.area,
    ) ??
    verbs.find(
      (candidate) => !candidate.keepsWord && candidate.projectId === undefined,
    )
  if (!verb) {
    return null
  }
  const value = log.value === verb.defaultValue ? undefined : log.value
  let text = log.text === verb.defaultText ? undefined : log.text
  if (verb.keepsWord && text !== undefined) {
    const stripped = text.slice(verb.words[0].length).trim()
    text = stripped.length > 0 ? stripped : undefined
  }
  return formatLine({ word: verb.words[0], value, text })
}
