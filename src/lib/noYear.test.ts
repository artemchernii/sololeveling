import { describe, expect, test } from 'vitest'

import { dayToMs } from './intake'
import { notAhead, yearlessToThisYear } from './noYear'
import type { ReadTransaction } from './intake'

const day = (iso: string) => dayToMs(iso) as number
const row = (iso: string, amount: number): ReadTransaction => ({
  occurredAt: day(iso),
  merchant: 'x',
  raw: 'x',
  amount,
  currency: 'EUR',
  pending: false,
  self: false,
})
/* 11 Oct 2026, 11:13 — the morning ActivoBank's screen was dropped. */
const NOW = new Date(2026, 9, 11, 11, 13).getTime()

describe('yearlessToThisYear', () => {
  test('a bank screen with no year, its newest row booked tomorrow: this year, not last', () => {
    const r = yearlessToThisYear(
      {
        kind: 'transactions' as const,
        title: 'ActivoBank · EUR · 1 Oct → 12 Oct 2025',
        transactions: [row('2025-10-12', -25), row('2025-10-01', -2.25)],
        balance: { value: 90.35, asOf: day('2025-10-12') },
      },
      NOW,
    )
    expect(r.transactions.map((t) => t.occurredAt)).toEqual([
      day('2026-10-12'),
      day('2026-10-01'),
    ])
    expect(r.balance).toEqual({ value: 90.35, asOf: day('2026-10-12') })
    expect(r.title).toBe('ActivoBank · EUR · 1 Oct → 12 Oct 2026')
  })

  test('a screen that really is a year old stays where it is', () => {
    const old = {
      kind: 'transactions' as const,
      title: 'ActivoBank · 1 Oct → 9 Oct 2025',
      transactions: [row('2025-10-09', -25), row('2025-10-01', -2.25)],
      balance: { value: 90.35, asOf: day('2025-10-09') },
    }
    expect(yearlessToThisYear(old, NOW)).toBe(old)
    /* A year ago to the day is not "tomorrow". */
    const today = { ...old, transactions: [row('2025-10-11', -25)] }
    expect(yearlessToThisYear(today, NOW)).toBe(today)
  })

  test('this year’s rows, a balance read now, and other kinds are left alone', () => {
    const fresh = {
      kind: 'transactions' as const,
      title: 'ActivoBank · 1 Oct → 10 Oct 2026',
      transactions: [row('2026-10-10', -25)],
      balance: { value: 90.35, asOf: NOW },
    }
    expect(yearlessToThisYear(fresh, NOW)).toBe(fresh)
    const trades = { ...fresh, kind: 'trades' as const, transactions: [] }
    expect(yearlessToThisYear(trades, NOW)).toBe(trades)
  })

  test('a balance with no day of its own keeps the moment it was read', () => {
    const r = yearlessToThisYear(
      {
        kind: 'transactions' as const,
        title: 'ActivoBank',
        transactions: [row('2025-10-12', -25)],
        balance: { value: 90.35, asOf: NOW },
      },
      NOW,
    )
    expect(r.transactions[0].occurredAt).toBe(day('2026-10-12'))
    expect(r.balance.asOf).toBe(NOW)
  })
})

describe('notAhead', () => {
  const at = (d: number) => new Date(2026, 9, d, 12).getTime()
  const sunday = new Date(2026, 9, 11, 13, 40).getTime()
  const bought = (d: number) => ({
    occurredAt: at(d),
    merchant: 'x',
    raw: 'x',
    amount: -25,
    currency: 'EUR',
    pending: false,
    self: false,
  })
  const screen = {
    kind: 'transactions' as const,
    title: 'ActivoBank',
    transactions: [bought(12), bought(10)],
    balance: { value: 90.35, asOf: at(12) },
  }

  test('a row and a balance dated tomorrow are today’s', () => {
    const r = notAhead(screen, sunday)
    expect(r.transactions.map((t) => t.occurredAt)).toEqual([at(11), at(10)])
    expect(r.balance.asOf).toBe(at(11))
  })

  test('nothing ahead: left as it is, also read in the morning', () => {
    const monday = new Date(2026, 9, 12, 8).getTime()
    expect(notAhead(screen, monday)).toBe(screen)
  })
})
