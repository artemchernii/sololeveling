import { describe, expect, test } from 'vitest'

import { verbsFor } from './index'
import {
  dePresent,
  deStrongPast,
  deWeakPast,
  enThird,
  ptRegular,
} from './types'

const table = (code: string, verb: string, tense: string) =>
  verbsFor(code)
    .find((v) => v.verb === verb)
    ?.tenses.find((t) => t.name === tense)
    ?.rows.map((r) => r[1])

describe('Portuguese regulars', () => {
  test('-ar, -er, -ir in the present', () => {
    expect(ptRegular('falar', 'presente')).toEqual([
      'falo',
      'falas',
      'fala',
      'falamos',
      'falam',
    ])
    expect(ptRegular('comer', 'presente')).toEqual([
      'como',
      'comes',
      'come',
      'comemos',
      'comem',
    ])
    expect(ptRegular('partir', 'presente')).toEqual([
      'parto',
      'partes',
      'parte',
      'partimos',
      'partem',
    ])
  })
  test('European perfeito keeps the accent on falámos', () => {
    expect(ptRegular('falar', 'perfeito')[3]).toBe('falámos')
    expect(ptRegular('viver', 'perfeito')).toEqual([
      'vivi',
      'viveste',
      'viveu',
      'vivemos',
      'viveram',
    ])
  })
  test('the subjunctive swaps the vowel', () => {
    expect(ptRegular('falar', 'conjuntivo')[0]).toBe('fale')
    expect(ptRegular('abrir', 'conjuntivo')[0]).toBe('abra')
  })
  test('irregulars override only what breaks', () => {
    expect(table('pt-PT', 'ser', 'Presente')).toEqual([
      'sou',
      'és',
      'é',
      'somos',
      'são',
    ])
    expect(table('pt-PT', 'fazer', 'Imperfeito')?.[0]).toBe('fazia')
    expect(table('pt-PT', 'ir', 'Imperfeito')?.[0]).toBe('ia')
    expect(table('pt-PT', 'ver', 'Imperfeito')?.[3]).toBe('víamos')
  })
})

describe('German', () => {
  test('weak verbs, with the extra e after -t / -d', () => {
    expect(dePresent('machen')).toEqual([
      'mache',
      'machst',
      'macht',
      'machen',
      'macht',
      'machen',
    ])
    expect(dePresent('arbeiten')[1]).toBe('arbeitest')
    expect(dePresent('wohnen')[1]).toBe('wohnst')
    expect(deWeakPast('arbeiten')[0]).toBe('arbeitete')
    expect(table('de', 'arbeiten', 'Perfekt')?.[0]).toBe('habe gearbeitet')
  })
  test('strong pasts and sein in the Perfekt', () => {
    expect(deStrongPast('fand')).toEqual([
      'fand',
      'fandest',
      'fand',
      'fanden',
      'fandet',
      'fanden',
    ])
    expect(deStrongPast('aß')[1]).toBe('aßest')
    expect(table('de', 'gehen', 'Perfekt')?.[0]).toBe('bin gegangen')
    expect(table('de', 'fahren', 'Präsens')?.[2]).toBe('fährt')
  })
})

describe('English', () => {
  test('he / she / it', () => {
    expect(enThird('go')).toBe('goes')
    expect(enThird('fly')).toBe('flies')
    expect(enThird('catch')).toBe('catches')
    expect(enThird('have')).toBe('has')
    expect(enThird('buy')).toBe('buys')
  })
})

describe('every language has verbs, and every table is whole', () => {
  test.each(['pt-PT', 'en', 'de'])('%s', (code) => {
    const verbs = verbsFor(code)
    expect(verbs.length).toBeGreaterThan(40)
    expect(new Set(verbs.map((v) => v.verb)).size).toBe(verbs.length)
    for (const v of verbs) {
      for (const t of v.tenses) {
        for (const [, form] of t.rows) expect(form.length).toBeGreaterThan(0)
      }
    }
  })
})
