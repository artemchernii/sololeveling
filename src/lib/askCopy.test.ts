import { describe, expect, test } from 'vitest'

import { askCopyText, dayWord, siteWord } from './askCopy'
import type { CopyInput } from './askCopy'

/* 21 Oct 2026 14:35 local time. */
const AT = new Date(2026, 9, 21, 14, 35).getTime()

const BARE: CopyInput = {
  question: 'Explain my allocation',
  web: false,
  kind: '⚖️ ALLOCATION',
  answer: 'Tech is **41%** of it.\n',
  facts: [],
  inNext: [],
  ideas: [],
  sources: [],
  model: 'SONNET 5.5',
  searches: 0,
  at: AT,
}

describe('askCopyText', () => {
  test('S4 no facts, no sources → question, kind, words, the model line', () => {
    expect(askCopyText(BARE)).toBe(
      [
        '## Explain my allocation',
        '⚖️ ALLOCATION',
        'Tech is **41%** of it.',
        '✦ SONNET 5.5 · 21 OCT 14:35 · RESEARCH · NOT ADVICE',
      ].join('\n\n'),
    )
  })

  test('S3 🌐 with facts, ideas and sources → every section, in order', () => {
    const text = askCopyText({
      ...BARE,
      question: 'Give me more ideas',
      web: true,
      kind: '💡 IDEAS',
      facts: ['💻 TECH · MINE 41% · WORLD 26%'],
      inNext: ['NOVO B', 'RHM'],
      ideas: [
        {
          ticker: 'JNJ',
          name: 'Johnson & Johnson',
          why: 'Medicines, steady dividend',
          bull: 'Health spending grows',
          bear: 'Lawsuits',
          wrong: 'two launches miss',
        },
      ],
      sources: [
        {
          site: 'www.reuters.com',
          title: 'Powell',
          url: 'https://www.reuters.com/a',
          day: '2026-10-16',
        },
        { site: 'fed.gov', title: 'Fed', url: 'https://fed.gov/b', day: '' },
      ],
      searches: 1,
    })
    expect(text).toBe(
      [
        '## 🌐 Give me more ideas',
        '💡 IDEAS',
        'Tech is **41%** of it.',
        'FACTS\n- 💻 TECH · MINE 41% · WORLD 26%\n- 💡 IN NEXT · NOVO B · RHM',
        'IDEAS · MODEL · NOT ADVICE\n- JNJ · Johnson & Johnson — Medicines, steady dividend\n  ▲ Health spending grows\n  ▼ Lawsuits\n  ✕ Wrong if two launches miss',
        'SOURCES\n- REUTERS · 16 OCT · https://www.reuters.com/a\n- FED · https://fed.gov/b',
        '✦ SONNET 5.5 · 1 SEARCH · 21 OCT 14:35 · RESEARCH · NOT ADVICE',
      ].join('\n\n'),
    )
  })

  test('searches are plural past one', () => {
    expect(askCopyText({ ...BARE, searches: 2 })).toContain(
      '✦ SONNET 5.5 · 2 SEARCHES · 21 OCT',
    )
  })
})

test('siteWord and dayWord name a source as its pill does', () => {
  expect(siteWord('www.federalreserve.gov')).toBe('FEDERALRESERVE')
  expect(dayWord('2026-01-05')).toBe('5 JAN')
})
