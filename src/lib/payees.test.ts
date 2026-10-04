import { describe, expect, it } from 'vitest'

import { bankPhrase, knownShop, payeeIdOf, siteFor } from './payees'
import { payeeKey } from './payee'

describe('payeeIdOf', () => {
  it('keys a PayPal row by its mandate, so one PayPal shop is not all of PayPal', () => {
    expect(payeeIdOf('DD PayPal Europe 5D4J2254EVNWL LU96000000000')).toBe(
      'PAYPAL 5D4J2254EVNWL',
    )
    expect(payeeIdOf('DD PAYPAL EUROPE 5D4J2254EVNWL LU9600000000000')).toBe(
      'PAYPAL 5D4J2254EVNWL',
    )
    expect(payeeIdOf('DD PAYPAL EUROPE 7XK2P99LMQRSZ LU96')).not.toBe(
      'PAYPAL 5D4J2254EVNWL',
    )
  })

  it('is the payee key for everyone else', () => {
    expect(payeeIdOf('JUROS DE EMPRESTIMO - 006504665-165-001')).toBe(
      'JUROS EMPRESTIMO',
    )
  })
})

describe('knownShop', () => {
  it('knows shops by their words, whole words only', () => {
    expect(
      knownShop(payeeKey('Mango To: Mango, Lisboa Card: 5167'))?.name,
    ).toBe('Mango')
    expect(
      knownShop(payeeKey('Anthropic To: Anthropic* Claude Sub'))?.name,
    ).toBe('Claude')
    expect(knownShop(payeeKey('DD SOLINCA LIGHT 00003262677'))?.category).toBe(
      'health',
    )
    expect(knownShop(payeeKey('MANGOSTEEN BAR'))).toBeNull()
    expect(knownShop(payeeKey('TRF P/ COND P S PRCRT'))).toBeNull()
  })
})

describe('bankPhrase', () => {
  it('says what Portuguese banks print, plainly', () => {
    expect(bankPhrase('JUROS DE EMPRESTIMO - 006504665')).toMatchObject({
      name: 'Mortgage · interest',
      partOf: 'Mortgage',
    })
    expect(bankPhrase('SEGURO ALLIANZ - MULTI-RISCOS-HABITACAO')?.name).toBe(
      'Home insurance',
    )
    expect(bankPhrase('SEGURO BPI VP-VIDA-HABITACAO-ADESAO')?.name).toBe(
      'Life insurance',
    )
    expect(bankPhrase('TRF P/ COND P S PRCRT V CASTRO')?.name).toBe(
      'Condominium',
    )
    expect(bankPhrase('Bnp Toc To: Bnp Toc')).toBeNull()
  })
})

describe('siteFor', () => {
  it('guesses a site from a name, a known shop first', () => {
    expect(siteFor('Preply')).toBe('preply.com')
    expect(siteFor('Mango')).toBe('mango.com')
    expect(siteFor('Ação')).toBe('acao.com')
    expect(siteFor('Al')).toBeNull()
  })
})
