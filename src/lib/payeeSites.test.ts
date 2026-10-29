import { describe, expect, test } from 'vitest'

import { payeeSite, senderSite } from './payeeSites'

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
  test('MB Way to a person keeps the MB Way mark', () => {
    expect(payeeSite('TRF MB WAY P ANA SILVA')).toBe('mbway.pt')
    expect(payeeSite('DD FIDELIDADE COM')).toBe('fidelidade.pt')
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

describe('senderSite', () => {
  test('a transfer in from a sender the list knows by its whole name', () => {
    expect(senderSite('TRF CR SEPA+ 0000021 DE BNP PARIBAS')).toBe(
      'bnpparibas.com',
    )
  })
  test('a person, a longer name, or no sender: nothing', () => {
    expect(senderSite('TRF CR DE CLAUDE MARTIN')).toBeNull()
    expect(senderSite('TRF CR DE BNP PARIBAS LEASING')).toBeNull()
    expect(senderSite('COMPRA 2789 EASYPAY LISBOA')).toBeNull()
    expect(senderSite('Salary')).toBeNull()
  })
})
