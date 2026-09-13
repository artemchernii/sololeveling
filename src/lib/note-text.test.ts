import { describe, expect, test } from 'vitest'

import {
  continueList,
  indentLine,
  joinNote,
  parseBlocks,
  splitNote,
} from './note-text'

const SHAVING = `Гоління — перехід на T-подібну бритву

ПОКУПКИ (~70-80€ на старті)

* Станок: Merkur 34C / Edwin Jagger DE89 / Mühle R89 — ~35-45€
* Леза: Astra Superior Platinum або Derby (пачка 100 шт)


ТЕХНІКА

* Голитись після душу — шкіра розпарена
* НЕ тиснути — вага станка робить роботу сама


Далі: ~15€/рік на леза й мило.`

describe('splitNote — the first line is the title', () => {
  test('a note pasted from Apple Notes', () => {
    const { title, body } = splitNote(SHAVING)
    expect(title).toBe('Гоління — перехід на T-подібну бритву')
    expect(body.startsWith('ПОКУПКИ')).toBe(true)
    expect(body.endsWith('мило.')).toBe(true)
  })

  test('leading blank lines are not the title', () => {
    expect(splitNote('\n\n  Call the landlord  \nabout the lease')).toEqual({
      title: 'Call the landlord',
      body: 'about the lease',
    })
  })

  test('a title alone', () => {
    expect(splitNote('Buy a lamp')).toEqual({ title: 'Buy a lamp', body: '' })
  })

  test('nothing is nothing', () => {
    expect(splitNote('   \n ')).toEqual({ title: '', body: '' })
  })

  test('joinNote puts it back', () => {
    const { title, body } = splitNote(SHAVING)
    expect(splitNote(joinNote(title, body))).toEqual({ title, body })
  })
})

describe('continueList — Enter on a list line', () => {
  test('carries the marker to the next line', () => {
    const value = '* Blades'
    expect(continueList(value, value.length)).toEqual({
      value: '* Blades\n* ',
      caret: 11,
    })
  })

  test('keeps the indent', () => {
    const value = '  - soap'
    expect(continueList(value, value.length)?.value).toBe('  - soap\n  - ')
  })

  test('counts a numbered list up', () => {
    const value = '1. shower\n2. no pressure'
    expect(continueList(value, value.length)?.value).toBe(
      '1. shower\n2. no pressure\n3. ',
    )
  })

  test('Enter on an empty item ends the list', () => {
    const value = '* soap\n* '
    expect(continueList(value, value.length)).toEqual({
      value: '* soap\n',
      caret: 7,
    })
  })

  test('not a list line is plain Enter', () => {
    expect(continueList('ТЕХНІКА', 7)).toBeNull()
  })
})

describe('indentLine — Tab and Shift+Tab', () => {
  test('in and out by two spaces', () => {
    const indented = indentLine('* soap', 6, false)
    expect(indented).toEqual({ value: '  * soap', caret: 8 })
    expect(indentLine(indented.value, indented.caret, true)).toEqual({
      value: '* soap',
      caret: 6,
    })
  })
})

describe('parseBlocks — the reading view', () => {
  const blocks = parseBlocks(splitNote(SHAVING).body)

  test('capital-led lines are headings, with or without lowercase after', () => {
    expect(blocks.filter((b) => b.type === 'heading')).toEqual([
      { type: 'heading', text: 'ПОКУПКИ (~70-80€ на старті)' },
      { type: 'heading', text: 'ТЕХНІКА' },
    ])
  })

  test('a bullet that starts with a capitalised word is still a bullet', () => {
    const items = blocks.filter((b) => b.type === 'item')
    expect(items).toHaveLength(4)
    expect(items[3]).toMatchObject({
      text: expect.stringMatching(/^НЕ тиснути/),
    })
  })

  test('an ordinary sentence is a paragraph', () => {
    expect(blocks.at(-1)).toEqual({
      type: 'paragraph',
      text: 'Далі: ~15€/рік на леза й мило.',
    })
  })

  test('two blank lines are one gap', () => {
    const gaps = blocks.filter((b) => b.type === 'gap')
    expect(gaps.length).toBe(4)
    blocks.forEach((b, i) => {
      if (b.type === 'gap') expect(blocks[i + 1]?.type).not.toBe('gap')
    })
  })

  test('markdown headings and numbered items', () => {
    expect(parseBlocks('## Plan\n1. one\n  2. two')).toEqual([
      { type: 'heading', text: 'Plan' },
      { type: 'item', text: 'one', depth: 0, ordered: '1.' },
      { type: 'item', text: 'two', depth: 1, ordered: '2.' },
    ])
  })

  test('a short capital like "OK" is not a heading', () => {
    expect(parseBlocks('OK then')[0].type).toBe('paragraph')
  })
})
