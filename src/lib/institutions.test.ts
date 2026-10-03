import { expect, test } from 'vitest'

import {
  productByIban,
  productIn,
  searchProducts,
  tail,
  tailsIn,
} from './institutions'

test('productIn: the most specific product a text names', () => {
  expect(productIn('Trade Republic Bank GmbH')?.id).toBe('trade-republic')
  expect(productIn('Revolut Securities Europe UAB')?.id).toBe('revolut')
  expect(productIn('Revolut Bank UAB')?.kinds).toEqual(['bank', 'broker'])
  expect(productIn('Trading212')?.id).toBe('trading-212')
  expect(productIn('Banco BPI, S.A.')?.id).toBe('bpi')
  expect(productIn('To investment account')).toBeUndefined()
})

test('searchProducts: by name, or everything for nothing typed', () => {
  expect(searchProducts('trade').map((p) => p.id)).toEqual(['trade-republic'])
  expect(searchProducts('').length).toBeGreaterThan(10)
})

test('tail and tailsIn: the last four digits that name an account', () => {
  expect(tail('•• 2789')).toBe('2789')
  expect(tail('12')).toBeNull()
  expect(tailsIn('Transfer from PT50…0120')).toEqual(['0120'])
  expect(tailsIn('Top-up by card ••2789')).toEqual(['2789'])
  expect(tailsIn('Bolt ride')).toEqual([])
})

test('a Portuguese IBAN names the account before its check digits (3 Oct)', () => {
  expect(
    tailsIn('TRF SEPA+ INST 19 P/ PT50002300004547874109894 ARTEM'),
  ).toEqual(expect.arrayContaining(['9894', '0989']))
  expect(tailsIn('PT50 0023 0000 4547 8741 0989 4')).toContain('0989')
})

test('an IBAN names its bank by the code after PT50 (3 Oct)', () => {
  expect(
    productByIban('TRF SEPA+ INST 22 P/ PT50002300004547874109 8894')?.id,
  ).toBe('activo')
  expect(productByIban('PT50 0010 0000 1234')?.id).toBe('bpi')
  expect(productByIban('DE89 3704 0044')).toBeUndefined()
})
