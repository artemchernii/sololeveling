import { describe, expect, test } from 'vitest'

import {
  categoryFromText,
  categoryLabel,
  euros,
  isEuroAmount,
  SPEND_CATEGORIES,
} from './money'

describe('money categories', () => {
  test('nine to spend on, his pick', () => {
    expect(SPEND_CATEGORIES.map((c) => c.id)).toEqual([
      'groceries',
      'eating out',
      'transport',
      'home',
      'health',
      'fun',
      'clothes',
      'travel',
      'other',
    ])
  })

  test('ids fit logs.setCategory: lower case, at most 24', () => {
    for (const c of SPEND_CATEGORIES) {
      expect(c.id).toBe(c.id.toLowerCase())
      expect(c.id.length).toBeLessThanOrEqual(24)
    }
  })

  test('the first word only, any case', () => {
    expect(categoryFromText('expense', 'Eating out with Ana')).toBe(
      'eating out',
    )
    expect(categoryFromText('expense', 'RENT september')).toBe('home')
    expect(categoryFromText('expense', 'with Ana at a cafe')).toBeUndefined()
    expect(categoryFromText('expense', undefined)).toBeUndefined()
    expect(categoryFromText('expense', '   ')).toBeUndefined()
  })

  test('labels, and unsorted for none', () => {
    expect(categoryLabel('expense', 'home')).toBe('Home & bills')
    expect(categoryLabel('expense', null)).toBe('Unsorted')
    expect(categoryLabel('expense', 'books')).toBe('books')
  })
})

describe('isEuroAmount', () => {
  test('euros with a value, and nothing else', () => {
    expect(isEuroAmount({ value: 4, unit: 'eur' })).toBe(true)
    expect(isEuroAmount({ value: 4, unit: 'usd' })).toBe(false)
    expect(isEuroAmount({ value: 4 })).toBe(false)
    expect(isEuroAmount({ unit: 'eur' })).toBe(false)
  })
})

describe('euros', () => {
  test('cents only when there are some', () => {
    expect(euros(48)).toBe('€48')
    expect(euros(12.5)).toBe('€12.50')
    expect(euros(1240)).toBe('€1,240')
  })
})
