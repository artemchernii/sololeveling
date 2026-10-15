/* The week, counted (14 Oct, the Review bento). One pass over the logged rows
   of two weeks — last week then this week — gives every log-based number the
   page shows: the day bars by area, LOGGED, TASKS DONE, ON PROJECTS, Body's
   kinds per day, each language's classes and minutes, and the four newest
   rows. Counts and sums of logged rows only (CLAUDE.md, source 1); nothing
   here divides or grades.

   Artem, 14 Oct: "Overall activities like GYM, reading, or simple log 'I
   called Dyson to fix vacuum' is activity". So every row counts, and a row
   whose area is none of the named five lands under OTHER. */

export const GROUPS = [
  'projects',
  'languages',
  'body',
  'money',
  'social',
  'other',
] as const
export type Group = (typeof GROUPS)[number]

export type ReviewRow = {
  _id: string
  kind: string
  area: string
  occurredAt: number
  value?: number
  unit?: string
  text?: string
  projectId?: string
  category?: string
}

type Counts = Record<Group, number>

export type LanguageWeek = {
  slug: string
  classes: number
  minutes: number
  /** Sessions per day, Monday first. */
  days: Array<number>
  /** The week's session rows, for the Vault's sheet count. */
  sessionIds: Array<string>
}

export type WeekNumbers = {
  /** One per day, Monday first: rows per group. */
  days: Array<Counts>
  total: number
  tasksDone: number
  projectMinutes: number
  workouts: number
  /** Body rows per category per day, Monday first. */
  body: Array<{ category: string; days: Array<number> }>
  languages: Array<LanguageWeek>
}

const PROJECT_AREAS = new Set(['projects', 'business'])

export function groupOf(area: string, languages: ReadonlySet<string>): Group {
  if (PROJECT_AREAS.has(area)) return 'projects'
  if (languages.has(area)) return 'languages'
  if (area === 'body' || area === 'money' || area === 'social') return area
  return 'other'
}

const zeros = (): Counts => ({
  projects: 0,
  languages: 0,
  body: 0,
  money: 0,
  social: 0,
  other: 0,
})

/** The last midnight at or before `at`, as an index into `starts`. */
function dayIndex(starts: ReadonlyArray<number>, at: number): number {
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    if (at >= starts[i]) return i
  }
  return -1
}

/** One week's numbers from its rows. `starts` are its seven local midnights;
    a row outside them is not counted. */
export function countWeek(
  rows: ReadonlyArray<ReviewRow>,
  starts: ReadonlyArray<number>,
  end: number,
  languageSlugs: ReadonlyArray<string>,
): WeekNumbers {
  const languages = new Set(languageSlugs)
  const days = starts.map(zeros)
  const body = new Map<string, Array<number>>()
  const langs = new Map<string, LanguageWeek>(
    languageSlugs.map((slug) => [
      slug,
      {
        slug,
        classes: 0,
        minutes: 0,
        days: starts.map(() => 0),
        sessionIds: [],
      },
    ]),
  )
  let total = 0
  let tasksDone = 0
  let projectMinutes = 0
  let workouts = 0

  for (const row of rows) {
    if (row.occurredAt >= end) continue
    const i = dayIndex(starts, row.occurredAt)
    if (i === -1) continue

    total += 1
    days[i][groupOf(row.area, languages)] += 1
    if (row.kind === 'task_done') tasksDone += 1
    if (row.kind === 'session' && row.projectId !== undefined)
      projectMinutes += row.value ?? 0

    if (row.area === 'body' && row.category !== undefined) {
      if (row.kind === 'workout') workouts += 1
      const strip = body.get(row.category) ?? starts.map(() => 0)
      strip[i] += 1
      body.set(row.category, strip)
    }

    const lang = langs.get(row.area)
    if (lang !== undefined && row.kind === 'session') {
      if (row.category === 'class') lang.classes += 1
      lang.minutes += row.value ?? 0
      lang.days[i] += 1
      lang.sessionIds.push(row._id)
    }
  }

  return {
    days,
    total,
    tasksDone,
    projectMinutes,
    workouts,
    body: [...body].map(([category, strip]) => ({ category, days: strip })),
    languages: [...langs.values()],
  }
}

/** The four newest rows of the week, newest first. */
export function latestRows<T extends ReviewRow>(
  rows: ReadonlyArray<T>,
  start: number,
  end: number,
  n = 4,
): Array<T> {
  return rows
    .filter((r) => r.occurredAt >= start && r.occurredAt < end)
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, n)
}
