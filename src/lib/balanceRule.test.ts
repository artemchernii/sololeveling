import { describe, expect, test } from 'vitest'

import { reach, rowsSumming } from './balanceRule'

const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime()
const row = (id: number, d: number, euros: number, twin = false) => ({
  id,
  at: at(d),
  cents: Math.round(euros * 100),
  twin,
})

describe('one balance rule', () => {
  test('rows that reach the balance: ok, all counted', () => {
    const r = reach({
      was: { cents: 10000 },
      to: { at: at(5, 18), cents: 7500 },
      rows: [row(0, 3, -50), row(1, 4, 25)],
    })
    expect(r).toMatchObject({
      state: 'ok',
      counted: [0, 1],
      outCents: 5000,
      inCents: 2500,
      nowCents: 7500,
      gapCents: 0,
    })
  })

  test('booked later: a row after the balance it already had', () => {
    const r = reach({
      was: { cents: 30882 },
      to: { at: at(27, 18), cents: 20882 },
      rows: [],
      later: [row(7, 28, -100)],
    })
    expect(r.state).toBe('ok')
    expect(r.bookedLater.map((x) => x.id)).toEqual([7])
  })

  test('same-day carry: the €422 dated the balance’s day it had not seen', () => {
    const r = reach({
      was: { cents: 8437 },
      to: { at: at(3, 15), cents: 8437 },
      rows: [row(4, 3, 422)],
    })
    expect(r).toMatchObject({ state: 'ok', counted: [], nowCents: 8437 })
    expect(r.carried.map((x) => x.id)).toEqual([4])
  })

  test('a row of the day before is not carried', () => {
    expect(
      reach({
        was: { cents: 8437 },
        to: { at: at(3, 15), cents: 8437 },
        rows: [row(4, 2, 422)],
      }),
    ).toMatchObject({ state: 'off', gapCents: -42200 })
  })

  test('pending at the earlier balance: the row it had off is not summed twice', () => {
    const r = reach({
      was: { cents: 15321, pending: -120520 },
      to: { cents: 9035 },
      rows: [row(0, 11, -25), row(1, 6, -505.2), row(3, 5, -37.86)],
    })
    expect(r).toMatchObject({ state: 'ok', pendingWas: [1], nowCents: 9035 })
  })

  test('pending at the later balance: no row yet, the balance has it off', () => {
    const r = reach({
      was: { cents: 43566 },
      to: { at: at(3, 14), cents: 15321, pending: -120520 },
      rows: [row(0, 1, 922.75), row(1, 2, -700)],
    })
    expect(r).toMatchObject({ state: 'ok', pendingTo: -50520 })
  })

  test('a twin that explains the sum is asked about, not counted', () => {
    const r = reach({
      was: { cents: 15321 },
      to: { cents: 9035 },
      rows: [row(0, 11, -25), row(2, 6, -700, true), row(3, 5, -37.86)],
    })
    expect(r).toMatchObject({ state: 'ask', twin: 2, gapCents: 70000 })
  })

  test('nothing explains it: off, by how much', () => {
    expect(
      reach({
        was: { cents: 74236 },
        to: { at: at(10, 18), cents: 52136 },
        rows: [],
        later: [row(0, 16, -100)],
      }),
    ).toMatchObject({ state: 'off', gapCents: -22100, bookedLater: [] })
  })

  test('more than was pending is not explained by it', () => {
    expect(
      reach({
        was: { cents: 43566 },
        to: { at: at(3, 14), cents: 15321, pending: -10000 },
        rows: [row(0, 1, -60.45)],
      }).state,
    ).toBe('off')
  })

  test('earlier, saved: the €422 the held balance had not seen joins was', () => {
    const r = reach({
      was: { cents: 72800 },
      to: { cents: 114000 },
      rows: [row(1, 4, -10)],
      earlier: [{ ...row(-1000, 3, 422), saved: true }, row(-1001, 3, -5)],
    })
    expect(r).toMatchObject({
      state: 'ok',
      wasCents: 115000,
      outCents: 1000,
      inCents: 0,
      nowCents: 114000,
    })
  })

  test('earlier, from the file: counted when that is what makes the balance', () => {
    expect(
      reach({
        was: { cents: 10000 },
        to: { cents: 9000 },
        rows: [],
        earlier: [row(0, 3, -10)],
      }),
    ).toMatchObject({ state: 'ok', counted: [0], outCents: 1000 })
  })

  test('earlier rows that explain nothing leave the gap as it was', () => {
    expect(
      reach({
        was: { cents: 10000 },
        to: { cents: 9000 },
        rows: [],
        earlier: [{ ...row(-1000, 3, 422), saved: true }],
      }),
    ).toMatchObject({ state: 'off', wasCents: 10000, gapCents: -1000 })
  })

  test('no later balance: summed, nothing claimed', () => {
    expect(
      reach({ was: { cents: 100 }, to: { cents: null }, rows: [row(0, 1, 5)] }),
    ).toMatchObject({ state: 'bare', nowCents: 600, gapCents: 0 })
  })
})

describe('rowsSumming', () => {
  const rows = [
    { at: 1, cents: 300 },
    { at: 2, cents: 500 },
    { at: 3, cents: 200 },
  ]
  test('one row, else two, else the first in date order', () => {
    expect(rowsSumming(500, rows)).toEqual([rows[1]])
    expect(rowsSumming(700, rows)).toEqual([rows[1], rows[2]])
    expect(rowsSumming(1000, rows)).toEqual(rows)
    expect(rowsSumming(0, rows)).toBe(null)
    expect(rowsSumming(50, rows)).toBe(null)
  })
})
