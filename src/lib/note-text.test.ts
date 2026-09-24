import { describe, expect, test } from 'vitest'

import {
  continueList,
  fencePaste,
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
      { type: 'heading', text: 'ПОКУПКИ (~70-80€ на старті)', level: 3 },
      { type: 'heading', text: 'ТЕХНІКА', level: 3 },
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
      { type: 'heading', text: 'Plan', level: 2 },
      { type: 'item', text: 'one', depth: 0, ordered: '1.' },
      { type: 'item', text: 'two', depth: 1, ordered: '2.' },
    ])
  })

  test('a short capital like "OK" is not a heading', () => {
    expect(parseBlocks('OK then')[0].type).toBe('paragraph')
  })
})

describe('parseBlocks — a fenced block is kept exactly as it was pasted', () => {
  test('the lines between the fences become one block', () => {
    const blocks = parseBlocks(
      '```\nYou are a helpful assistant.\nBe terse.\n```',
    )
    expect(blocks).toEqual([
      { type: 'fence', text: 'You are a helpful assistant.\nBe terse.' },
    ])
  })

  test('every space and every blank line survives', () => {
    /* The whole point: a prompt copied back out has to be the prompt that
       went in. Indentation and blank lines are part of it. */
    const body = '```\n  indented\n\n    more\n```'
    const blocks = parseBlocks(body)
    expect(blocks).toEqual([{ type: 'fence', text: '  indented\n\n    more' }])
  })

  test('a list inside a fence stays text, not bullets', () => {
    const blocks = parseBlocks('```\n- one\n- two\n```')
    expect(blocks).toEqual([{ type: 'fence', text: '- one\n- two' }])
  })

  test('a heading inside a fence stays text', () => {
    const blocks = parseBlocks('```\n# Not a heading\nПОКУПКИ\n```')
    expect(blocks).toEqual([
      { type: 'fence', text: '# Not a heading\nПОКУПКИ' },
    ])
  })

  test('text around a fence is parsed as usual', () => {
    const blocks = parseBlocks('Before\n\n```\nprompt\n```\n\n- after')
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Before' },
      { type: 'gap' },
      { type: 'fence', text: 'prompt' },
      { type: 'gap' },
      { type: 'item', text: 'after', depth: 0, ordered: null },
    ])
  })

  test('two fences are two blocks', () => {
    const blocks = parseBlocks('```\none\n```\n```\ntwo\n```')
    expect(blocks).toEqual([
      { type: 'fence', text: 'one' },
      { type: 'fence', text: 'two' },
    ])
  })

  test('a fence that is never closed still ends the note', () => {
    /* Half-typed, or pasted without its closing line. Swallowing the rest is
       better than dropping it, and better than rendering ``` as a paragraph. */
    const blocks = parseBlocks('```\nstill writing\nand more')
    expect(blocks).toEqual([{ type: 'fence', text: 'still writing\nand more' }])
  })

  test('an empty fence is no block at all', () => {
    expect(parseBlocks('```\n```')).toEqual([])
  })

  test('a fence with a language after the ticks is still a fence', () => {
    const blocks = parseBlocks('```ts\nconst a = 1\n```')
    expect(blocks).toEqual([{ type: 'fence', text: 'const a = 1' }])
  })
})

describe('parseBlocks — a line that is only a YouTube link becomes a video', () => {
  test('a link alone on its line', () => {
    expect(parseBlocks('https://youtu.be/dQw4w9WgXcQ')).toEqual([
      { type: 'video', id: 'dQw4w9WgXcQ' },
    ])
  })

  test('a link with words around it stays a paragraph', () => {
    const blocks = parseBlocks('watch https://youtu.be/dQw4w9WgXcQ later')
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'watch https://youtu.be/dQw4w9WgXcQ later' },
    ])
  })

  test('a link inside a fence is text, not a video', () => {
    /* A fence is verbatim. A prompt that mentions a video must not sprout a
       player in the middle of it. */
    expect(parseBlocks('```\nhttps://youtu.be/dQw4w9WgXcQ\n```')).toEqual([
      { type: 'fence', text: 'https://youtu.be/dQw4w9WgXcQ' },
    ])
  })

  test('a link in a list item stays a list item', () => {
    const blocks = parseBlocks('- https://youtu.be/dQw4w9WgXcQ')
    expect(blocks).toEqual([
      {
        type: 'item',
        text: 'https://youtu.be/dQw4w9WgXcQ',
        depth: 0,
        ordered: null,
      },
    ])
  })

  test('a link to something else stays a paragraph', () => {
    expect(parseBlocks('https://example.com/watch?v=dQw4w9WgXcQ')).toEqual([
      { type: 'paragraph', text: 'https://example.com/watch?v=dQw4w9WgXcQ' },
    ])
  })
})

describe('fencePaste — a long paste wraps itself so it can be copied back out', () => {
  test('three or more lines are wrapped', () => {
    expect(fencePaste('one\ntwo\nthree')).toBe('```\none\ntwo\nthree\n```')
  })

  test('two lines are left alone — that is a sentence that wrapped', () => {
    expect(fencePaste('one\ntwo')).toBeNull()
  })

  test('one line is left alone however long it is', () => {
    expect(fencePaste('x'.repeat(2000))).toBeNull()
  })

  test('a pasted link is never wrapped', () => {
    /* It would stop being a video, which is the other half of this row. */
    expect(fencePaste('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
  })

  test('blank lines count as lines, and survive the wrapping', () => {
    expect(fencePaste('one\n\ntwo')).toBe('```\none\n\ntwo\n```')
  })

  test('trailing blank lines do not make a two-line paste long', () => {
    /* Copying a paragraph often brings a trailing newline. That is still one
       line of text, and wrapping it would be the annoying case. */
    expect(fencePaste('one\n\n')).toBeNull()
    expect(fencePaste('one\ntwo\n')).toBeNull()
  })

  test('text already fenced is not fenced twice', () => {
    const already = '```\none\ntwo\nthree\n```'
    expect(fencePaste(already)).toBeNull()
  })

  test('nothing, and whitespace, are left alone', () => {
    expect(fencePaste('')).toBeNull()
    expect(fencePaste('\n\n\n')).toBeNull()
  })

  test('carriage returns do not change the count', () => {
    expect(fencePaste('one\r\ntwo\r\nthree')).toBe('```\none\ntwo\nthree\n```')
  })
})
