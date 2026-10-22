import { ROW_DAYS, periodDays } from './rowsAsk'
import type { AskGoal, Period, RowFact } from './rowsAsk'

/* R7 Ask AI: what the model is asked about his rows, the shape it
   answers in, and the check on what comes back. The model's words sit
   beside the app's counts; it names counts by key and the app prints
   them. A key never given is dropped, and a number in its words that no
   count carries is marked on screen. Nothing it says is stored. */

export const LINE_AREAS = [
  'projects',
  'body',
  'languages',
  'money',
  'tasks',
  'other',
  'nodata',
] as const
export type LineArea = (typeof LINE_AREAS)[number]

export const MAX_TILES = 4
export const MAX_LINES = 5
export const MAX_QUESTION = 400
export const MAX_HISTORY = 6

export type RowsLine = {
  area: LineArea
  text: string
  factKeys: Array<string>
  /** A number in the words that is in no count. */
  stray: boolean
}
export type RowsAnswer = {
  headline: string
  tiles: Array<string>
  lines: Array<RowsLine>
}
export type Said = { q: string; a: string }

const str = { type: 'string' }
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const ROWS_SCHEMA = object({
  headline: str,
  tiles: { type: 'array', items: str },
  lines: {
    type: 'array',
    items: object({
      area: { type: 'string', enum: [...LINE_AREAS] },
      text: str,
      factKeys: { type: 'array', items: str },
    }),
  },
})

export function rowsPrompt(args: {
  question: string
  period: Period
  facts: Array<RowFact>
  lines: Array<string>
  goals: Array<AskGoal>
  more: boolean
  today: string
  history: Array<Said>
}): string {
  const { period, facts } = args
  const long = periodDays(period) > ROW_DAYS
  const factList = facts.length
    ? facts
        .map(
          (f) =>
            `- ${f.key} | ${f.label} | ${f.value}${f.sub ? ` | ${f.sub}` : ''}`,
        )
        .join('\n')
    : '- (none: nothing is logged in this period)'
  const rows = long
    ? `The period is longer than ${ROW_DAYS} days, so only the counts are given.`
    : args.lines.length
      ? `The rows, one per line (day, kind, area, "text", value unit, [category], (project)):\n${args.lines.join('\n')}${args.more ? '\n(more rows exist; the list and the counts stop here)' : ''}`
      : 'There are no rows in this period.'
  const goals = args.goals.length
    ? `His goals (words only, not progress):\n${args.goals.map((g) => `- ${g.title}${g.area ? ` [${g.area}]` : ''}${g.target !== undefined ? ` target ${g.target}${g.unit ? ` ${g.unit}` : ''}` : ''} (${g.status})`).join('\n')}`
    : ''
  const said = args.history.length
    ? `Earlier in this thread:\n${args.history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join('\n')}\n`
    : ''
  return `You answer Artem's question about his own life from the rows his
personal app holds: what he logged (workouts, language sessions, money,
ticks, notes of what happened) and the commits of his projects. Talk to
him as "you". Today is ${args.today}. The period is ${period.title}
(${period.range}).

The facts below were counted by the app from those rows, each with a key
(key | label | value | sub). They are the only numbers you may write:
quote a value or a sub exactly as given. Never add, subtract, average,
compare as a percentage or estimate a number, and never count rows
yourself.

${factList}

${rows}

${goals}

${said}Answer with:
- headline: one short plain sentence that answers the question.
- tiles: up to ${MAX_TILES} fact keys, the counts that answer it best.
- lines: 1 to ${MAX_LINES}, each one or two short plain sentences on one
  area (projects, body, languages, money, tasks, other), with factKeys:
  the 1 to 3 keys it rests on. When the rows do not have what is asked,
  one line of area nodata that says what is not logged — never guess.
No advice, no praise, no scores, no grades, no "great job".

Question: ${args.question}`
}

const text = (x: unknown, max: number) =>
  typeof x === 'string' ? x.trim().slice(0, max) : ''

/** The numbers a fact carries, as plain digits: `€1,284.10` → 1284.10. */
function numbersIn(s: string): Array<string> {
  return [...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) =>
    m[0].replace(/,/g, ''),
  )
}

/** True when the words hold a number no fact carries. Days of a month
    (1–31) and years are allowed: "until the 16th", "in 2026". */
export function hasStray(words: string, facts: Array<RowFact>): boolean {
  const known = new Set(
    facts.flatMap((f) => numbersIn(`${f.label} ${f.value} ${f.sub ?? ''}`)),
  )
  return numbersIn(words).some((n) => {
    if (known.has(n)) return false
    const v = Number(n)
    if (
      Number.isInteger(v) &&
      ((v >= 1 && v <= 31) || (v >= 2000 && v <= 2100))
    )
      return false
    return true
  })
}

export function parseRows(
  raw: unknown,
  facts: Array<RowFact>,
): { ok: true; answer: RowsAnswer } | { ok: false; error: string } {
  let d: Record<string, unknown> | null
  try {
    d = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<
      string,
      unknown
    > | null
  } catch {
    return { ok: false, error: 'BROKEN SHAPE' }
  }
  if (d === null || typeof d !== 'object')
    return { ok: false, error: 'BROKEN SHAPE' }
  const known = new Set(facts.map((f) => f.key))
  const keys = (x: unknown, max: number) =>
    [
      ...new Set(
        (Array.isArray(x) ? x : []).filter(
          (k): k is string => typeof k === 'string' && known.has(k),
        ),
      ),
    ].slice(0, max)
  const lines: Array<RowsLine> = []
  for (const l of Array.isArray(d.lines)
    ? (d.lines as Array<Record<string, unknown> | null>)
    : []) {
    if (l === null || typeof l !== 'object') continue
    const words = text(l.text, 400)
    if (words === '') continue
    const area = LINE_AREAS.includes(l.area as LineArea)
      ? (l.area as LineArea)
      : 'other'
    lines.push({
      area,
      text: words,
      factKeys: keys(l.factKeys, 3),
      stray: hasStray(words, facts),
    })
    if (lines.length === MAX_LINES) break
  }
  const headline = text(d.headline, 300)
  if (headline === '' && lines.length === 0)
    return { ok: false, error: 'NOTHING BACK' }
  return {
    ok: true,
    answer: { headline, tiles: keys(d.tiles, MAX_TILES), lines },
  }
}

/** The answer the test backend gives (E2E=1), built on the facts it has —
    never a call out. */
export function cannedRows(facts: Array<RowFact>): string {
  const has = (k: string) => facts.some((f) => f.key === k)
  const first = (re: RegExp) => facts.find((f) => re.test(f.key))?.key
  const body = first(/^workout\./)
  const lang = first(/^session\./)
  if (facts.length === 0)
    return JSON.stringify({
      headline: 'Nothing logged in this period.',
      tiles: [],
      lines: [{ area: 'nodata', text: 'No rows in these days.', factKeys: [] }],
    })
  return JSON.stringify({
    headline: 'A building month: code most days, the gym and classes kept.',
    tiles: [
      has('commits') ? 'commits' : null,
      body,
      lang,
      has('spent') ? 'spent' : null,
    ].filter(Boolean),
    lines: [
      has('commits') && {
        area: 'projects',
        text: 'Most of it went into code.',
        factKeys: ['commits.p1', 'commits.p2'],
      },
      body && {
        area: 'body',
        text: 'Training on a steady rhythm.',
        factKeys: [body],
      },
      lang && {
        area: 'languages',
        text: 'Classes kept, week after week.',
        factKeys: [lang],
      },
      has('spent') && {
        area: 'money',
        text: 'The biggest row is the room; it is 999 of it.',
        factKeys: ['spent', 'spent.top1'],
      },
      has('task_done') && {
        area: 'tasks',
        text: 'Mostly admin ticked off.',
        factKeys: ['task_done'],
      },
    ].filter(Boolean),
  })
}
