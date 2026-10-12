import { expect, test } from 'vitest'

import { groupHint } from './groupHint'
import { SPEND_CATEGORIES } from './money'

test('a place that says what it is gets a hint', () => {
  expect(groupHint('English Bar 42')).toBe('fun')
  expect(groupHint('Fulai Restaurante')).toBe('eating out')
  expect(groupHint('Copenhagen Coffee Lab')).toBe('eating out')
  expect(groupHint('FARMÁCIA COLOMBO')).toBe('health')
  expect(groupHint('Fcg Pq Estacionamento')).toBe('car')
  expect(groupHint('Rest Yang Guo Fu')).toBe('eating out')
})

test('a name that says nothing gets none; a word inside another is not it', () => {
  expect(groupHint('Loan interest')).toBe(null)
  expect(groupHint('ATITUDES ARROJADAS')).toBe(null)
  expect(groupHint('Barbosa Lda')).toBe(null)
  expect(groupHint('TRF P/ BAR DO ZE')).toBe(null)
  expect(groupHint('')).toBe(null)
})

test('every hint is a group the app has', () => {
  const ids = new Set(SPEND_CATEGORIES.map((c) => c.id))
  for (const name of [
    'bar',
    'cafe',
    'talho',
    'farmacia',
    'parque',
    'taxi',
    'hotel',
    'boutique',
    'escola',
  ])
    expect(
      ids.has(groupHint(name) as (typeof SPEND_CATEGORIES)[number]['id']),
    ).toBe(true)
})
