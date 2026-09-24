import { describe, expect, test } from 'vitest'

import {
  insertLink,
  linksIn,
  parseInline,
  toggleCode,
  toggleHeading,
  toggleList,
  toggleWrap,
} from './note-format'

/** `a[b]c` → the text and the selection, so a case reads like the screen. */
function sel(marked: string) {
  const from = marked.indexOf('[')
  const to = marked.indexOf(']') - 1
  return { value: marked.replace('[', '').replace(']', ''), from, to }
}
function show(e: { value: string; from: number; to: number }) {
  return (
    e.value.slice(0, e.from) +
    '[' +
    e.value.slice(e.from, e.to) +
    ']' +
    e.value.slice(e.to)
  )
}

describe('headings', () => {
  test('puts a level on the line, replaces another, takes the same off', () => {
    const s = sel('Title\nSec[]tion')
    const h2 = toggleHeading(s.value, s.from, s.to, 2)
    expect(h2.value).toBe('Title\n## Section')
    const h1 = toggleHeading(h2.value, h2.from, h2.to, 1)
    expect(h1.value).toBe('Title\n# Section')
    expect(toggleHeading(h1.value, h1.from, h1.to, 1).value).toBe(
      'Title\nSection',
    )
  })

  test('a list item becomes a heading, not a bullet with hashes', () => {
    expect(toggleHeading('- item', 3, 3, 3).value).toBe('### item')
  })
})

describe('bold, italic, inline code', () => {
  test('wraps the selection and keeps it selected', () => {
    const s = sel('a [word] b')
    expect(show(toggleWrap(s.value, s.from, s.to, '**'))).toBe('a **[word]** b')
  })

  test('unwraps what is already wrapped', () => {
    const s = sel('a **[word]** b')
    expect(show(toggleWrap(s.value, s.from, s.to, '**'))).toBe('a [word] b')
  })

  test('italic does not unwrap the inside of bold', () => {
    const s = sel('a **[word]** b')
    expect(toggleWrap(s.value, s.from, s.to, '*').value).toBe('a ***word*** b')
  })

  test('with nothing selected, the pair goes in around the caret', () => {
    expect(show(toggleWrap('ab', 1, 1, '`'))).toBe('a`[]`b')
  })
})

describe('lists', () => {
  test('marks every selected line, and unmarks them', () => {
    const s = sel('[one\ntwo]')
    const on = toggleList(s.value, s.from, s.to)
    expect(on.value).toBe('- one\n- two')
    expect(toggleList(on.value, on.from, on.to).value).toBe('one\ntwo')
  })
})

describe('code', () => {
  test('several lines become a fenced block', () => {
    const s = sel('[a\nb]')
    expect(toggleCode(s.value, s.from, s.to).value).toBe('```\na\nb\n```')
  })
})

describe('links', () => {
  test('selected words become the text, with the url left to type', () => {
    const s = sel('see [docs]')
    expect(show(insertLink(s.value, s.from, s.to))).toBe(
      'see [docs]([https://])',
    )
  })

  test('a selected address becomes the url', () => {
    const s = sel('[https://x.com]')
    expect(insertLink(s.value, s.from, s.to).value).toBe('[](https://x.com)')
  })
})

describe('reading a line', () => {
  test('bold, italic, code and a link', () => {
    expect(parseInline('a **b** *c* `d*e*` [f](https://g.io)')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'd*e*' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'f', href: 'https://g.io' },
    ])
  })

  test('a bare address is a link, without the full stop after it', () => {
    expect(parseInline('see https://x.com/a.')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', text: 'https://x.com/a', href: 'https://x.com/a' },
      { type: 'text', text: '.' },
    ])
  })

  test('a lone asterisk or a price is just text', () => {
    expect(parseInline('5 * 3 = 15, ~70-80€')).toEqual([
      { type: 'text', text: '5 * 3 = 15, ~70-80€' },
    ])
  })

  test('the Links row: each address once, by its host', () => {
    expect(
      linksIn(
        '[a](https://www.x.com/1)\nhttps://y.org and https://www.x.com/1',
      ),
    ).toEqual([
      { href: 'https://www.x.com/1', host: 'x.com' },
      { href: 'https://y.org', host: 'y.org' },
    ])
  })
})
