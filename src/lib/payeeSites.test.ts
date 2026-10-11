import { describe, expect, test } from 'vitest'

import { payeeSite } from './payeeSites'

describe('whose mark a row gets', () => {
  test('a clean name', () => {
    expect(payeeSite('Spotify')).toBe('spotify.com')
    expect(payeeSite('Pingo Doce')).toBe('pingodoce.pt')
    expect(payeeSite('BP')).toBe('bp.com')
  })
  test('as a bank prints it', () => {
    expect(payeeSite('COMPRA 2789 CONTINENTE BOM DIA LISBOA')).toBe(
      'continente.pt',
    )
    expect(payeeSite('Bolt.euo2609161656')).toBe('bolt.eu')
    expect(payeeSite("McDonald's Colombo")).toBe('mcdonalds.com')
    expect(payeeSite('Intermarché Super')).toBe('intermarche.pt')
  })
  test('the longer name wins', () => {
    expect(payeeSite('Uber Eats')).toBe('ubereats.com')
    expect(payeeSite('Uber')).toBe('uber.com')
    expect(payeeSite('Amazon Prime Video')).toBe('primevideo.com')
  })
  test('whole words only: no logo by accident', () => {
    expect(payeeSite('Pineapple Bar')).toBeNull()
    expect(payeeSite('Boltzmann Lda')).toBeNull()
    expect(payeeSite('Nosso Café')).toBeNull()
    expect(payeeSite('Wiseman')).toBeNull()
  })
  test('a person or a shop not in the list: letters', () => {
    expect(payeeSite('Transfer to Andrei Pavlov')).toBeNull()
    expect(payeeSite('Transfer to Claude Martin')).toBeNull()
    expect(payeeSite('TRF P/ APPLE WELLS')).toBeNull()
    expect(payeeSite('Veiga e Seabra')).toBeNull()
    expect(payeeSite('')).toBeNull()
  })
})
