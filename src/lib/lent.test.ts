import { describe, expect, it } from 'vitest'

import { backFor, personWords } from './lent'
import type { LentRow } from './lent'

/* His shape (4 Oct): €100 out by MB WAY, €100 back by transfer. Names
   made up: the repo is public. */
const at = (m: number, d: number) => Date.UTC(2026, m, d, 12)
const row = (over: Partial<LentRow>): LentRow => ({
  id: 'r',
  kind: 'expense',
  amount: 100,
  t: at(8, 28),
  line: 'TRF MB WAY P/ IVAN PETROV',
  lent: false,
  ...over,
})

describe('personWords', () => {
  it('keeps the name, drops how the bank moved it', () => {
    expect(personWords('TRF MB WAY P/ IVAN PETROV')).toEqual(['IVAN', 'PETROV'])
    expect(personWords('TRF. P/O IVAN PETROV')).toEqual(['IVAN', 'PETROV'])
  })
})

describe('backFor', () => {
  it('finds the money back from the same person, after the lending', () => {
    expect(
      backFor([
        row({ id: 'out', lent: true }),
        row({
          id: 'back',
          kind: 'income',
          t: at(9, 1),
          line: 'TRF. P/O IVAN PETROV',
        }),
      ]),
    ).toEqual(['back'])
  })

  it('never takes more than was lent, money from someone else, or money before', () => {
    expect(
      backFor([
        row({ id: 'early', kind: 'income', t: at(8, 1) }),
        row({ id: 'out', lent: true }),
        row({
          id: 'other',
          kind: 'income',
          t: at(9, 1),
          line: 'TRF P/O MARIA COSTA',
        }),
        row({ id: 'more', kind: 'income', amount: 150, t: at(9, 2) }),
        row({ id: 'half', kind: 'income', amount: 60, t: at(9, 3) }),
        row({ id: 'rest', kind: 'income', amount: 40, t: at(9, 4) }),
        row({ id: 'extra', kind: 'income', amount: 10, t: at(9, 5) }),
      ]),
    ).toEqual(['half', 'rest'])
  })

  it('nothing lent, nothing paid back', () => {
    expect(
      backFor([row({}), row({ id: 'in', kind: 'income', t: at(9, 1) })]),
    ).toEqual([])
  })
})
