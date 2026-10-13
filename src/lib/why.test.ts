import { describe, expect, it } from 'vitest'

import { whyLine } from './why'
import type { WhyFacts } from './why'

const base: WhyFacts = {
  kind: 'expense',
  category: null,
  bill: null,
  lent: false,
  name: 'Continente',
  hisRule: false,
  shop: null,
}

describe('whyLine', () => {
  it('says the bill a row pays, and how the bill came to be', () => {
    expect(
      whyLine({
        ...base,
        bill: { name: 'Navegante', found: false, varies: false, salary: false },
      }),
    ).toBe('Bill: Navegante. Added by hand.')
    expect(
      whyLine({
        ...base,
        bill: { name: 'Vodafone', found: true, varies: true, salary: false },
      }),
    ).toBe('Bill: Vodafone. Found in the statements. The amount changes.')
    expect(
      whyLine({
        ...base,
        kind: 'income',
        bill: { name: 'BNP', found: true, varies: false, salary: true },
      }),
    ).toBe('Salary from BNP, every month.')
  })

  it('lent, moves, and where a group came from', () => {
    expect(whyLine({ ...base, lent: true })).toBe(
      'Lent. Not counted as spending.',
    )
    expect(whyLine({ ...base, kind: 'income', lent: true, name: 'Ivan' })).toBe(
      'Paid back by Ivan. Not counted as income.',
    )
    expect(whyLine({ ...base, kind: 'move' })).toContain('own accounts')
    expect(whyLine({ ...base, category: 'groceries', hisRule: true })).toBe(
      'Groceries: set by hand for every Continente payment.',
    )
    expect(
      whyLine({ ...base, category: 'groceries', shop: 'Continente' }),
    ).toBe('Groceries: Continente is a known shop.')
    expect(whyLine({ ...base, category: 'fun' })).toBe(
      'Fun: read from the statement.',
    )
    expect(whyLine(base)).toBe('No group yet.')
  })
})
