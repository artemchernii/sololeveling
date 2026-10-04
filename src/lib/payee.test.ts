import { describe, expect, it } from 'vitest'

import { payeeKey, rowKey } from './payee'

/* Lines as his banks printed them (3 Oct). */
describe('payeeKey', () => {
  it('drops references, so one payee is one key every month', () => {
    expect(payeeKey('DD SOLINCA LIGHT, 00003262677 PT13107755')).toBe(
      payeeKey('DD SOLINCA LIGHT 00003262677 PT1310755'),
    )
    expect(payeeKey('TRF CR SEPA+ 0000017 DE BNP PARIBAS')).toBe('BNP PARIBAS')
    expect(payeeKey('TRF CR SEPA+ 0000021 DE BNP PARIBAS')).toBe('BNP PARIBAS')
  })

  it('keeps the payee when the bank leads with how it paid', () => {
    expect(payeeKey('PAG. 919703708 - VODAFONE')).toBe('VODAFONE')
    expect(payeeKey('DD EDP COMERCIAL COMERCIALIZACAO DE ENER')).toBe(
      'EDP COMERCIAL COMERCIALIZACAO',
    )
  })

  it("stops at Revolut's own words", () => {
    expect(payeeKey('Anthropic To: Anthropic* Claude Sub, Dub')).toBe(
      'ANTHROPIC',
    )
    expect(payeeKey('Anthropic Revolut Rate €1.00 = $1.15 (EC')).toBe(
      'ANTHROPIC',
    )
    expect(payeeKey('Norauto To: Norauto, Lisboa, PRT Card: 5')).toBe('NORAUTO')
  })

  it('folds accents and case', () => {
    expect(payeeKey('Habitação e Rendas')).toBe('HABITACAO RENDAS')
  })

  it('is empty when only references are left', () => {
    expect(payeeKey('0000017 1234')).toBe('')
    expect(payeeKey('')).toBe('')
  })
})

describe('rowKey', () => {
  it('prefers the printed line over the cleaned name', () => {
    expect(
      rowKey({
        text: 'Energia e Água',
        meta: { raw: 'DD EDP COMERCIAL COMERCIALIZACAO DE ENER' },
      }),
    ).toBe('EDP COMERCIAL COMERCIALIZACAO')
    expect(rowKey({ text: 'Netflix' })).toBe('NETFLIX')
  })

  it('keys a PayPal row by its mandate, so Preply is a payee of its own', () => {
    expect(
      rowKey({
        meta: { raw: 'DD PayPal Europe 5D4J2254EVNWL LU960000000000' },
      }),
    ).toBe('PAYPAL 5D4J2254EVNWL')
  })
})
