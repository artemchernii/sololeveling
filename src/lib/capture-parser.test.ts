import { describe, expect, test } from 'vitest'

import {
  formatLine,
  lineFromLog,
  parseCapture,
  projectVerbs,
  searchVerbs,
  suggestVerbs,
} from './capture-parser'
import type { Id } from '../../convex/_generated/dataModel'

/* The parser is the whole of PLAN.md §3's "three seconds, no form" promise, and
   it is pure — so it is cheap to pin down exactly. */

function parsed(input: string) {
  const result = parseCapture(input)
  if (!result.ok) {
    throw new Error(`expected "${input}" to parse: ${result.message}`)
  }
  return result
}

function log(input: string) {
  return parsed(input).log
}

describe('the verbs', () => {
  test('gym on its own logs — the dashboard counts sessions, not minutes', () => {
    expect(log('gym')).toEqual({
      kind: 'workout',
      area: 'body',
      value: undefined,
      unit: 'min',
      text: undefined,
      category: 'gym',
    })
  })

  test('workout is another spelling of gym', () => {
    expect(log('workout 60')).toMatchObject({ kind: 'workout', value: 60 })
  })

  test('gym 60 push day keeps the note', () => {
    expect(log('gym 60 push day')).toMatchObject({
      value: 60,
      text: 'push day',
    })
  })

  test('pt is a portuguese session, not a workout', () => {
    expect(log('pt 30')).toMatchObject({ kind: 'session', area: 'portuguese' })
  })

  test('weight 75.4', () => {
    expect(log('weight 75.4')).toMatchObject({ value: 75.4, unit: 'kg' })
  })

  test('weight 75,4 — a comma decimal is a European keyboard, not a typo', () => {
    expect(log('weight 75,4').value).toBe(75.4)
  })

  test('spend 48 groceries', () => {
    expect(log('spend 48 groceries')).toMatchObject({
      kind: 'expense',
      area: 'money',
      value: 48,
      text: 'groceries',
    })
  })

  test('invest 500 is a transfer, filed under money', () => {
    expect(log('invest 500')).toMatchObject({
      kind: 'transfer',
      area: 'money',
      value: 500,
      unit: 'eur',
    })
  })

  test('note is tinted knowledge — the modal saves it to notes, not logs', () => {
    expect(log('note buy a better desk lamp')).toMatchObject({
      kind: 'note',
      area: 'knowledge',
      text: 'buy a better desk lamp',
    })
  })

  test('a note keeps its numbers as words', () => {
    expect(log('note call 3 people')).toMatchObject({ text: 'call 3 people' })
  })
})

describe('the number can sit anywhere after the verb', () => {
  test('pt homework 20 and pt 20 homework are the same line', () => {
    expect(log('pt homework 20')).toEqual(log('pt 20 homework'))
    expect(log('pt homework 20')).toMatchObject({ value: 20, text: 'homework' })
  })

  test('spend groceries 48', () => {
    expect(log('spend groceries 48')).toMatchObject({
      value: 48,
      text: 'groceries',
    })
  })
})

describe('defaults are real values, and say that they are defaults', () => {
  test('a bare pt is a 50 minute class', () => {
    const result = parsed('pt')
    expect(result.log).toMatchObject({ value: 50, text: 'class' })
    expect(result.defaulted).toEqual({ value: true, text: true })
    expect(result.typed).toEqual({ value: undefined, text: undefined })
  })

  test('a typed number replaces the default and is not marked as one', () => {
    const result = parsed('pt homework 20')
    expect(result.defaulted).toEqual({ value: false, text: false })
  })

  test('pt homework still takes the 50, visibly', () => {
    const result = parsed('pt homework')
    expect(result.log).toMatchObject({ value: 50, text: 'homework' })
    expect(result.defaulted).toEqual({ value: true, text: false })
  })

  test('gym has no default minutes — nothing is invented', () => {
    expect(parsed('gym').defaulted).toEqual({ value: false, text: false })
  })
})

describe('it refuses rather than guesses', () => {
  test('an unknown verb is not filed as anything', () => {
    const result = parseCapture('ran 5k')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("isn't a verb")
      expect(result.verb).toBeUndefined()
    }
  })

  test('a verb that needs a number says so, and is still recognised', () => {
    const result = parseCapture('weight')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('number')
      expect(result.verb?.kind).toBe('weight')
    }
  })

  test('a bare note is refused', () => {
    expect(parseCapture('note').ok).toBe(false)
  })

  test('empty input is refused', () => {
    expect(parseCapture('   ').ok).toBe(false)
  })

  test('verbs are case-insensitive', () => {
    expect(parseCapture('Gym 45').ok).toBe(true)
  })
})

describe('suggestVerbs', () => {
  test('completes a partial first word', () => {
    expect(suggestVerbs('gy')).toEqual(['gym'])
  })

  test('offers every verb that fits, in listed order', () => {
    expect(suggestVerbs('w')).toEqual(['workout', 'weight', 'work'])
  })

  test('what you used most recently wins', () => {
    expect(suggestVerbs('w', ['work', 'gym'])).toEqual([
      'work',
      'workout',
      'weight',
    ])
  })

  test('nothing once the word is complete or a space is typed', () => {
    expect(suggestVerbs('gym')).toEqual([])
    expect(suggestVerbs('gy ')).toEqual([])
    expect(suggestVerbs('')).toEqual([])
  })
})

describe('formatLine and lineFromLog', () => {
  test('formatLine drops what is missing', () => {
    expect(formatLine({ word: 'pt', value: 20, text: 'homework' })).toBe(
      'pt 20 homework',
    )
    expect(formatLine({ word: 'gym' })).toBe('gym')
  })

  test('a default class goes back as a bare pt', () => {
    expect(
      lineFromLog({
        kind: 'session',
        area: 'portuguese',
        value: 50,
        text: 'class',
      }),
    ).toBe('pt')
  })

  test('a workout goes back as gym, the word actually used', () => {
    expect(lineFromLog({ kind: 'workout', area: 'body', value: 60 })).toBe(
      'gym 60',
    )
  })

  test('a log no verb can say is not offered again', () => {
    expect(lineFromLog({ kind: 'task_done', area: 'life' })).toBeNull()
  })

  test('every line it writes parses back to the same row', () => {
    const rows = [
      {
        kind: 'session' as const,
        area: 'portuguese' as const,
        value: 20,
        text: 'homework',
      },
      {
        kind: 'expense' as const,
        area: 'money' as const,
        value: 48,
        text: 'groceries',
      },
      { kind: 'weight' as const, area: 'body' as const, value: 75.4 },
      {
        kind: 'workout' as const,
        area: 'body' as const,
        value: 60,
        text: 'boxing sparring',
      },
      { kind: 'workout' as const, area: 'body' as const, text: 'run' },
      { kind: 'event' as const, area: 'social' as const, text: 'date Ana' },
      {
        kind: 'income' as const,
        area: 'money' as const,
        value: 3000,
        text: 'salary',
      },
      { kind: 'session' as const, area: 'career' as const, value: 90 },
    ]
    for (const row of rows) {
      const line = lineFromLog(row)!
      expect(log(line)).toMatchObject(row)
    }
  })
})

describe('searchVerbs — the / list, by name or by meaning', () => {
  const words = (q: string) => searchVerbs(q).map((c) => c.word)

  test('nothing typed is every verb, in listed order', () => {
    expect(words('')[0]).toBe('gym')
    expect(words('')).toContain('todo')
    expect(new Set(words('')).size).toBe(words('').length)
  })

  test('a forgotten verb is found by what it means', () => {
    expect(words('class')).toEqual(['pt'])
    expect(words('lesson')).toEqual(['pt'])
    expect(words('sparring')).toEqual(['boxing'])
    expect(words('income')).toEqual(['earn', 'salary'])
  })

  test('an area finds every verb filed under it', () => {
    expect(words('money')).toEqual(['spend', 'invest', 'earn', 'salary'])
    expect(words('social')).toEqual(['event', 'date', 'meeting'])
  })

  test('a name match comes before a meaning match', () => {
    // "sp" starts `spend` by name, and `sparring` (boxing) by meaning.
    expect(words('sp')).toEqual(['spend', 'boxing'])
  })

  test('a second spelling counts as the name', () => {
    expect(words('portuguese')[0]).toBe('pt')
    expect(words('workout')[0]).toBe('gym')
  })

  test('nothing that fits is nothing, not everything', () => {
    expect(words('zzz')).toEqual([])
  })
})

describe('the summary says what happened', () => {
  const summary = (line: string) => parsed(line).summary

  test('a number alone still reads as a sentence', () => {
    expect(summary('spend 23')).toBe('Spent €23')
    expect(summary('invest 500')).toBe('Invested €500')
    expect(summary('weight 75.4')).toBe('Weighed 75.4 kg')
  })

  test('words join in where they belong', () => {
    expect(summary('spend 48 groceries')).toBe('Spent €48 on groceries')
    expect(summary('invest 250 TSLA')).toBe('Invested €250 in TSLA')
    expect(summary('gym 60 push day')).toBe('Gym session · 60 min · push day')
  })

  test('a bare verb is still a sentence', () => {
    expect(summary('gym')).toBe('Gym session')
    expect(summary('pt')).toBe('Class · 50 min')
    expect(summary('pt homework 20')).toBe('Homework · 20 min')
  })
})

describe('verbs that keep their word', () => {
  test('boxing is a workout that still says boxing', () => {
    expect(log('boxing 60 sparring')).toMatchObject({
      kind: 'workout',
      area: 'body',
      value: 60,
      text: 'boxing sparring',
    })
    expect(parsed('boxing').log.text).toBe('boxing')
  })

  test('date and meeting are social events, and need nothing after them', () => {
    expect(log('date')).toMatchObject({
      kind: 'event',
      area: 'social',
      text: 'date',
    })
    expect(log('meeting founders')).toMatchObject({ text: 'meeting founders' })
    expect(parseCapture('event').ok).toBe(false)
  })

  test('salary is income that says salary', () => {
    expect(log('salary 3000')).toMatchObject({
      kind: 'income',
      area: 'money',
      value: 3000,
      text: 'salary',
    })
  })

  test('the chips edit what was typed, never the kept word', () => {
    expect(parsed('boxing 60 sparring').typed).toEqual({
      value: 60,
      text: 'sparring',
    })
  })
})

describe('verbs that are not logs', () => {
  test('note and plan are the note sheet', () => {
    expect(parseCapture('plan').verb).toMatchObject({ action: 'note' })
    expect(parseCapture('note').verb).toMatchObject({ action: 'note' })
  })

  test('todo is a task, and needs a title', () => {
    const result = parsed('todo buy a desk lamp')
    expect(result.verb.action).toBe('task')
    expect(result.log.text).toBe('buy a desk lamp')
    expect(parseCapture('todo').ok).toBe(false)
  })

  test('task is the same verb as todo', () => {
    const result = parsed('task invoice the client')
    expect(result.verb.action).toBe('task')
    expect(result.log.text).toBe('invoice the client')
  })

  test('work files under career, not Portuguese', () => {
    expect(log('work 90')).toMatchObject({ kind: 'session', area: 'career' })
    expect(log('office')).toMatchObject({ area: 'career', text: 'office' })
  })
})

describe('projectVerbs — a verb per project, from its title', () => {
  const SOLO = 'js7d7zt0kcf3fk610zmhkeb3th8e57gm' as Id<'projects'>
  const OREUM = 'js7oreum000000000000000000000000' as Id<'projects'>
  const extra = projectVerbs([
    { _id: SOLO, title: 'SoloLeveling' },
    { _id: OREUM, title: 'Oreum' },
    { _id: 'js7work' as Id<'projects'>, title: 'Work' },
  ])

  test('the title becomes the word, and time on it is linked to it', () => {
    expect(extra.map((v) => v.words[0])).toEqual(['sololeveling', 'oreum'])
    const result = parseCapture('sololeveling 90 search', extra)
    expect(result.ok && result.log).toMatchObject({
      kind: 'session',
      area: 'business',
      value: 90,
      text: 'search',
      projectId: SOLO,
    })
  })

  test('a project cannot take a built-in word', () => {
    expect(parseCapture('work 30', extra).verb?.projectId).toBeUndefined()
  })

  test('without the project, there is no verb', () => {
    expect(parseCapture('oreum 45').ok).toBe(false)
  })

  test('it completes, and a past session goes back as the project', () => {
    expect(suggestVerbs('ore', [], extra)).toEqual(['oreum'])
    expect(
      lineFromLog(
        { kind: 'session', area: 'business', value: 45, projectId: OREUM },
        extra,
      ),
    ).toBe('oreum 45')
  })
})

describe('the / list finds a verb by what its area is called (R6)', () => {
  test('a verb is found by the name he gave its area', () => {
    /* `gym` files under the `body` slug whatever that area is named. Without
       the labels, typing the word he renamed it to finds nothing — and the
       word he renamed it to is the word he thinks in. */
    const labels = { body: 'Vigour' }
    expect(searchVerbs('vigo', [], labels).map((c) => c.word)).toContain('gym')
    expect(searchVerbs('vigo', []).map((c) => c.word)).not.toContain('gym')
  })

  test('the slug still matches, as it always did', () => {
    expect(searchVerbs('body').map((c) => c.word)).toContain('gym')
    expect(
      searchVerbs('body', [], { body: 'Fitness' }).map((c) => c.word),
    ).toContain('gym')
  })

  test('a label match ranks below a verb whose own name matches', () => {
    /* `style` the verb and `style` the area both match "sty"; the verb's own
       name wins, which is the three-tier order searchVerbs already had. */
    const order = searchVerbs('sty', [], { style: 'Style' }).map((c) => c.word)
    expect(order[0]).toBe('style')
  })
})

describe('a body verb files the kind of thing it was', () => {
  test('gym carries its category', () => {
    expect(log('gym 60')).toMatchObject({ kind: 'workout', category: 'gym' })
  })

  test('run and boxing keep their own', () => {
    expect(log('run 30').category).toBe('run')
    expect(log('boxing').category).toBe('boxing')
  })

  test('stretch is a workout too', () => {
    expect(log('stretch 15')).toMatchObject({
      kind: 'workout',
      area: 'body',
      category: 'stretch',
      value: 15,
    })
  })

  test('supp is one tick — an intake, no amount', () => {
    const result = parsed('supp')
    expect(result.log.kind).toBe('intake')
    expect(result.log.area).toBe('body')
    expect(result.log.category).toBe('supplements')
    expect(result.verb.amount).toBe('none')
    expect(result.log.value).toBeUndefined()
  })

  test('supplements is the same verb spelled out', () => {
    expect(log('supplements').category).toBe('supplements')
  })
})

describe('a session says whether it was taught', () => {
  test('pt is a class', () => {
    expect(log('pt').category).toBe('class')
  })

  test('practice is the solo one', () => {
    expect(log('practice 40')).toMatchObject({
      kind: 'session',
      area: 'portuguese',
      category: 'practice',
      value: 40,
    })
  })
})
