import { describe, expect, test } from 'vitest'

import {
  earningsFacts,
  parseCalendar,
  parseQuotes,
  pickDays,
  ribbonOf,
  sinceReport,
} from './insightsEarnings'
import type { Earning } from './insightsEarnings'

const at = (iso: string) => Date.parse(iso)
const NOW = at('2026-10-21T21:40:00Z')

describe('parseCalendar', () => {
  test('one date, confirmed', () => {
    expect(
      parseCalendar({
        quoteSummary: {
          result: [
            {
              calendarEvents: {
                earnings: {
                  earningsDate: [{ raw: 1_793_217_600, fmt: '2026-10-28' }],
                  isEarningsDateEstimate: false,
                },
              },
            },
          ],
        },
      }),
    ).toEqual({ times: [1_793_217_600_000], estimate: false })
  })
  test('a range, a guess', () => {
    expect(
      parseCalendar({
        quoteSummary: {
          result: [
            {
              calendarEvents: {
                earnings: {
                  earningsDate: [{ raw: 100 }, { raw: 200 }],
                  isEarningsDateEstimate: true,
                },
              },
            },
          ],
        },
      }),
    ).toEqual({ times: [100_000, 200_000], estimate: true })
  })
  test('nothing there', () => {
    expect(parseCalendar(null)).toBeNull()
    expect(parseCalendar({ quoteSummary: { result: [{}] } })).toBeNull()
  })
})

test('parseQuotes reads each symbol, skips what is missing', () => {
  const m = parseQuotes({
    quoteResponse: {
      result: [
        {
          symbol: 'NFLX',
          currency: 'USD',
          earningsTimestamp: 1_792_526_400,
          earningsTimestampStart: 1_800_000_000,
        },
        { symbol: 'IWDA.AS' },
        { nope: 1 },
      ],
    },
  })
  expect(m.get('NFLX')).toEqual({
    times: [1_792_526_400_000, 1_800_000_000_000],
    estimate: false,
    currency: 'USD',
  })
  expect(m.get('IWDA.AS')?.times).toEqual([])
  expect(m.size).toBe(2)
  expect(parseQuotes('Too Many Requests').size).toBe(0)
})

test('pickDays: the nearest ahead, the latest behind', () => {
  expect(pickDays([NOW - 5, NOW + 9, NOW + 3, NOW - 90], NOW)).toEqual({
    next: NOW + 3,
    last: NOW - 5,
  })
  expect(pickDays([], NOW)).toEqual({ next: null, last: null })
})

describe('sinceReport', () => {
  /* Daily points, each at a US open (13:30 UTC). */
  const day = (d: string, v: number) => ({ t: at(`${d}T13:30:00Z`), v })
  const points = [
    day('2026-10-17', 1200),
    day('2026-10-20', 1212.4),
    day('2026-10-21', 1117.8),
  ]
  test('after the close: that day is the base', () => {
    expect(sinceReport(points, at('2026-10-20T20:05:00Z'))).toEqual({
      base: { at: points[1].t, price: 1212.4 },
      now: { at: points[2].t, price: 1117.8 },
    })
  })
  test('before the open: the day before is the base', () => {
    expect(sinceReport(points, at('2026-10-20T11:00:00Z'))?.base.price).toBe(
      1200,
    )
  })
  test('no close after the base: nothing', () => {
    expect(sinceReport(points, at('2026-10-21T21:00:00Z'))).toBeNull()
    expect(sinceReport([], NOW)).toBeNull()
  })
})

const e = (over: Partial<Earning>): Earning => ({
  symbol: 'NFLX',
  next: null,
  estimate: false,
  last: null,
  base: null,
  now: null,
  currency: 'USD',
  ...over,
})
const REPORTED = {
  last: at('2026-10-20T20:05:00Z'),
  base: { at: at('2026-10-20T13:30:00Z'), price: 1212.4 },
  now: { at: at('2026-10-21T13:30:00Z'), price: 1117.8 },
}

describe('ribbonOf: 14 days ahead, 7 back', () => {
  test('reported yesterday, with the move', () => {
    const r = ribbonOf(e(REPORTED), NOW)
    expect(r?.kind).toBe('reported')
    expect(r?.kind === 'reported' && r.change).toBeCloseTo(-7.8, 1)
  })
  test('a report 8 days back is quiet', () => {
    expect(ribbonOf(e({ ...REPORTED, last: NOW - 8 * 86_400_000 }), NOW)).toBe(
      null,
    )
  })
  test('7 days back still speaks', () => {
    expect(
      ribbonOf(e({ ...REPORTED, last: at('2026-10-14T20:05:00Z') }), NOW)?.kind,
    ).toBe('reported')
  })
  test('14 days ahead speaks, 15 does not', () => {
    expect(
      ribbonOf(e({ next: at('2026-11-04T20:00:00Z') }), NOW),
    ).toMatchObject({ kind: 'soon', days: 14 })
    expect(ribbonOf(e({ next: at('2026-11-05T20:00:00Z') }), NOW)).toBeNull()
  })
  test('a report without both prices says the next instead', () => {
    expect(
      ribbonOf(
        e({ last: REPORTED.last, next: at('2026-10-28T20:00:00Z') }),
        NOW,
      ),
    ).toMatchObject({ kind: 'soon', days: 7 })
  })
})

test('earningsFacts: one per ribbon, both prices in a report', () => {
  const facts = earningsFacts(
    [
      e(REPORTED),
      e({ symbol: 'MSFT', next: at('2026-10-28T20:00:00Z') }),
      e({ symbol: 'AVGO', next: at('2026-12-11T20:00:00Z'), estimate: true }),
    ],
    NOW,
  )
  expect(facts).toEqual([
    {
      key: 'earn-NFLX',
      label: 'NFLX REPORTED 20 OCT',
      value: 'CLOSE 20 OCT $1,212.40 · NOW $1,117.80 · ▼ 7.8%',
      tone: 'bad',
    },
    {
      key: 'earn-MSFT',
      label: 'MSFT EARNINGS',
      value: '28 OCT · IN 7 DAYS · CONFIRMED',
      tone: null,
    },
  ])
})
