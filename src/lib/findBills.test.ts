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

  it('finds the gym every two weeks: each payment on its own day', () => {
    const rows = [
      out('GYM', 6, 7, 5),
      out('GYM', 6, 7, 19),
      out('GYM', 6, 8, 2),
      out('GYM', 6, 8, 16),
      out('GYM', 6, 8, 30),
    ]
    expect(findBills(rows, [], NOW)).toEqual([
      expect.objectContaining({
        key: 'GYM',
        amount: 6,
        everyWeeks: 2,
        anchor: at(8, 30),
      }),
    ])
  })

  it('finds a phone topped up when it runs out: the range of its months', () => {
    const rows = [
      out('PHONE', 10, 7, 3),
      out('PHONE', 10, 7, 21),
      out('PHONE', 10, 8, 1),
      out('PHONE', 10, 8, 14),
      out('PHONE', 10, 8, 29),
    ]
    expect(findBills(rows, [], NOW)).toEqual([
      expect.objectContaining({ amount: 25, lo: 20, hi: 30, varies: true }),
    ])
    /* Struck out once: any amount of it stays known. */
    expect(
      findBills(rows, [{ key: 'PHONE', amount: 1, varies: true }], NOW),
    ).toEqual([])
  })

  it('never finds PayPal: Preply one month, a jacket the next', () => {
    const rows = [
      out('PAYPAL 5D4J2254EVNWL', 122, 7, 4),
      out('PAYPAL 5D4J2254EVNWL', 172, 7, 31),
      out('PAYPAL 5D4J2254EVNWL', 121, 8, 1),
      out('PAYPAL 5D4J2254EVNWL', 4.77, 8, 4),
    ]
    expect(findBills(rows, [], NOW)).toEqual([])
  })

  it('wants €10 a month from one that varies, and both last months', () => {
    expect(
      findBills(
        [
          out('TOLL', 2.25, 7, 3),
          out('TOLL', 3, 7, 17),
          out('TOLL', 2.5, 8, 9),
        ],
        [],
        NOW,
      ),
    ).toEqual([])
    expect(
      findBills(
        [out('X', 20, 6, 3), out('X', 30, 6, 17), out('X', 25, 8, 9)],
        [],
        NOW,
      ),
    ).toEqual([])
  })

  it('finds the condominium from its first payment, by what the bank wrote', () => {
    const [b] = findBills(
      [
        out('COND PRCRT CASTRO', 175, 9, 2, {
          name: 'TRF P/ COND P S PRCRT V CASTRO ALMEIDA 4',
          category: 'home',
        }),
      ],
      [],
      NOW,
    )
    expect(b).toMatchObject({
      name: 'Condominium',
      amount: 175,
      day: 2,
      category: 'home',
      asksMonths: true,
    })
    expect(billNames([{ key: b.key, name: b.name, kind: 'expense' }])).toEqual([
      'Condominium',
    ])
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
    /* Fuel at one station on the 10th and the 9th (his BP, 4 Oct). */
    expect(
      findBills(
        [
          out('EST SERVICO', 61, 7, 10, { category: 'car' }),
          out('EST SERVICO', 57, 8, 9, { category: 'car' }),
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

  it('offers a pass: the same amount about a month apart, whoever took it', () => {
    const list = likelyBills(
      [
        row('METRO', 40, 8, 1, 'transport'),
        row('SANTANDER', 40, 8, 28, 'other'),
        row('CAFE', 4, 8, 2, 'eating out'),
        row('CAFE', 4, 9, 2, 'eating out'),
      ],
      [],
    )
    expect(list.map((l) => l.key).sort()).toEqual(['METRO', 'SANTANDER'])
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
