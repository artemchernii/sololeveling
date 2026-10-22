import { countsInOut } from './money'

/* R7 Ask AI (22 Oct, docs/specs/2026-10-22-r7-ask-ai.md, mockup
   design/ask-mockup/index.html round 2, his "go"). A question about his
   own rows: the app picks the period from the words, reads the rows in it
   and counts them — log counts and sums, commits per project, both
   sanctioned sources — and the model only puts words beside those counts.
   No React here: the drawer, the Convex action and the Claude Code route
   all count with these. */

/** Up to this many days the model reads the rows themselves; longer, only
    the counts. */
export const ROW_DAYS = 92
/** The longest period a question can cover. */
export const MAX_DAYS = 400
/** The rows read in one period at most (a month of his has ~300). */
export const MAX_ROWS = 3000
export const DAY = 86_400_000

export const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(
  ' ',
)

export type Period = {
  from: number
  /** Exclusive: the midnight after the last day. */
  to: number
  /** The badge: `AUG 2026`, `THIS WEEK`, `SINCE SEP 1`. */
  title: string
  /** The days: `AUG 1 – 31`, `SEP 1 – OCT 22`. */
  range: string
}

const MONTH_WORD =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(20\d\d))?/gi

const midnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const plusDays = (t: number, n: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime()
}
const monthOf = (word: string) => MONTHS.indexOf(word.slice(0, 3).toUpperCase())

/** `AUG 1 – 31`, `SEP 1 – OCT 22`, `OCT 22`. */
export function rangeWord(from: number, to: number): string {
  const a = new Date(from)
  const b = new Date(plusDays(to, -1))
  const left = `${MONTHS[a.getMonth()]} ${a.getDate()}`
  if (a.getTime() === b.getTime()) return left
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${left} – ${b.getDate()}`
    : `${left} – ${MONTHS[b.getMonth()]} ${b.getDate()}`
}

function make(from: number, to: number, title: string, now: Date): Period {
  const end = Math.min(to, plusDays(midnight(now), 1))
  return { from, to: end, title, range: rangeWord(from, end) }
}

/** The latest month of that name not after this one. */
function namedMonth(m: number, year: number | null, now: Date) {
  const y =
    year ?? (m > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear())
  return {
    from: new Date(y, m, 1).getTime(),
    to: new Date(y, m + 1, 1).getTime(),
  }
}

/** The period a question names, in local time; null when it names none
    (a follow-up then keeps the one before, a first question the last 30
    days — `lastDays`). */
export function periodOf(question: string, now: Date): Period | null {
  const q = question.toLowerCase()
  const today = midnight(now)
  const tomorrow = plusDays(today, 1)
  const monday = plusDays(today, -((now.getDay() + 6) % 7))

  if (/\btoday\b/.test(q)) return make(today, tomorrow, 'TODAY', now)
  if (/\byesterday\b/.test(q))
    return make(plusDays(today, -1), today, 'YESTERDAY', now)
  if (/\blast week\b/.test(q))
    return make(plusDays(monday, -7), monday, 'LAST WEEK', now)
  if (/\bthis week\b/.test(q)) return make(monday, tomorrow, 'THIS WEEK', now)
  const n = /\b(?:last|past) (\d{1,3}) days\b/.exec(q)
  if (n) {
    const days = Math.min(Number(n[1]), MAX_DAYS)
    return make(plusDays(tomorrow, -days), tomorrow, `LAST ${days} DAYS`, now)
  }
  if (/\bthis year\b/.test(q))
    return make(
      new Date(now.getFullYear(), 0, 1).getTime(),
      tomorrow,
      `${now.getFullYear()}`,
      now,
    )

  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  const since = /\bsince\b(.*)$/.exec(q)
  if (since) {
    const rest = since[1]
    const m = new RegExp(MONTH_WORD.source, 'i').exec(rest)
    if (m) {
      const month = monthOf(m[1])
      const day = /\b(\d{1,2})(?:st|nd|rd|th)?\b/.exec(
        rest.replace(/20\d\d/g, ''),
      )
      const start = namedMonth(month, m[2] ? Number(m[2]) : null, now).from
      const d = new Date(start)
      const from = new Date(
        d.getFullYear(),
        d.getMonth(),
        day ? Math.min(Number(day[1]), 31) : 1,
      ).getTime()
      const f = new Date(from)
      return make(
        from,
        tomorrow,
        `SINCE ${MONTHS[f.getMonth()]} ${f.getDate()}`,
        now,
      )
    }
  }

  const spans: Array<{ from: number; to: number }> = []
  if (/\bthis month\b/.test(q)) spans.push({ from: thisMonth, to: tomorrow })
  if (/\blast month\b|\bmonth before\b/.test(q))
    spans.push({ from: lastMonth, to: thisMonth })
  for (const m of q.matchAll(MONTH_WORD)) {
    /* "may" is a month only with a year or after in/of/since/and. */
    if (
      m[1] === 'may' &&
      !m[2] &&
      !/\b(in|of|during|and|for)\s+$/.test(q.slice(0, m.index))
    )
      continue
    spans.push(namedMonth(monthOf(m[1]), m[2] ? Number(m[2]) : null, now))
  }
  if (spans.length === 0) return null
  const from = Math.min(...spans.map((s) => s.from))
  const to = Math.max(...spans.map((s) => s.to))
  const a = new Date(from)
  const b = new Date(plusDays(Math.min(to, tomorrow), -1))
  const title =
    a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
      ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}`
      : `${MONTHS[a.getMonth()]} – ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
  return make(from, to, title, now)
}

/** The default period: the last 30 days, today included. */
export function lastDays(now: Date, days = 30): Period {
  const tomorrow = plusDays(midnight(now), 1)
  return make(plusDays(tomorrow, -days), tomorrow, `LAST ${days} DAYS`, now)
}

export const periodDays = (p: Period) => Math.round((p.to - p.from) / DAY)

/* ---- the rows ---- */

export type AskLog = {
  id: string
  at: number
  kind: string
  area: string
  text?: string
  value?: number
  unit?: string
  category?: string
  project?: string
}
export type AskCommit = {
  id: string
  at: number
  project: string
  message: string
}
export type AskGoal = {
  title: string
  area?: string
  target?: number
  unit?: string
  status: string
}
export type AskRows = {
  logs: Array<AskLog>
  commits: Array<AskCommit>
  goals: Array<AskGoal>
  /** More rows than MAX_ROWS: the counts stop there. */
  more: boolean
}

/** A count or a sum the app made, by key; `ids` are the rows it opens. */
export type RowFact = {
  key: string
  label: string
  value: string
  sub?: string
  /** An area slug, `projects` for commits, `task` for ticks. */
  area: string
  ids: Array<string>
}

const MONEY_KINDS = new Set(['expense', 'income', 'transfer', 'move'])
const KIND_WORD: Record<string, string> = {
  people_met: 'PEOPLE MET',
  task_done: 'TASK DONE',
}
export const kindWord = (k: string) =>
  KIND_WORD[k] ?? k.replace(/_/g, ' ').toUpperCase()

/** A count's name as the app's tiles say it: WORKOUT for Body's
    workouts, the language for a session (LANGS on Today), else both. */
export function kindLabel(kind: string, area: string): string {
  if (kind === 'workout' && area.toLowerCase() === 'body') return 'WORKOUT'
  if (kind === 'session') return area.toUpperCase()
  return `${kindWord(kind)} · ${area.toUpperCase()}`
}

export const eur = (v: number) =>
  '€' +
  v.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const dayKey = (at: number, offsetMin: number) =>
  new Date(at - offsetMin * 60_000).toISOString().slice(0, 10)
const dayLabel = (at: number, offsetMin: number) => {
  const k = dayKey(at, offsetMin)
  return `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(8, 10)}`
}
const days = (ats: Array<number>, offsetMin: number) =>
  new Set(ats.map((a) => dayKey(a, offsetMin))).size
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 'S'}`

/** Every count and sum the period's rows give, keyed. `offsetMin` is the
    page's `getTimezoneOffset()`, so a day is his day on the server too. */
export function rowFacts(
  rows: AskRows,
  areaLabel: (slug: string) => string,
  offsetMin: number,
  months: Array<string> = [],
): Array<RowFact> {
  const out: Array<RowFact> = []
  const counted = (
    key: string,
    label: string,
    area: string,
    logs: Array<AskLog>,
  ) => {
    const minutes = logs
      .filter((l) => l.unit === 'min' && l.value !== undefined)
      .reduce((s, l) => s + (l.value ?? 0), 0)
    out.push({
      key,
      label,
      value: String(logs.length),
      sub:
        minutes > 0
          ? `${minutes} MIN`
          : plural(
              days(
                logs.map((l) => l.at),
                offsetMin,
              ),
              'DAY',
            ),
      area,
      ids: logs.map((l) => l.id),
    })
  }

  const groups = new Map<string, Array<AskLog>>()
  for (const l of rows.logs) {
    if (MONEY_KINDS.has(l.kind) || l.kind === 'weight') continue
    const k = l.kind === 'task_done' ? 'task_done' : `${l.kind}.${l.area}`
    groups.set(k, [...(groups.get(k) ?? []), l])
  }
  for (const [k, logs] of [...groups].sort((a, b) => b[1].length - a[1].length))
    if (k === 'task_done') counted(k, 'TASK DONE', 'task', logs)
    else
      counted(
        k,
        kindLabel(logs[0].kind, areaLabel(logs[0].area)),
        logs[0].area,
        logs,
      )

  const weights = rows.logs
    .filter((l) => l.kind === 'weight' && l.value !== undefined)
    .sort((a, b) => a.at - b.at)
  const weightFact = (key: string, l: AskLog) =>
    out.push({
      key,
      label: `WEIGHT · ${dayLabel(l.at, offsetMin)}`,
      value: `${l.value} ${(l.unit ?? 'kg').toUpperCase()}`,
      area: l.area,
      ids: [l.id],
    })
  if (weights.length > 1) weightFact('weight.first', weights[0])
  if (weights.length > 0) weightFact('weight.last', weights.at(-1)!)

  const money = (
    key: string,
    label: string,
    logs: Array<AskLog>,
    area = 'money',
  ) => {
    const cents = logs.reduce((s, l) => s + Math.round((l.value ?? 0) * 100), 0)
    out.push({
      key,
      label,
      value: eur(cents / 100),
      sub: plural(logs.length, 'ROW'),
      area,
      ids: logs.map((l) => l.id),
    })
  }
  const inOut = (l: AskLog) =>
    countsInOut({
      value: l.value,
      unit: l.unit,
      meta: { category: l.category },
    })
  const spent = rows.logs.filter((l) => l.kind === 'expense' && inOut(l))
  if (spent.length > 0) {
    money('spent', 'SPENT', spent)
    const by = new Map<string, Array<AskLog>>()
    for (const l of spent) {
      const name = (l.text ?? '').trim() || 'UNNAMED'
      by.set(name, [...(by.get(name) ?? []), l])
    }
    const sum = (ls: Array<AskLog>) =>
      ls.reduce((s, l) => s + (l.value ?? 0), 0)
    ;[...by]
      .sort((a, b) => sum(b[1]) - sum(a[1]))
      .slice(0, 3)
      .forEach(([name, ls], i) =>
        money(`spent.top${i + 1}`, name.toUpperCase(), ls),
      )
  }
  const income = rows.logs.filter((l) => l.kind === 'income' && inOut(l))
  if (income.length > 0) money('in', 'IN', income)

  if (rows.commits.length > 0) {
    out.push({
      key: 'commits',
      label: 'COMMITS',
      value: String(rows.commits.length),
      sub: plural(
        days(
          rows.commits.map((c) => c.at),
          offsetMin,
        ),
        'DAY',
      ),
      area: 'projects',
      ids: rows.commits.map((c) => c.id),
    })
    const by = new Map<string, Array<AskCommit>>()
    for (const c of rows.commits)
      by.set(c.project, [...(by.get(c.project) ?? []), c])
    ;[...by]
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([project, cs], i) =>
        out.push({
          key: `commits.p${i + 1}`,
          label: project.toUpperCase(),
          value: String(cs.length),
          sub: plural(
            days(
              cs.map((c) => c.at),
              offsetMin,
            ),
            'DAY',
          ),
          area: 'projects',
          ids: cs.map((c) => c.id),
        }),
      )
  }

  /* Two months or more: the main counts again, month by month, so "this
     month and last month" has both numbers. */
  if (months.length > 1)
    for (const month of months) {
      const inMonth = <T extends { at: number }>(xs: Array<T>) =>
        xs.filter((x) => dayKey(x.at, offsetMin).slice(0, 7) === month)
      const sub = rowFacts(
        {
          logs: inMonth(rows.logs),
          commits: inMonth(rows.commits),
          goals: [],
          more: false,
        },
        areaLabel,
        offsetMin,
      )
      const word = MONTHS[Number(month.slice(5, 7)) - 1]
      for (const f of sub)
        if (!/\.(top\d|p\d|first|last)$/.test(f.key))
          out.push({
            ...f,
            key: `${f.key}@${month}`,
            label: `${word} · ${f.label}`,
          })
    }
  return out
}

/** The `YYYY-MM` months a period touches, oldest first. */
export function monthsOf(p: Period): Array<string> {
  const out: Array<string> = []
  const d = new Date(p.from)
  let y = d.getFullYear()
  let m = d.getMonth()
  while (new Date(y, m, 1).getTime() < p.to) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    m++
    if (m === 12) {
      m = 0
      y++
    }
  }
  return out
}

/** One line per row for the model: `2026-08-02 workout body "Gym" 60 min`. */
export function rowLines(rows: AskRows, offsetMin: number): Array<string> {
  const q = (s?: string) => (s ? ` "${s.replace(/"/g, "'").slice(0, 80)}"` : '')
  return [
    ...rows.logs.map(
      (l) =>
        `${dayKey(l.at, offsetMin)} ${l.kind} ${l.area}${q(l.text)}${
          l.value !== undefined
            ? ` ${l.value}${l.unit ? ` ${l.unit}` : ''}`
            : ''
        }${l.category ? ` [${l.category}]` : ''}${l.project ? ` (${l.project})` : ''}`,
    ),
    ...rows.commits.map(
      (c) => `${dayKey(c.at, offsetMin)} commit (${c.project})${q(c.message)}`,
    ),
  ].sort()
}

/** Which areas have a row on each day of the period, for the strip. */
export function dayAreas(
  rows: AskRows,
  p: Period,
): Array<{ day: number; areas: Array<string> }> {
  const out: Array<{ day: number; areas: Array<string> }> = []
  for (let t = p.from; t < p.to; t = plusDays(t, 1)) {
    const end = plusDays(t, 1)
    const on = (at: number) => at >= t && at < end
    const areas = new Set<string>()
    for (const l of rows.logs)
      if (on(l.at))
        areas.add(
          MONEY_KINDS.has(l.kind)
            ? 'money'
            : l.kind === 'task_done'
              ? 'task'
              : l.area,
        )
    if (rows.commits.some((c) => on(c.at))) areas.add('projects')
    out.push({ day: new Date(t).getDate(), areas: [...areas].sort() })
  }
  return out
}
