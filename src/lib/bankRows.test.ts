import { expect, test } from 'vitest'

import { bankRow, dateFrom, rowsSince } from './bankRows'
import type { BankTx } from './bankRows'

const NOW = Date.UTC(2026, 9, 12, 20)
const tx = (over: Partial<BankTx>): BankTx => ({
  status: 'BOOK',
  amount: '25.00',
  currency: 'EUR',
  indicator: 'DBIT',
  bookingDate: '2026-10-12',
  remittance: ['TRF P/ ANDREI PAVLOV'],
  ...over,
})

test('money out is negative, named by who was paid', () => {
  expect(bankRow(tx({ creditor: 'Andrei Pavlov' }), NOW)).toEqual({
    occurredAt: Date.UTC(2026, 9, 12, 12),
    merchant: 'Andrei Pavlov',
    raw: 'TRF P/ ANDREI PAVLOV',
    amount: -25,
    currency: 'EUR',
    pending: false,
    self: false,
  })
})

test('money in is positive, named by who paid; no name → the bank’s words', () => {
  expect(
    bankRow(tx({ indicator: 'CRDT', debtor: 'ACME LDA', amount: '1900' }), NOW),
  ).toMatchObject({ amount: 1900, merchant: 'ACME LDA' })
  expect(bankRow(tx({}), NOW)).toMatchObject({
    merchant: 'TRF P/ ANDREI PAVLOV',
  })
  expect(bankRow(tx({ remittance: [] }), NOW)).toMatchObject({
    merchant: 'Payment',
    raw: 'Payment',
  })
})

test('pending money is a pending row; a cancelled one, one with no day or no amount is none', () => {
  expect(bankRow(tx({ status: 'PDNG' }), NOW)?.pending).toBe(true)
  expect(
    bankRow(
      tx({
        status: 'PDNG',
        bookingDate: undefined,
        transactionDate: '2026-10-11',
      }),
      NOW,
    )?.occurredAt,
  ).toBe(Date.UTC(2026, 9, 11, 12))
  expect(bankRow(tx({ status: 'CNCL' }), NOW)).toBeNull()
  expect(bankRow(tx({ bookingDate: undefined }), NOW)).toBeNull()
  expect(bankRow(tx({ amount: 'x' }), NOW)).toBeNull()
  expect(bankRow(tx({ amount: '0.00' }), NOW)).toBeNull()
})

test('the value day stands in for a missing booking day', () => {
  expect(
    bankRow(tx({ bookingDate: undefined, valueDate: '2026-10-09' }), NOW)
      ?.occurredAt,
  ).toBe(Date.UTC(2026, 9, 9, 12))
})

test('a row is never dated after the bank answered', () => {
  const morning = Date.UTC(2026, 9, 12, 8)
  expect(bankRow(tx({}), morning)?.occurredAt).toBe(morning)
})

test('asked from the day before the balance held', () => {
  expect(dateFrom(Date.UTC(2026, 9, 11, 14))).toBe('2026-10-10')
})

test('booked rows from the held balance on, every pending one; newest first', () => {
  const held = Date.UTC(2026, 9, 11, 14)
  const rows = rowsSince(
    [
      tx({ bookingDate: '2026-10-09', amount: '700' }),
      tx({ bookingDate: '2026-10-11', amount: '3' }),
      tx({ bookingDate: '2026-10-12', amount: '25' }),
      tx({ bookingDate: '2026-10-12', amount: '9', status: 'PDNG' }),
      tx({ bookingDate: '2026-10-09', amount: '4', status: 'PDNG' }),
    ],
    held,
    NOW,
  )
  expect(rows.map((r) => r.amount)).toEqual([-25, -9, -3, -4])
})
