import { expect, test } from 'vitest'

import {
  approvalDay,
  approvalEnds,
  aspspFor,
  bankWhen,
  canConnect,
  pickAccounts,
  balanceIsBooked,
  pickBalance,
} from './bankLink'

const DAY = 86_400_000

test('a bank is found in the list by name and country', () => {
  const list = [
    { name: 'Revolut', country: 'DE' },
    { name: 'Revolut', country: 'LT' },
    { name: 'ActivoBank', country: 'PT' },
    { name: 'Banco BPI', country: 'PT' },
  ]
  expect(aspspFor('activo', list)?.name).toBe('ActivoBank')
  expect(aspspFor('bpi', list)?.name).toBe('Banco BPI')
  /* No Portuguese Revolut in this list: the Lithuanian one, not Germany's. */
  expect(aspspFor('revolut', list)?.country).toBe('LT')
  expect(aspspFor('trade-republic', list)).toBeNull()
  expect(aspspFor('trading-212', list)).toBeNull()
})

test('only banks the app knows can be connected', () => {
  expect(canConnect('activo')).toBe(true)
  expect(canConnect('trading-212')).toBe(false)
  expect(canConnect(undefined)).toBe(false)
})

test('an approval is asked for as long as the bank allows, 180 days at most', () => {
  const now = Date.UTC(2026, 9, 11)
  expect(approvalEnds(now, { name: 'A', country: 'PT' })).toBe(
    now + 180 * DAY - 60_000,
  )
  expect(
    approvalEnds(now, {
      name: 'A',
      country: 'PT',
      maximum_consent_validity: 90 * 86_400,
    }),
  ).toBe(now + 90 * DAY - 60_000)
  expect(
    approvalEnds(now, {
      name: 'A',
      country: 'PT',
      maximum_consent_validity: 365 * 86_400,
    }),
  ).toBe(now + 180 * DAY - 60_000)
})

const bal = (type: string, amount: string, currency = 'EUR') => ({
  balance_type: type,
  balance_amount: { amount, currency },
})

test('the booked balance is the one kept', () => {
  expect(
    pickBalance([bal('ITAV', '702.49'), bal('CLBD', '727.49')], 'EUR'),
  ).toBe(727.49)
  expect(pickBalance([bal('ITAV', '702.49')], 'EUR')).toBe(702.49)
  expect(pickBalance([bal('OTHR', '5.00')], 'EUR')).toBe(5)
})

test('a booked balance leaves pending money in; an available one takes it off', () => {
  expect(
    balanceIsBooked([bal('ITAV', '702.49'), bal('CLBD', '727.49')], 'EUR'),
  ).toBe(true)
  expect(balanceIsBooked([bal('ITAV', '1052.10')], 'EUR')).toBe(false)
  expect(balanceIsBooked([], 'EUR')).toBe(false)
})

test('no balance in the currency, or not a number, is no reading', () => {
  expect(pickBalance([bal('CLBD', '10.00', 'USD')], 'EUR')).toBeNull()
  expect(pickBalance([bal('CLBD', 'n/a')], 'EUR')).toBeNull()
  expect(pickBalance([], 'EUR')).toBeNull()
})

const A = { uid: 'a', currency: 'EUR', iban: 'PT50000000004471' }
const B = { uid: 'b', currency: 'EUR', iban: 'PT50000000009920' }
const USD = { uid: 'u', currency: 'USD' }

test('the only account in the currency is the card', () => {
  expect(pickAccounts([A], ['EUR'], [])).toEqual({
    kind: 'found',
    accounts: [{ uid: 'a', currency: 'EUR' }],
  })
})

test('one account per currency: Revolut euros and dollars', () => {
  expect(pickAccounts([A, USD], ['EUR', 'USD'], [])).toEqual({
    kind: 'found',
    accounts: [
      { uid: 'a', currency: 'EUR' },
      { uid: 'u', currency: 'USD' },
    ],
  })
})

test('two accounts: the one whose IBAN ends as the card says', () => {
  expect(pickAccounts([A, B], ['EUR'], ['9920'])).toEqual({
    kind: 'found',
    accounts: [{ uid: 'b', currency: 'EUR' }],
  })
})

test('two accounts and no number known: it is asked', () => {
  expect(pickAccounts([A, B], ['EUR'], [])).toEqual({
    kind: 'choose',
    choices: [A, B],
  })
  expect(pickAccounts([A, B], ['EUR'], ['0000']).kind).toBe('choose')
})

test('nothing in a currency the card holds', () => {
  expect(pickAccounts([USD], ['EUR'], [])).toEqual({ kind: 'none' })
  expect(pickAccounts([], ['EUR'], [])).toEqual({ kind: 'none' })
})

test('when the bank answered: the time today, the day and time before', () => {
  const now = new Date(2026, 9, 11, 17, 30).getTime()
  expect(bankWhen(new Date(2026, 9, 11, 14, 5).getTime(), now)).toBe(
    'today 14:05',
  )
  expect(bankWhen(new Date(2026, 9, 9, 8, 2).getTime(), now)).toBe(
    'Oct 9, 08:02',
  )
  /* Midnight is a day, not "today", even a minute back. */
  expect(bankWhen(new Date(2026, 9, 10, 23, 59).getTime(), now)).toBe(
    'Oct 10, 23:59',
  )
})

test('the day an approval runs to carries its year', () => {
  expect(approvalDay(new Date(2027, 3, 9, 12).getTime())).toBe('Apr 9, 2027')
})
