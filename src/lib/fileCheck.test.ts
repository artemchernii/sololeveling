import { describe, expect, test } from 'vitest'

import { sumCheck } from './fileCheck'
import type { CheckRow } from './fileCheck'

const day = (d: number) => new Date(2026, 9, d, 12).getTime()
const row = (
  index: number,
  d: number,
  amount: number,
  twin = false,
): CheckRow => ({ index, at: day(d), cents: Math.round(amount * 100), twin })

/* His ActivoBank screenshot of 11 Oct against €153.21 held since 3 Oct,
   which had −€1,205.20 pending taken off. */
const FUEL = row(3, 5, -37.86)
const TOPUP = row(2, 6, -700)
const BROKER = row(1, 6, -505.2)
const FRIEND = row(0, 11, -25)
const held = { wasCents: 15321, pendingCents: -120520, printedCents: 9035 }

describe('does the file add up', () => {
  test('his screenshot: the row that was pending is saved, not summed', () => {
    expect(sumCheck({ ...held, rows: [FRIEND, BROKER, FUEL] })).toEqual({
      state: 'ok',
      outCents: 6286,
      inCents: 0,
      nowCents: 9035,
      gapCents: 0,
      pending: [1],
      twin: null,
    })
  })

  test('the top-up read again under another name: asked, not written', () => {
    const c = sumCheck({
      ...held,
      rows: [FRIEND, BROKER, { ...TOPUP, twin: true }, FUEL],
    })
    expect(c).toMatchObject({ state: 'ask', twin: 2, pending: [1] })
    expect([c.outCents, c.nowCents, c.gapCents]).toEqual([76286, -60965, 70000])
  })

  test('told it is another payment: both were pending, it adds up', () => {
    expect(
      sumCheck({ ...held, rows: [FRIEND, BROKER, TOPUP, FUEL] }),
    ).toMatchObject({ state: 'ok', pending: [1, 2], nowCents: 9035 })
  })

  test('no pending money, one row twice: asked', () => {
    expect(
      sumCheck({
        wasCents: 15321,
        pendingCents: 0,
        printedCents: 9035,
        rows: [FRIEND, { ...TOPUP, twin: true }, FUEL],
      }),
    ).toMatchObject({ state: 'ask', twin: 2, pending: [], gapCents: 70000 })
  })

  test('a row cut off the screenshot: off, and by how much', () => {
    expect(
      sumCheck({ ...held, printedCents: 7835, rows: [FRIEND, FUEL] }),
    ).toMatchObject({ state: 'off', nowCents: 9035, gapCents: -1200 })
  })

  test('more than was pending is not explained by it', () => {
    expect(
      sumCheck({ ...held, pendingCents: -30000, rows: [FRIEND, BROKER, FUEL] })
        .state,
    ).toBe('off')
  })

  test('a twin is not asked about when the sum is right', () => {
    expect(
      sumCheck({
        wasCents: 15321,
        pendingCents: 0,
        printedCents: 9035,
        rows: [{ ...FRIEND, twin: true }, FUEL],
      }).state,
    ).toBe('ok')
  })

  test('no printed balance: summed, nothing claimed', () => {
    expect(
      sumCheck({ ...held, printedCents: null, rows: [FRIEND, FUEL] }),
    ).toMatchObject({ state: 'bare', nowCents: 9035, gapCents: 0 })
  })

  test('no rows and the same balance: ok', () => {
    expect(sumCheck({ ...held, printedCents: 15321, rows: [] }).state).toBe(
      'ok',
    )
  })
})
