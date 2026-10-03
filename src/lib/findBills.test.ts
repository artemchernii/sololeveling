import { describe, expect, it } from 'vitest'

import { billNames, dayGap, findBills, likelyBills } from './findBills'
import type { BillRow } from './findBills'

/* Shapes from his statements (3 Oct), amounts made up: the repo is public. */
const at = (m: number, d: number) => Date.UTC(2026, m, d, 12)
const NOW = at(9, 4)
const out = (key: string, amount: number, m: number, d: number, extra = {}) =>
  ({
    key,
    name: key,
    kind: 'expense',
    amount,
    t: at(m, d),
    ...extra,
  }) as BillRow

describe('findBills', () => {
  it('finds a bill paid on the same day two months running', () => {
    const found = findBills(
      [out('EDP', 30, 7, 25), out('EDP', 30, 8, 25)],
      [],
      NOW,
    )
    expect(found).toEqual([
      expect.objectContaining({ key: 'EDP', day: 25, amount: 30 }),
    ])
  })

  it('takes the latest amount when it moves a little', () => {
    const [bill] = findBills(
      [
        out('SALARY', 2000, 7, 25, { kind: 'income' }),
        out('SALARY', 2050, 8, 25, { kind: 'income' }),
      ],
      [],
      NOW,
    )
    expect(bill).toMatchObject({ kind: 'income', amount: 2050 })
  })

  it('is not fooled by a payee paid twice a month (gym every two weeks)', () => {
    const rows = [
      out('GYM', 6, 7, 5),
      out('GYM', 6, 7, 19),
      out('GYM', 6, 8, 2),
      out('GYM', 6, 8, 16),
      out('GYM', 6, 8, 30),
    ]
    expect(findBills(rows, [], NOW)).toEqual([])
  })

  it('keeps two bills of one payee apart by amount (interest and capital)', () => {
    const rows = [
      out('LOAN', 700, 8, 1),
      out('LOAN', 400, 8, 1),
      out('LOAN', 705, 9, 1),
      out('LOAN', 400, 9, 1),
    ]
    expect(findBills(rows, [], NOW).map((b) => b.amount)).toEqual([400, 705])
  })

  it('wants the days close, across the month end too', () => {
    expect(
      findBills([out('A', 20, 7, 18), out('A', 20, 8, 14)], [], NOW),
    ).toEqual([])
    expect(
      findBills([out('B', 20, 7, 30), out('B', 20, 9, 1)], [], NOW),
    ).toHaveLength(1)
    expect(dayGap(30, 1)).toBe(2)
  })

  it('knows a bill by payee and amount, so the other bill of a payee is still found', () => {
    const rows = [
      out('LOAN', 700, 8, 1),
      out('LOAN', 400, 8, 1),
      out('LOAN', 705, 9, 1),
      out('LOAN', 400, 9, 1),
    ]
    expect(
      findBills(rows, [{ key: 'LOAN', amount: 400 }], NOW).map((b) => b.amount),
    ).toEqual([705])
  })

  it('leaves out known keys, tiny amounts, one-offs and stopped bills', () => {
    expect(
      findBills(
        [out('K', 20, 7, 5), out('K', 20, 8, 5)],
        [{ key: 'K', amount: 20 }],
        NOW,
      ),
    ).toEqual([])
    expect(
      findBills([out('TOLL', 0.5, 7, 17), out('TOLL', 0.5, 8, 15)], [], NOW),
    ).toEqual([])
    expect(findBills([out('ONCE', 90, 8, 5)], [], NOW)).toEqual([])
    expect(
      findBills(
        [
          out('FUEL', 57, 7, 9, { category: 'shopping' }),
          out('FUEL', 58, 8, 9, { category: 'shopping' }),
        ],
        [],
        NOW,
      ),
    ).toEqual([])
    /* Last paid in June: three months old, gone. */
    expect(
      findBills([out('OLD', 9, 4, 3), out('OLD', 9, 5, 3)], [], NOW),
    ).toEqual([])
  })
})

describe('likelyBills', () => {
  const row = (
    key: string,
    amount: number,
    m: number,
    d: number,
    category?: string,
  ) => ({
    ...out(key, amount, m, d, { category }),
    id: `${key}-${m}-${d}`,
  })

  it('offers bill-like payees, biggest first, never everyday spending', () => {
    const list = likelyBills(
      [
        row('INTEREST', 700, 9, 1, 'home'),
        row('INSURANCE', 220, 8, 22, 'home'),
        row('CAFE', 4, 9, 2, 'eating out'),
        row('MYSTERY', 50, 9, 2),
      ],
      [],
    )
    expect(list.map((l) => l.key)).toEqual(['INTEREST', 'INSURANCE'])
    expect(list[0].rowId).toBe('INTEREST-9-1')
  })

  it('folds repeats into one with a count, keeping the latest row', () => {
    const [one] = likelyBills(
      [row('PHONE', 10, 8, 3, 'home'), row('PHONE', 10, 8, 21, 'home')],
      [],
    )
    expect(one).toMatchObject({ times: 2, rowId: 'PHONE-8-21' })
  })

  it('skips payees that are bills already or were struck out', () => {
    expect(
      likelyBills(
        [row('EDP', 30, 8, 25, 'home')],
        [{ key: 'EDP', amount: 30 }],
      ),
    ).toEqual([])
  })
})

describe('billNames', () => {
  it("names a bill by its payee when the bank's word is shared or raw", () => {
    expect(
      billNames([
        {
          key: 'JUROS EMPRESTIMO',
          name: 'Habitação e Rendas',
          kind: 'expense',
        },
        {
          key: 'AMORTIZACAO CAPITAL',
          name: 'Habitação e Rendas',
          kind: 'expense',
        },
        {
          key: 'EST SERVICO VEIGA',
          name: 'COMPRA 2789 EST SERVICO',
          kind: 'expense',
        },
        { key: 'BNP PARIBAS', name: 'Receitas', kind: 'income' },
        { key: 'ANTHROPIC', name: 'Anthropic', kind: 'expense' },
        {
          key: 'EDP COMERCIAL COMERCIALIZACAO',
          name: 'Energia e Água',
          kind: 'expense',
        },
      ]),
    ).toEqual([
      'Juros Emprestimo',
      'Amortizacao Capital',
      'Est Servico',
      'Bnp Paribas',
      'Anthropic',
      'Edp Comercial',
    ])
  })
})
