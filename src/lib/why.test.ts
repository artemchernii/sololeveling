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
    ).toBe(
      'Bill — pays Navegante (you made it a bill): same payee, about the same amount.',
    )
    expect(
      whyLine({
        ...base,
        bill: { name: 'Vodafone', found: true, varies: true, salary: false },
      }),
    ).toContain('found in your statements): same payee, any amount')
    expect(
      whyLine({
        ...base,
        kind: 'income',
        bill: { name: 'BNP', found: true, varies: false, salary: true },
      }),
    ).toBe('Salary — BNP, every month.')
  })

  it('lent, moves, and where a group came from', () => {
    expect(whyLine({ ...base, lent: true })).toContain('Lent — you said so')
    expect(whyLine({ ...base, kind: 'income', lent: true, name: 'Ivan' })).toBe(
      'Paid back — money from Ivan after you lent. Not money in.',
    )
    expect(whyLine({ ...base, kind: 'move' })).toContain('own accounts')
    expect(whyLine({ ...base, category: 'groceries', hisRule: true })).toBe(
      'Groceries — you filed Continente there; the next ones go there too.',
    )
    expect(
      whyLine({ ...base, category: 'groceries', shop: 'Continente' }),
    ).toBe('Groceries — Continente is a shop the app knows.')
    expect(whyLine({ ...base, category: 'fun' })).toContain("reader's guess")
    expect(whyLine(base)).toContain('Not filed')
  })
})
