import { describe, expect, test } from 'vitest'

import {
  otherTails,
  ownTail,
  payingCardTails,
  pickOtherSide,
} from './otherSide'

/* His accounts as they stand on 18 Oct: Revolut holds 2789, ActivoBank's
   card, learned from the rows below. */
const ACTIVO = {
  id: 'activo',
  name: 'ActivoBank',
  tails: ['8741', '0120', '8894', '0988'],
}
const REVOLUT = { id: 'rev', name: 'Revolut', tails: ['4055', '2789', '8134'] }
const TR = { id: 'tr', name: 'Trade Republic', tails: [] }
const BPI = { id: 'bpi', name: 'BPI', tails: ['0120'] }
const fromActivo = [REVOLUT, TR, BPI]

const TOP_UP = 'COMPRA 2789 REVOLUT 8134 DUBLIN IE'
const TO_TR = 'COMPRA 2789 TRADE REPUBLIC BERLIN DE'
const row = (raw: string) => ({ merchant: raw, raw })

describe('the card that paid', () => {
  test('COMPRA <tail> is the paying card, not the other side', () => {
    expect(payingCardTails(TOP_UP)).toEqual(['2789'])
    expect(otherTails(TOP_UP)).toEqual(['8134'])
    expect(otherTails(TO_TR)).toEqual([])
  })
  test('a top-up’s source is the other side’s ending', () => {
    expect(payingCardTails('Top-up by *2789 From: *2789')).toEqual([])
    expect(otherTails('Top-up by *2789 From: *2789')).toEqual(['2789'])
  })
})

describe('pickOtherSide', () => {
  test('the merchant names Trade Republic: Trade Republic, whatever Revolut holds', () => {
    expect(pickOtherSide(row(TO_TR), fromActivo, ACTIVO)).toBe('tr')
  })
  test('the merchant names Revolut: Revolut', () => {
    expect(pickOtherSide(row(TOP_UP), fromActivo, ACTIVO)).toBe('rev')
  })
  test('the paying card’s ending never picks another account', () => {
    expect(
      pickOtherSide(row('COMPRA 2789 LOJA 22 LISBOA'), fromActivo, ACTIVO),
    ).toBeNull()
  })
  test('an ending of the other side, held by one account: that account', () => {
    expect(pickOtherSide(row('TRF P/ 8134 ARTEM'), fromActivo, ACTIVO)).toBe(
      'rev',
    )
  })
  test('an ending held by two accounts, or by this one: not certain → null', () => {
    const twice = [REVOLUT, TR, BPI, { id: 'x', name: 'Moey', tails: ['8134'] }]
    expect(pickOtherSide(row('TRF P/ 8134 ARTEM'), twice, ACTIVO)).toBeNull()
    expect(
      pickOtherSide(row('TRF PT50…0120 ARTEM'), fromActivo, ACTIVO),
    ).toBeNull()
  })
  test('no name, no ending: null', () => {
    expect(pickOtherSide(row('TRANSFERENCIA'), fromActivo, ACTIVO)).toBeNull()
  })
})

describe('ownTail', () => {
  const revolutRows = [
    { amount: 700, merchant: 'Top-up by *2789', raw: 'From: *2789' },
    { amount: -12, merchant: 'Bolt', raw: 'Bolt' },
  ]
  test('the source of an incoming top-up is not the statement’s own', () => {
    expect(ownTail('2789', revolutRows)).toBeUndefined()
  })
  test('an ending no incoming row prints is the statement’s own', () => {
    expect(ownTail('4055', revolutRows)).toBe('4055')
    expect(ownTail(undefined, revolutRows)).toBeUndefined()
  })
})
