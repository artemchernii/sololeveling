import { expect, test } from 'vitest'

import { groupFor } from './merchantRule'
import type { Rule } from './merchantRule'

const rule = (key: string, category: string, updatedAt = 1): Rule => ({
  key,
  category,
  updatedAt,
})

/* His rules as they stood on 12 Oct (keys are intake.ts merchantKey's). */
const HIS = [
  rule('pingo doce', 'groceries'),
  rule('est servico veiga e seabra sa', 'car'),
  rule('viaverde', 'car'),
  rule('vodafone', 'phone'),
  rule('fulai restaurante', 'eating out'),
  rule('bolt', 'transport'),
  rule('galeto', 'eating out'),
  rule('bpi', 'other'),
  rule('bpi insurance', 'home'),
  rule('andrei pavlov', 'fun'),
]

test("the bank's own line gets the group of the name he filed", () => {
  expect(groupFor('COMPRA 2789 PINGO DOCE LISBOA', HIS)).toBe('groceries')
  expect(groupFor('COMPRA 2789 EST SERVICO VEIGA E SEABRA SA CASAL', HIS)).toBe(
    'car',
  )
  /* Cut short by the bank. */
  expect(groupFor('COMPRA 2789 EST SERVICO VEIGA', HIS)).toBe('car')
  expect(groupFor('PAG BXVAL- 2789 VIAVERDE', HIS)).toBe('car')
  expect(groupFor('PAG. 919703708 - VODAFONE', HIS)).toBe('phone')
  expect(groupFor('Fulai Restaurante Lisboa', HIS)).toBe('eating out')
})

test('what he never filed stays with no group', () => {
  expect(groupFor('English Bar 42', HIS)).toBe(null)
  expect(groupFor('COMPRA 2789 CAFE 7', HIS)).toBe(null)
  expect(groupFor('', HIS)).toBe(null)
  expect(groupFor('Pingo Doce', [])).toBe(null)
})

test('a transfer to a person is not a shop', () => {
  expect(groupFor('TRF P/ ANDREI PAVLOV', HIS)).toBe(null)
  expect(groupFor('Transfer to Bolt Driver', HIS)).toBe(null)
})

test('one word names a payee only at the start of the line', () => {
  expect(groupFor('Galeto Lisboa', HIS)).toBe('eating out')
  expect(groupFor('Talho do Galeto', HIS)).toBe(null)
  /* A shop of the built-in list is that shop wherever it stands. */
  expect(groupFor('COMPRA 2789 BOLT', HIS)).toBe('transport')
  /* Too short to be a name. */
  expect(groupFor('Kfc Colombo', [rule('kf', 'eating out')])).toBe(null)
})

test('two shops are never one payee; a shop filed two ways is not guessed', () => {
  const rules = [rule('uber', 'transport'), rule('amazon', 'shopping')]
  expect(groupFor('Uber Eats Lisboa', rules)).toBe(null)
  expect(groupFor('UBER TRIP HELP.UBER.COM', rules)).toBe('transport')
  /* BPI is "other" as a fee and "home" as insurance. */
  expect(groupFor('SEGURO BPI VP-VIDA', HIS)).toBe(null)
})

test('the longer name wins, then the newer', () => {
  const rules = [
    rule('cafe', 'eating out'),
    rule('cafe central', 'fun'),
    rule('padaria nova', 'groceries', 1),
    rule('padaria nova', 'eating out', 2),
  ]
  expect(groupFor('Cafe Central Porto', rules)).toBe('fun')
  expect(groupFor('Padaria Nova Lda', rules)).toBe('eating out')
})
