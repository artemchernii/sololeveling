import { describe, expect, test } from 'vitest'

import { parseReading, readableKind, readingPrompt } from './reading'

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
    text: ' Pretérito perfeito \n1. Eu fui ',
    summary: 'The class covered the past tense.',
    conclusion: 'Practise irregular verbs.',
    words: [
      { term: 'fui', meaning: 'I went / I was' },
      { term: '  ', meaning: 'blank terms are dropped' },
      'not an object',
    ],
  }

  test('a good answer, trimmed, blank and broken words dropped', () => {
    const out = parseReading(JSON.stringify(good))
    expect(out).toEqual({
      ok: true,
      reading: {
        text: 'Pretérito perfeito \n1. Eu fui',
        summary: 'The class covered the past tense.',
        conclusion: 'Practise irregular verbs.',
        words: [{ term: 'fui', meaning: 'I went / I was' }],
      },
    })
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
