import { euros } from './money'

/* The AI read of a week on Review (R7, 15 Oct; spec
   docs/specs/2026-10-15-review-ai-read.md, mockup real2.html). His words:
   "if week is good it says good this and that … if bad => grill me hard
   and encourage to work harder."

   The model is handed the page's own numbers as facts, each with a key
   and the text the page shows. It writes the verdict and the lines; under
   a line the app prints the facts it named, never numbers of its own. */

export const WEEK_READ_MODEL = 'claude-haiku-5-5'

export const READ_TILES = ['finances', 'projects', 'body', 'languages'] as const
export type ReadTile = (typeof READ_TILES)[number]

export const READ_KINDS = ['GOOD', 'BAD', 'WATCH', 'NEXT'] as const
export type ReadKind = (typeof READ_KINDS)[number]

export type WeekFact = { key: string; tile: ReadTile; text: string }
export type WeekReadLine = {
  kind: ReadKind
  text: string
  facts: Array<string>
}
export type WeekRead = { verdict: string; lines: Array<WeekReadLine> }

/** What `aggregate.weekReview` returns, as far as the read needs it. */
export type ReviewNumbers = {
  money: {
    spent: number
    lastSpent: number
    bills: number
    count: number
    biggest: Array<{ name: string; amount: number }>
  }
  projects: Array<{
    title: string
    target: number | null
    thisWeek: number
    lastWeek: number
  }>
  body: {
    workouts: number
    workouts4: number
    shakes: number
    shakes4: number
    weight: { value: number; at: number } | null
  }
  languages: Array<{ slug: string; week: number; four: number }>
}

const money = (n: number) => euros(Math.round(n * 100) / 100)
const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
/** `SEP 8`, as the Body tile writes the weight's day. */
const dayLabel = (at: number) => {
  const d = new Date(at)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/**
 * The page's numbers as facts, in the words the page shows them. Body and
 * a language come in only when the page draws their tile (something in
 * four weeks); `names` are the language areas' labels by slug.
 */
export function weekFacts(
  review: ReviewNumbers,
  names: Record<string, string>,
  thisWeek: boolean,
): Array<WeekFact> {
  const was = thisWeek ? 'LAST WEEK' : 'WEEK BEFORE'
  const facts: Array<WeekFact> = [
    {
      key: 'spent',
      tile: 'finances',
      text: `SPENT ${money(review.money.spent)}`,
    },
    {
      key: 'spent-was',
      tile: 'finances',
      text: `${was} ${money(review.money.lastSpent)}`,
    },
    {
      key: 'payments',
      tile: 'finances',
      text: `${review.money.count} PAYMENTS`,
    },
  ]
  if (review.money.bills > 0)
    facts.push({
      key: 'bills',
      tile: 'finances',
      text: `BILLS NOT COUNTED ${money(review.money.bills)}`,
    })
  const top = review.money.biggest.at(0)
  if (top !== undefined)
    facts.push({
      key: 'biggest',
      tile: 'finances',
      text: `BIGGEST ${top.name} ${money(top.amount)}`,
    })

  review.projects.forEach((p, i) => {
    const name = p.title.toUpperCase()
    facts.push({
      key: `project-${i}`,
      tile: 'projects',
      text: `${name} ${p.thisWeek} COMMITS`,
    })
    if (p.target !== null)
      facts.push({
        key: `project-${i}-target`,
        tile: 'projects',
        text: `TARGET ${p.target}`,
      })
    facts.push({
      key: `project-${i}-was`,
      tile: 'projects',
      text: `${was} ${p.lastWeek}`,
    })
  })

  const b = review.body
  if (b.workouts4 > 0 || b.shakes4 > 0 || b.weight !== null) {
    facts.push(
      { key: 'workouts', tile: 'body', text: `WORKOUTS ${b.workouts}` },
      {
        key: 'workouts-4',
        tile: 'body',
        text: `${b.workouts4} IN 4 WEEKS`,
      },
      { key: 'shakes', tile: 'body', text: `SHAKES ${b.shakes}` },
      { key: 'shakes-4', tile: 'body', text: `${b.shakes4} SHAKES IN 4 WEEKS` },
    )
    if (b.weight !== null)
      facts.push({
        key: 'weight',
        tile: 'body',
        text: `WEIGHT ${b.weight.value} kg · ${dayLabel(b.weight.at)}`,
      })
  }

  for (const l of review.languages) {
    if (l.four === 0) continue
    const name = (names[l.slug] ?? l.slug).toUpperCase()
    facts.push(
      { key: `lang-${l.slug}`, tile: 'languages', text: `${name} ${l.week}` },
      {
        key: `lang-${l.slug}-4`,
        tile: 'languages',
        text: `${l.four} IN 4 WEEKS`,
      },
    )
  }
  return facts
}

/** The two numbers under a line: the facts it named, as the page shows them. */
export function lineNumbers(
  line: WeekReadLine,
  facts: Array<WeekFact>,
): { text: string; tile: ReadTile | null } {
  const named = line.facts
    .map((key) => facts.find((f) => f.key === key))
    .filter((f) => f !== undefined)
  return {
    text: named.map((f) => f.text).join(' · '),
    tile: named.at(0)?.tile ?? null,
  }
}

export const WEEK_READ_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...READ_KINDS] },
          text: { type: 'string' },
          facts: { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'text', 'facts'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'lines'],
  additionalProperties: false,
}

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/**
 * What the model is asked. `day` is today's place in the week (0 Monday),
 * or null for a week that is over.
 */
export function weekReadPrompt(
  facts: Array<WeekFact>,
  grill: boolean,
  day: number | null,
): string {
  const when =
    day === null
      ? 'The week is over.'
      : `Today is ${WEEKDAYS[day]}, day ${day + 1} of 7; ${6 - day} days are left.`
  const voice = grill
    ? `GRILL ME is on. Be hard on the week: blunt, short sentences, no
comfort, no excuses accepted. Name what was skipped and push him to work
harder. Credit a real win in one short line at most. Never insult him as a
person; the week is what is judged.`
    : `Be honest and warm. If the week is good, say what went well and that
the goals were reached. If it is bad, say so plainly and push him on.`
  return `You read one week of Artem's life for the Review page of his
personal app. Talk to him as "you". ${when}

${voice}

The facts below are the numbers on his page, each with a key. They are
all you know. Never invent a number, a goal or an event that is not in
them. Money is spending (bills not counted); fewer euros spent is better.

Facts:
${facts.map((f) => `- ${f.key}: ${f.text}`).join('\n')}

Answer with:
- verdict: two or three words in capitals that name the week, ending in
  WEEK (for example STRONG WEEK, MIXED WEEK, WEAK WEEK).
- lines: exactly 4 lines. kind is GOOD (went well), BAD (went badly),
  WATCH (at risk) or NEXT (what to do next, said as an order). Use GOOD
  and BAD as the week deserves; the last line is NEXT. text is one short
  sentence, 12 words at most. facts is one or two keys from the list that
  the line is about; their numbers are printed under the line, so the text
  need not repeat them.`
}

/** The model's answer, checked: a verdict, four lines, only known keys. */
export function parseWeekRead(
  raw: string,
  keys: Array<string>,
): { ok: true; read: WeekRead } | { ok: false; error: string } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'The reader answered in a broken shape.' }
  }
  const d = data as { verdict?: unknown; lines?: unknown }
  if (typeof d.verdict !== 'string' || !Array.isArray(d.lines))
    return { ok: false, error: 'The reader answered in a broken shape.' }
  const verdict = d.verdict.trim().toUpperCase().slice(0, 32)
  const lines: Array<WeekReadLine> = []
  for (const l of d.lines as Array<Record<string, unknown>>) {
    const kind = l.kind as ReadKind
    if (!READ_KINDS.includes(kind) || typeof l.text !== 'string') continue
    const facts = Array.isArray(l.facts)
      ? (l.facts as Array<unknown>)
          .filter((k): k is string => typeof k === 'string' && keys.includes(k))
          .slice(0, 2)
      : []
    lines.push({ kind, text: l.text.trim(), facts })
  }
  if (verdict === '' || lines.length === 0)
    return { ok: false, error: 'The reader answered with nothing to show.' }
  return { ok: true, read: { verdict, lines: lines.slice(0, 4) } }
}

/* What the test backend (E2E=1) answers instead of the model, so no test
   pays. Keys from e2e.reviewWeek's week. */
export const CANNED_READS: Record<'plain' | 'grill', WeekRead> = {
  plain: {
    verdict: 'MIXED WEEK',
    lines: [
      {
        kind: 'GOOD',
        text: 'Commit target reached by Wednesday.',
        facts: ['project-0', 'project-0-target'],
      },
      {
        kind: 'GOOD',
        text: 'Spent less than last week.',
        facts: ['spent', 'spent-was'],
      },
      {
        kind: 'WATCH',
        text: 'Two workouts so far — keep the rhythm.',
        facts: ['workouts', 'workouts-4'],
      },
      {
        kind: 'NEXT',
        text: 'One more gym session before Sunday.',
        facts: ['workouts'],
      },
    ],
  },
  grill: {
    verdict: 'WEAK WEEK',
    lines: [
      {
        kind: 'GOOD',
        text: 'Commits on target. Fine. That is the floor.',
        facts: ['project-0', 'project-0-target'],
      },
      {
        kind: 'BAD',
        text: 'Oreum got nothing. Zero.',
        facts: ['project-1', 'project-1-was'],
      },
      {
        kind: 'BAD',
        text: 'Two workouts is not a training week.',
        facts: ['workouts', 'workouts-4'],
      },
      {
        kind: 'NEXT',
        text: 'Gym tomorrow. No excuses.',
        facts: ['workouts'],
      },
    ],
  },
}
