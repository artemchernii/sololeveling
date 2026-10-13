import { describe, expect, it } from 'vitest'
import { plainName } from './plainName'

describe("a bank's line as a name", () => {
  it('a card payment: the bank word, the card digits go; the city stays', () => {
    expect(plainName('COMPRA 2789 EASYPAY LISBOA')).toBe('Easypay Lisboa')
    expect(plainName('COMPRA 2789 FARMACIA ESTRELA LISBOA')).toBe(
      'Farmacia Estrela Lisboa',
    )
  })
  it('a direct debit: the reference goes', () => {
    expect(plainName('DD PT10100897 VODAFONE PORTUGAL')).toBe(
      'Vodafone Portugal',
    )
  })
  it('a transfer to a person: the name', () => {
    expect(plainName('TRF P/ JOAO SILVA')).toBe('Joao Silva')
    /* 13 Oct, his ActivoBank: "P/O" left an "O" before the name. */
    expect(plainName('TRF P/O ARTEM CHERNII')).toBe('Artem Chernii')
    expect(plainName('TRF. P/O OLEKSANDR SAKHNO')).toBe('Oleksandr Sakhno')
  })
  it('small words inside a name are lower case, accents are kept', () => {
    expect(plainName('COMPRA 2789 PADARIA DO BAIRRO')).toBe('Padaria do Bairro')
    expect(plainName('CAFÉ DA PRAÇA')).toBe('Café da Praça')
  })
  it('a star or a dash between words is a space', () => {
    expect(plainName('COMPRA 2789 PAYPAL *PREPLY')).toBe('Paypal Preply')
    expect(plainName('PAG. 919703708 - VODAFONE')).toBe('Vodafone')
  })
  it('only numbers and bank words: the line stays as it is', () => {
    expect(plainName('PAG SERV 21345 678901234')).toBeNull()
    expect(plainName('')).toBeNull()
  })
  it('a line that is already a name is left alone', () => {
    expect(plainName('Pingo Doce')).toBeNull()
    expect(plainName('Top-up by *2789')).toBeNull()
    expect(plainName('Uber Eats')).toBeNull()
  })
})
