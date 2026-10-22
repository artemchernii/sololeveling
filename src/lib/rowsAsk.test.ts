import { describe, expect, it } from 'vitest'

import {
  dayAreas,
  lastDays,
  monthsOf,
  periodOf,
  rowFacts,
  rowLines,
} from './rowsAsk'
import { cannedRows, hasStray, parseRows, rowsPrompt } from './rowsAskPrompt'
import type { AskRows } from './rowsAsk'

/* A Thursday afternoon, 22 Oct 2026, local time. */
const NOW = new Date(2026, 9, 22, 15, 0)
const at = (m: number, d: number, h = 12) => new Date(2026, m, d, h).getTime()
const label = (s: string) =>
  ({ body: 'Body', portuguese: 'Portuguese' })[s] ?? s
const OFF = NOW.getTimezoneOffset()

describe('periodOf', () => {
  it('a month by name is the latest of that name, whole', () => {
    const p = periodOf('What did I actually do in August?', NOW)!
    expect(p.from).toBe(new Date(2026, 7, 1).getTime())
    expect(p.to).toBe(new Date(2026, 8, 1).getTime())
    expect(p.title).toBe('AUG 2026')
    expect(p.range).toBe('AUG 1 – 31')
  })
  it('a month after this one is last year’s', () => {
    expect(periodOf('how was december', NOW)!.title).toBe('DEC 2025')
  })
  it('this month stops at today', () => {
    const p = periodOf('workouts this month', NOW)!
    expect(p.title).toBe('OCT 2026')
    expect(p.range).toBe('OCT 1 – 22')
  })
  it('this month and last month is both', () => {
    const p = periodOf('Portuguese this month and last month', NOW)!
    expect(p.title).toBe('SEP – OCT 2026')
    expect(p.range).toBe('SEP 1 – OCT 22')
    expect(monthsOf(p)).toEqual(['2026-09', '2026-10'])
  })
  it('since a day', () => {
    const p = periodOf('How many workouts since 1 September?', NOW)!
    expect(p.title).toBe('SINCE SEP 1')
    expect(p.range).toBe('SEP 1 – OCT 22')
    expect(periodOf('since september 14th', NOW)!.title).toBe('SINCE SEP 14')
  })
  it('weeks start on Monday', () => {
    expect(periodOf('Where did the money go last week?', NOW)!.range).toBe(
      'OCT 12 – 18',
    )
    expect(periodOf('tasks done this week', NOW)!.range).toBe('OCT 19 – 22')
  })
  it('"may" alone is not a month', () => {
    expect(periodOf('may I ask about money', NOW)).toBeNull()
    expect(periodOf('what happened in may', NOW)!.title).toBe('MAY 2026')
  })
  it('no period words: null, and the default is the last 30 days', () => {
    expect(periodOf('which projects got commits?', NOW)).toBeNull()
    expect(lastDays(NOW).range).toBe('SEP 23 – OCT 22')
  })
})

const ROWS: AskRows = {
  logs: [
    {
      id: 'w1',
      at: at(7, 2),
      kind: 'workout',
      area: 'body',
      text: 'Gym',
      value: 60,
      unit: 'min',
    },
    {
      id: 'w2',
      at: at(7, 5),
      kind: 'workout',
      area: 'body',
      text: 'Run',
      value: 35,
      unit: 'min',
    },
    {
      id: 's1',
      at: at(7, 4),
      kind: 'session',
      area: 'portuguese',
      text: 'Class',
    },
    {
      id: 'e1',
      at: at(7, 1),
      kind: 'expense',
      area: 'money',
      text: 'Pingo Doce',
      value: 48.2,
      unit: 'eur',
    },
    {
      id: 'e2',
      at: at(7, 8),
      kind: 'expense',
      area: 'money',
      text: 'Pingo Doce',
      value: 61.35,
      unit: 'eur',
    },
    {
      id: 'e3',
      at: at(7, 22),
      kind: 'expense',
      area: 'money',
      text: 'Renda',
      value: 650,
      unit: 'eur',
    },
    {
      id: 'e4',
      at: at(7, 9),
      kind: 'expense',
      area: 'money',
      text: 'Lent',
      value: 100,
      unit: 'eur',
      category: 'lent',
    },
    {
      id: 'e5',
      at: at(7, 9),
      kind: 'expense',
      area: 'money',
      text: 'Dollars',
      value: 10,
      unit: 'usd',
    },
    {
      id: 't1',
      at: at(7, 30),
      kind: 'task_done',
      area: 'life',
      text: 'Send invoice',
    },
    {
      id: 'k1',
      at: at(7, 3),
      kind: 'weight',
      area: 'body',
      value: 75.4,
      unit: 'kg',
    },
    {
      id: 'k2',
      at: at(7, 28),
      kind: 'weight',
      area: 'body',
      value: 74.6,
      unit: 'kg',
    },
  ],
  commits: [
    { id: 'c1', at: at(7, 2, 10), project: 'Oreum', message: 'feat: a' },
    { id: 'c2', at: at(7, 2, 11), project: 'Oreum', message: 'feat: b' },
    { id: 'c3', at: at(7, 3), project: 'Solo Leveling', message: 'fix: c' },
  ],
  goals: [],
  more: false,
}

describe('rowFacts', () => {
  const facts = rowFacts(ROWS, label, OFF)
  const f = (k: string) => facts.find((x) => x.key === k)
  it('counts per kind and area, minutes as the sub', () => {
    expect(f('workout.body')).toMatchObject({
      label: 'WORKOUT',
      value: '2',
      sub: '95 MIN',
      ids: ['w1', 'w2'],
    })
    expect(f('session.portuguese')).toMatchObject({ value: '1', sub: '1 DAY' })
    expect(f('task_done')).toMatchObject({
      label: 'TASK DONE',
      value: '1',
      area: 'task',
    })
  })
  it('spent in euros, lent and other currencies not added; top payees', () => {
    expect(f('spent')).toMatchObject({
      value: '€759.55',
      sub: '3 ROWS',
      ids: ['e1', 'e2', 'e3'],
    })
    expect(f('spent.top1')).toMatchObject({ label: 'RENDA', value: '€650.00' })
    expect(f('spent.top2')).toMatchObject({
      label: 'PINGO DOCE',
      value: '€109.55',
      sub: '2 ROWS',
    })
  })
  it('weight is the first and the last row, never a difference', () => {
    expect(f('weight.first')).toMatchObject({
      label: 'WEIGHT · AUG 03',
      value: '75.4 KG',
    })
    expect(f('weight.last')).toMatchObject({
      label: 'WEIGHT · AUG 28',
      value: '74.6 KG',
    })
    expect(facts.some((x) => x.value.includes('0.8'))).toBe(false)
  })
  it('commits, then per project, with days', () => {
    expect(f('commits')).toMatchObject({ value: '3', sub: '2 DAYS' })
    expect(f('commits.p1')).toMatchObject({ label: 'OREUM', value: '2' })
    expect(f('commits.p2')).toMatchObject({
      label: 'SOLO LEVELING',
      value: '1',
    })
  })
  it('two months: the counts again, month by month', () => {
    const two: AskRows = {
      ...ROWS,
      logs: [
        ...ROWS.logs,
        { id: 's2', at: at(8, 3), kind: 'session', area: 'portuguese' },
      ],
    }
    const fs = rowFacts(two, label, OFF, ['2026-08', '2026-09'])
    expect(
      fs.find((x) => x.key === 'session.portuguese@2026-08'),
    ).toMatchObject({ label: 'AUG · PORTUGUESE', value: '1' })
    expect(
      fs.find((x) => x.key === 'session.portuguese@2026-09'),
    ).toMatchObject({ value: '1' })
  })
  it('nothing in the period: no facts', () => {
    expect(
      rowFacts({ logs: [], commits: [], goals: [], more: false }, label, OFF),
    ).toEqual([])
  })
})

describe('rows for the model and the strip', () => {
  it('one line per row, by day', () => {
    const lines = rowLines(ROWS, OFF)
    expect(lines[0]).toBe('2026-08-01 expense money "Pingo Doce" 48.2 eur')
    expect(lines).toContain('2026-08-02 commit (Oreum) "feat: a"')
  })
  it('which areas have a row each day', () => {
    const p = periodOf('august', NOW)!
    const d = dayAreas(ROWS, p)
    expect(d).toHaveLength(31)
    expect(d[1]).toEqual({ day: 2, areas: ['body', 'projects'] })
    expect(d[29].areas).toEqual(['task'])
  })
})

describe('the answer', () => {
  const facts = rowFacts(ROWS, label, OFF)
  it('keys never given are dropped, tiles at most four', () => {
    const r = parseRows(
      {
        headline: 'A month.',
        tiles: ['commits', 'nope', 'spent', 'workout.body', 'task_done', 'in'],
        lines: [
          {
            area: 'body',
            text: 'Steady.',
            factKeys: ['workout.body', 'made.up'],
          },
        ],
      },
      facts,
    )
    expect(r.ok && r.answer.tiles).toEqual([
      'commits',
      'spent',
      'workout.body',
      'task_done',
    ])
    expect(r.ok && r.answer.lines[0].factKeys).toEqual(['workout.body'])
  })
  it('a number no count carries is marked', () => {
    expect(hasStray('Code on 2 days, 3 commits', facts)).toBe(false)
    expect(hasStray('until the 16th, in 2026', facts)).toBe(false)
    expect(hasStray('spent €759.55', facts)).toBe(false)
    expect(hasStray('about 40% more', facts)).toBe(true)
    expect(hasStray('lost 0.8 kg', facts)).toBe(true)
  })
  it('broken or empty answers fail', () => {
    expect(parseRows('{nope', facts)).toEqual({
      ok: false,
      error: 'BROKEN SHAPE',
    })
    expect(parseRows({ headline: '', lines: [] }, facts)).toEqual({
      ok: false,
      error: 'NOTHING BACK',
    })
  })
  it('the canned answer parses on its facts and marks its stray number', () => {
    const r = parseRows(cannedRows(facts), facts)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.answer.tiles).toEqual([
      'commits',
      'workout.body',
      'session.portuguese',
      'spent',
    ])
    expect(r.answer.lines.find((l) => l.area === 'money')?.stray).toBe(true)
    expect(parseRows(cannedRows([]), []).ok).toBe(true)
  })
  it('the prompt carries the facts and rows, and long periods only counts', () => {
    const p = periodOf('august', NOW)!
    const s = rowsPrompt({
      question: 'q',
      period: p,
      facts,
      lines: rowLines(ROWS, OFF),
      goals: [],
      more: false,
      today: '2026-10-22',
      history: [],
    })
    expect(s).toContain('- spent | SPENT | €759.55 | 3 ROWS')
    expect(s).toContain('"Pingo Doce" 48.2 eur')
    const year = periodOf('this year', NOW)!
    expect(
      rowsPrompt({
        question: 'q',
        period: year,
        facts,
        lines: ['x'],
        goals: [],
        more: false,
        today: '',
        history: [],
      }),
    ).toContain('only the counts')
  })
})
