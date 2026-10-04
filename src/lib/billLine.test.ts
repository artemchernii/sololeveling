import { describe, expect, it } from 'vitest'

import { missingFrom, readBillLine } from './billLine'

describe('readBillLine', () => {
  it('reads a monthly bill', () => {
    expect(readBillLine('Holmes Place 49 monthly 1')).toEqual({
      name: 'Holmes Place',
      amount: 49,
      cadence: 'monthly',
      day: 1,
      month: null,
    })
  })

  it('reads a yearly one, a month word making it yearly', () => {
    expect(readBillLine('Allianz 218,40 22 Sep')).toEqual({
      name: 'Allianz',
      amount: 218.4,
      cadence: 'yearly',
      day: 22,
      month: 8,
    })
    expect(readBillLine('car tax €118 yearly on the 20 january')).toMatchObject(
      {
        name: 'car tax',
        amount: 118,
        cadence: 'yearly',
        day: 20,
        month: 0,
      },
    )
  })

  it('keeps a name that starts like a month', () => {
    expect(readBillLine('Mar Shopping 30 monthly 5').name).toBe('Mar Shopping')
  })

  it('says what is missing rather than guessing', () => {
    expect(missingFrom(readBillLine('Netflix'))).toEqual([
      'the amount',
      'the day',
    ])
    expect(missingFrom(readBillLine('Allianz 218 yearly'))).toEqual([
      'the day',
      'the month',
    ])
    expect(missingFrom(readBillLine('Netflix 13 monthly 14'))).toEqual([])
    expect(readBillLine('Gym 40 monthly 45').day).toBeNull()
  })
})
