import { expect, test } from 'vitest'

import { ideasPrompt, parseIdeasRead } from './ideasRead'
import { cannedIdeas } from './ideasReadCanned'
import type { Fact } from './marketRead'

const f = (key: string): Fact => ({ key, label: key, value: 'x', tone: null })
const facts = [f('pos-AVGO'), f('pos-NVDA'), f('tk-AVGO'), f('alloc-health')]

test('the canned board passes, its parts are the cash and ADD names holdings', () => {
  const r = parseIdeasRead(cannedIdeas(facts, 45_858), facts, 45_858)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const p = r.board.parts
  expect(p.keep + p.protect + p.add + p.new).toBe(45_858)
  expect(r.board.lines.find((l) => l.ticker === 'JNJ')?.area).toBe('health')
})

test('parts that are not the idle cash are refused', () => {
  const r = parseIdeasRead(cannedIdeas(facts, 1000), facts, 2000)
  expect(r).toEqual({ ok: false, error: 'PARTS ≠ CASH' })
})

test('ADD on a ticker not held and NEW on one held are dropped — and the part no longer adds up', () => {
  const raw = cannedIdeas(facts, 1000)
  raw.lines[0].ticker = 'TSLA'
  expect(parseIdeasRead(raw, facts, 1000)).toEqual({
    ok: false,
    error: 'ADD LINES ≠ PART',
  })
  const raw2 = cannedIdeas(facts, 1000)
  raw2.lines[4].ticker = 'NVDA'
  expect(parseIdeasRead(raw2, facts, 1000)).toMatchObject({
    ok: false,
    error: 'NEW LINES ≠ PART',
  })
})

test('a hold puts in €0; NUMBERS keep given keys and claims with https pages only', () => {
  const raw = cannedIdeas(facts, 1000)
  raw.lines[1].call = 'hold'
  raw.lines[0].eur += raw.lines[1].eur
  raw.lines[0].numbers = [
    { key: 'tk-AVGO', text: '', url: '' },
    { key: 'tk-NOPE', text: '', url: '' },
    { key: '', text: 'claim', url: 'http://x.com' },
    { key: '', text: 'claim', url: 'https://x.com/a' },
  ]
  const r = parseIdeasRead(raw, facts, 1000)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.board.lines[1].eur).toBe(0)
  expect(r.board.lines[0].numbers).toEqual([
    { key: 'tk-AVGO', text: '', url: '' },
    { key: '', text: 'claim', url: 'https://x.com/a' },
  ])
})

test('broken or empty answers fail', () => {
  expect(parseIdeasRead('{', facts, 1)).toEqual({
    ok: false,
    error: 'BROKEN SHAPE',
  })
  expect(parseIdeasRead({ take: '' }, facts, 1)).toEqual({
    ok: false,
    error: 'NOTHING BACK',
  })
})

test('the prompt names the cash, the holdings ADD may use and the facts', () => {
  const p = ideasPrompt(facts, 45_858, '2026-10-29')
  expect(p).toContain('€45858')
  expect(p).toContain('ONLY tickers among: AVGO, NVDA')
  expect(p).toContain('- tk-AVGO: tk-AVGO x')
  expect(p).toContain('Never a sell')
})
