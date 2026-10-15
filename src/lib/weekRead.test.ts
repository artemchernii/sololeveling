import { describe, expect, test } from 'vitest'

import {
  CANNED_READS,
  lineNumbers,
  parseWeekRead,
  weekFacts,
  weekReadPrompt,
} from './weekRead'
import type { ReviewNumbers } from './weekRead'

const review: ReviewNumbers = {
  money: {
    spent: 5.98,
    lastSpent: 74.05,
    bills: 22.14,
    count: 3,
    biggest: [{ name: 'Solinca', amount: 5.98 }],
  },
  projects: [
    { title: 'Solo Leveling', target: 100, thisWeek: 142, lastWeek: 90 },
    { title: 'Oreum', target: null, thisWeek: 0, lastWeek: 0 },
  ],
  body: {
    workouts: 0,
    workouts4: 7,
    shakes: 0,
    shakes4: 1,
    weight: { value: 75.4, at: new Date(2026, 8, 8, 9).getTime() },
  },
  languages: [
    { slug: 'portuguese', week: 0, four: 4 },
    { slug: 'english', week: 0, four: 0 },
  ],
}

describe('weekFacts', () => {
  test("the page's numbers, in the page's words", () => {
    const facts = weekFacts(review, { portuguese: 'Portuguese' }, true)
    const text = Object.fromEntries(facts.map((f) => [f.key, f.text]))
    expect(text.spent).toBe('SPENT €5.98')
    expect(text['spent-was']).toBe('LAST WEEK €74.05')
    expect(text.bills).toBe('BILLS NOT COUNTED €22.14')
    expect(text.biggest).toBe('BIGGEST Solinca €5.98')
    expect(text['project-0']).toBe('SOLO LEVELING 142 COMMITS')
    expect(text['project-0-target']).toBe('TARGET 100')
    expect(text['project-1-target']).toBeUndefined()
    expect(text.workouts).toBe('WORKOUTS 0')
    expect(text['workouts-4']).toBe('7 IN 4 WEEKS')
    expect(text.weight).toBe('WEIGHT 75.4 kg · SEP 8')
    expect(text['lang-portuguese']).toBe('PORTUGUESE 0')
    /* A language with nothing in four weeks has no tile, so no fact. */
    expect(text['lang-english']).toBeUndefined()
  })

  test('a past week says WEEK BEFORE; no body tile, no body facts', () => {
    const quiet = {
      ...review,
      body: { workouts: 0, workouts4: 0, shakes: 0, shakes4: 0, weight: null },
    }
    const facts = weekFacts(quiet, {}, false)
    expect(facts.find((f) => f.key === 'spent-was')?.text).toBe(
      'WEEK BEFORE €74.05',
    )
    expect(facts.filter((f) => f.tile === 'body')).toHaveLength(0)
  })
})

describe('parseWeekRead', () => {
  const keys = weekFacts(review, {}, true).map((f) => f.key)

  test('keeps known keys only, two at most, four lines at most', () => {
    const raw = JSON.stringify({
      verdict: ' mixed week ',
      lines: [
        {
          kind: 'GOOD',
          text: 'a',
          facts: ['spent', 'made-up', 'spent-was', 'bills'],
        },
        { kind: 'MAYBE', text: 'dropped', facts: [] },
        { kind: 'BAD', text: 'b', facts: [] },
        { kind: 'WATCH', text: 'c', facts: ['workouts'] },
        { kind: 'NEXT', text: 'd', facts: ['workouts'] },
        { kind: 'NEXT', text: 'e', facts: [] },
      ],
    })
    const parsed = parseWeekRead(raw, keys)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.read.verdict).toBe('MIXED WEEK')
    expect(parsed.read.lines.map((l) => l.text)).toEqual(['a', 'b', 'c', 'd'])
    expect(parsed.read.lines[0].facts).toEqual(['spent', 'spent-was'])
  })

  test('a broken or empty answer is a failure, never a blank read', () => {
    expect(parseWeekRead('not json', keys).ok).toBe(false)
    expect(parseWeekRead('{"verdict":"X","lines":[]}', keys).ok).toBe(false)
  })

  test('the canned reads parse on the e2e week', () => {
    for (const read of Object.values(CANNED_READS))
      expect(parseWeekRead(JSON.stringify(read), keys).ok).toBe(true)
  })
})

test('lineNumbers prints the named facts and the tile they are on', () => {
  const facts = weekFacts(review, {}, true)
  expect(
    lineNumbers(
      { kind: 'GOOD', text: '', facts: ['spent', 'spent-was'] },
      facts,
    ),
  ).toEqual({ text: 'SPENT €5.98 · LAST WEEK €74.05', tile: 'finances' })
  expect(lineNumbers({ kind: 'NEXT', text: '', facts: [] }, facts)).toEqual({
    text: '',
    tile: null,
  })
})

test('the prompt carries every fact, the day and the tone', () => {
  const facts = weekFacts(review, {}, true)
  const plain = weekReadPrompt(facts, false, 3)
  expect(plain).toContain('- spent: SPENT €5.98')
  expect(plain).toContain('Today is Thursday, day 4 of 7; 3 days are left.')
  expect(plain).not.toContain('GRILL ME is on')
  expect(weekReadPrompt(facts, true, null)).toContain('GRILL ME is on')
  expect(weekReadPrompt(facts, true, null)).toContain('The week is over.')
})
