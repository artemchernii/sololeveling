import { expect, test } from 'vitest'

import { askPrompt, parseAsk } from './marketAsk'
import { CANNED_ASK } from './marketAskCanned'

const keys = ['us-cpi', 'mine', 'sec-tech']

test('an answer keeps the keys given and drops the rest', () => {
  const r = parseAsk(
    JSON.stringify({
      kind: 'allocation',
      answer: 'Tech is **most** of it.',
      factKeys: ['sec-tech', 'mkt-moon', 'mine', 'us-cpi'],
      sources: [],
    }),
    keys,
  )
  expect(r.ok && r.answer.factKeys).toEqual(['sec-tech', 'mine', 'us-cpi'])
  expect(r.ok && r.answer.kind).toBe('allocation')
})

test('an unknown kind reads as nodata; a source not https is dropped', () => {
  const r = parseAsk(
    {
      kind: 'horoscope',
      answer: 'x',
      factKeys: [],
      sources: [
        { site: 'a.com', title: 'A', url: 'http://a.com', day: '2026-10-16' },
        { site: 'b.com', title: 'B', url: 'https://b.com', day: 'soon' },
      ],
    },
    keys,
  )
  expect(r.ok && r.answer.kind).toBe('nodata')
  expect(r.ok && r.answer.sources).toEqual([
    { site: 'b.com', title: 'B', url: 'https://b.com', day: '' },
  ])
})

test('no words or broken JSON is a failed answer', () => {
  expect(parseAsk('{', keys)).toEqual({ ok: false, error: 'BROKEN SHAPE' })
  expect(parseAsk({ answer: ' ' }, keys)).toEqual({
    ok: false,
    error: 'NOTHING BACK',
  })
})

test('the canned answers name only keys the canned room gives', () => {
  for (const a of Object.values(CANNED_ASK))
    expect(parseAsk(a, keys).ok).toBe(true)
})

test('without 🌐 the prompt forbids searching; with it, it caps searches', () => {
  const facts = [{ key: 'mine', label: 'MINE', value: '€820', tone: null }]
  expect(askPrompt(facts, null, 'q?', false, '2026-10-21')).toContain(
    'Do not search the web',
  )
  const web = askPrompt(facts, null, 'q?', true, '2026-10-21')
  expect(web).toContain('at most 3 searches')
  expect(web).toContain('- mine: MINE €820')
  expect(web).toContain('Question: q?')
})
