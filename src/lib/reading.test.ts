import { describe, expect, test } from 'vitest'

import {
  MAX_PAGES,
  pagesRefusal,
  parseReading,
  readableKind,
  readingPrompt,
} from './reading'

describe('readableKind — what the reader can be shown', () => {
  test('a PDF is a document, a photo an image', () => {
    expect(readableKind('application/pdf')).toEqual({
      block: 'document',
      mediaType: 'application/pdf',
    })
    expect(readableKind('image/jpeg')?.block).toBe('image')
    expect(readableKind('image/jpg')?.mediaType).toBe('image/jpeg')
    expect(readableKind('IMAGE/PNG; charset=binary')?.mediaType).toBe(
      'image/png',
    )
  })

  test('anything else is refused, HEIC included', () => {
    expect(readableKind('image/heic')).toBeNull()
    expect(readableKind('text/plain')).toBeNull()
    expect(readableKind('')).toBeNull()
  })
})

describe('parseReading — a bad answer is a failed reading, not a crash', () => {
  const good = {
    title: ' Past tense of ir ',
    kind: 'grammar',
    tags: ['Pretérito', '', 42, 'ir'],
    text: ' Pretérito perfeito \n1. Eu fui ',
    summary: 'The class covered the past tense.',
    conclusion: 'Practise irregular verbs.',
    words: [
      { term: 'fui', meaning: 'I went / I was' },
      { term: '  ', meaning: 'blank terms are dropped' },
      'not an object',
    ],
    examples: [
      {
        sentence: ' É importante que eu estude. ',
        meaning: 'It is important that I study.',
      },
      { sentence: '', meaning: 'blank sentences are dropped' },
    ],
  }

  test('a good answer, trimmed, blank and broken words dropped', () => {
    const out = parseReading(JSON.stringify(good))
    expect(out).toEqual({
      ok: true,
      reading: {
        title: 'Past tense of ir',
        kind: 'grammar',
        tags: ['pretérito', 'ir'],
        text: 'Pretérito perfeito \n1. Eu fui',
        summary: 'The class covered the past tense.',
        conclusion: 'Practise irregular verbs.',
        words: [{ term: 'fui', meaning: 'I went / I was' }],
        examples: [
          {
            sentence: 'É importante que eu estude.',
            meaning: 'It is important that I study.',
          },
        ],
        rules: [],
      },
    })
  })

  test('an unknown kind is other, a missing title is empty — not a failure', () => {
    const out = parseReading(
      JSON.stringify({ ...good, kind: 'poetry', title: undefined }),
    )
    expect(out.ok && [out.reading.kind, out.reading.title]).toEqual([
      'other',
      '',
    ])
  })

  test('rules keep their pattern and at most three examples; a nameless one is dropped', () => {
    const ex = { sentence: 'É bom que venhas.', meaning: "It's good you come." }
    const out = parseReading(
      JSON.stringify({
        ...good,
        rules: [
          {
            name: ' É + adj + que ',
            pattern: 'É + adjetivo + que + conjuntivo',
            explanation: 'Value judgements.',
            examples: [ex, ex, ex, ex],
          },
          { name: '', pattern: 'x', explanation: 'y', examples: [] },
        ],
      }),
    )
    expect(out.ok && out.reading.rules).toEqual([
      {
        name: 'É + adj + que',
        pattern: 'É + adjetivo + que + conjuntivo',
        explanation: 'Value judgements.',
        examples: [ex, ex, ex],
      },
    ])
  })

  test('an answer without examples is still a reading', () => {
    const out = parseReading(JSON.stringify({ ...good, examples: undefined }))
    expect(out.ok && out.reading.examples).toEqual([])
  })

  test('not JSON, not an object, a field missing', () => {
    expect(parseReading('Sure! Here is the summary')).toMatchObject({
      ok: false,
    })
    expect(parseReading('42')).toMatchObject({ ok: false })
    expect(
      parseReading(JSON.stringify({ ...good, summary: undefined })),
    ).toEqual({ ok: false, error: 'The reader left out summary.' })
    expect(parseReading(JSON.stringify({ ...good, words: 'fui' }))).toEqual({
      ok: false,
      error: 'The reader left out words.',
    })
  })

  test('at most twenty words', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      term: `w${i}`,
      meaning: 'm',
    }))
    const out = parseReading(JSON.stringify({ ...good, words: many }))
    expect(out.ok && out.reading.words).toHaveLength(20)
  })
})

test('the prompt names the language it is reading', () => {
  expect(readingPrompt('Portuguese')).toContain('my Portuguese class')
})

describe('pagesRefusal — what can be one sheet', () => {
  const pdf = (mb: number) => ({
    contentType: 'application/pdf',
    size: mb * 1024 * 1024,
  })

  test('one to five readable pages, under the limits', () => {
    expect(pagesRefusal([pdf(1)])).toBeNull()
    expect(pagesRefusal([pdf(4), pdf(4), pdf(4)])).toBeNull()
  })

  test('refused: none, too many (counting pages already there), wrong type, too big', () => {
    expect(pagesRefusal([])).toBe('Choose at least one page.')
    expect(
      pagesRefusal([pdf(1), pdf(1)], Array(MAX_PAGES - 1).fill(pdf(1))),
    ).toBe('A sheet is at most 5 pages.')
    expect(pagesRefusal([{ contentType: 'image/heic', size: 1 }])).toMatch(
      'PDFs and photos',
    )
    expect(pagesRefusal([pdf(11)])).toBe('A page is at most 10 MB.')
    expect(pagesRefusal([pdf(8), pdf(8)], [pdf(8)])).toBe(
      'A sheet is at most 20 MB in all.',
    )
  })
})

test('several pages are read as one sheet, each marked in the text', () => {
  const p = readingPrompt('Portuguese', 3)
  expect(p).toContain('These 3 files are one set of pages')
  expect(p).toContain('— page N —')
})
