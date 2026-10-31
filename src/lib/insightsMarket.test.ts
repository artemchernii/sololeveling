import { describe, expect, it } from 'vitest'

import {
  allSymbols,
  heatMix,
  moveOf,
  parseCaps,
  parseSpark,
  thin,
  zeroBar,
} from './insightsMarket'
import {
  ECB_MEETINGS,
  nextMeeting,
  parseBls,
  parseEcb,
  parseEurostat,
  parseFred,
  parseFredCpi,
  parseFredMonthly,
} from './insightsRates'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 19, 12)

/* Insights I1 (19 Oct): Yahoo's batch answer, BLS, Eurostat, the ECB and
   FRED as each answers, and the change over a period from two fetched
   prices. Shapes taken from the live answers on 19 Oct. */

describe('parseSpark', () => {
  it('reads each symbol, and leaves out one with no closes', () => {
    const m = parseSpark({
      NVDA: {
        timestamp: [1, 2, 3],
        close: [100, null, 110],
        chartPreviousClose: 98,
      },
      DEAD: { timestamp: [], close: [] },
      BAD: null,
    })
    expect([...m.keys()]).toEqual(['NVDA'])
    expect(m.get('NVDA')).toEqual({
      points: [
        { t: 1000, v: 100 },
        { t: 3000, v: 110 },
      ],
      previousClose: 98,
    })
    expect(parseSpark(null).size).toBe(0)
  })
})

describe('moveOf', () => {
  const daily = {
    points: Array.from({ length: 40 }, (_, i) => ({
      t: NOW - (39 - i) * DAY,
      v: 100 + i,
    })),
    previousClose: 50,
  }
  it('1D measures against the previous close, with no base day', () => {
    const m = moveOf(daily, '1D', NOW)
    expect(m?.base).toBe(50)
    expect(m?.baseAt).toBeNull()
    expect(m?.change).toBe(178)
  })
  it('1W measures against the last close on or before a week ago', () => {
    const m = moveOf(daily, '1W', NOW)
    expect(m?.base).toBe(132)
    expect(m?.baseAt).toBe(NOW - 7 * DAY)
    expect(m?.change).toBe(5.3)
    expect(m?.points).toHaveLength(8)
  })
  it('a yield moves in points', () => {
    const m = moveOf(daily, '1W', NOW, true)
    expect(m?.change).toBe(7)
  })
  it('null when the closes do not reach back to the base', () => {
    expect(moveOf(daily, '1Y', NOW)).toBeNull()
    expect(moveOf({ points: [], previousClose: 1 }, '1D', NOW)).toBeNull()
    expect(moveOf({ ...daily, previousClose: null }, '1D', NOW)).toBeNull()
  })
})

describe('the rest of the market', () => {
  it('thins a line, keeping its ends', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ t: i, v: i }))
    const out = thin(pts, 10)
    expect(out).toHaveLength(10)
    expect(out[0].t).toBe(0)
    expect(out[9].t).toBe(99)
  })
  it('asks for each symbol once', () => {
    const all = allSymbols()
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain('XLK')
    expect(all).toContain('AVGO')
  })
  it('reads market caps', () => {
    const caps = parseCaps({
      quoteResponse: {
        result: [{ symbol: 'NVDA', marketCap: 4e12 }, { symbol: 'X' }],
      },
    })
    expect([...caps]).toEqual([['NVDA', 4e12]])
  })
  it('heat is full at 6% over a month and 30% over a year', () => {
    expect(heatMix(0, '1M')).toBe(30)
    expect(heatMix(-6, '1M')).toBe(100)
    expect(heatMix(6, '1Y')).toBe(44)
  })
})

describe('rates', () => {
  it('BLS: the twelve-month change from the index, and the month before', () => {
    const row = (year: string, period: string, value: string) => ({
      year,
      period,
      value,
    })
    const r = parseBls({
      Results: {
        series: [
          {
            data: [
              row('2026', 'M09', '336.94'),
              row('2026', 'M08', '334.98'),
              row('2025', 'M09', '324.80'),
              row('2025', 'M08', '323.98'),
            ],
          },
        ],
      },
    })
    expect(r).toEqual({
      value: 3.7,
      month: '2026-09',
      prev: 3.4,
      prevMonth: '2026-08',
      index: { now: 336.94, yearAgo: 324.8 },
    })
    expect(parseBls({ Results: { series: [{ data: [] }] } })).toBeNull()
  })
  it('FRED CPIAUCNSL: the same twelve-month change when BLS is not reached', () => {
    const o = (date: string, value: string) => ({ date, value })
    expect(
      parseFredCpi({
        observations: [
          o('2025-08-01', '323.98'),
          o('2025-09-01', '324.80'),
          o('2026-08-01', '334.98'),
          o('2026-09-01', '336.94'),
          o('2026-10-01', '.'),
        ],
      }),
    ).toEqual({
      value: 3.7,
      month: '2026-09',
      prev: 3.4,
      prevMonth: '2026-08',
      index: { now: 336.94, yearAgo: 324.8 },
    })
    expect(parseFredCpi({ error_code: 400 })).toBeNull()
  })
  it('Eurostat: the latest month and the one before', () => {
    expect(
      parseEurostat({
        value: { '0': 3.2, '1': 3.8 },
        dimension: {
          time: { category: { index: { '2026-08': 0, '2026-09': 1 } } },
        },
      }),
    ).toEqual({
      value: 3.8,
      month: '2026-09',
      prev: 3.2,
      prevMonth: '2026-08',
      index: null,
    })
    expect(parseEurostat({ value: {} })).toBeNull()
  })
  it('ECB: the rate now and the day it took it', () => {
    expect(
      parseEcb({
        dataSets: [
          {
            series: {
              '0:0': {
                observations: { '0': [2.25], '1': [2.5], '2': [2.5] },
              },
            },
          },
        ],
        structure: {
          dimensions: {
            observation: [
              {
                values: [
                  { id: '2026-09-15' },
                  { id: '2026-09-16' },
                  { id: '2026-09-17' },
                ],
              },
            ],
          },
        },
      }),
    ).toEqual({ value: 2.5, since: '2026-09-16' })
  })
  it('FRED: the same, skipping its "." days', () => {
    expect(
      parseFred({
        observations: [
          { date: '2026-09-16', value: '4.75' },
          { date: '2026-09-17', value: '4.50' },
          { date: '2026-09-18', value: '.' },
          { date: '2026-09-19', value: '4.50' },
        ],
      }),
    ).toEqual({ value: 4.5, since: '2026-09-17' })
    expect(parseFred({})).toBeNull()
  })
  it('the next meeting is today or later, none after the last', () => {
    expect(nextMeeting(ECB_MEETINGS, '2026-10-19')).toBe('2026-10-29')
    expect(nextMeeting(ECB_MEETINGS, '2026-10-29')).toBe('2026-10-29')
    expect(nextMeeting(ECB_MEETINGS, '2026-12-18')).toBeNull()
  })
})

describe('MARKET rework (30 Oct)', () => {
  it('a monthly FRED series: the latest month and the one before', () => {
    expect(
      parseFredMonthly({
        observations: [
          { date: '2026-08-01', value: '4.3' },
          { date: '2026-09-01', value: '4.4' },
          { date: '2026-07-01', value: '.' },
        ],
      }),
    ).toEqual({
      value: 4.4,
      month: '2026-09',
      prev: 4.3,
      prevMonth: '2026-08',
      index: null,
    })
    expect(parseFredMonthly({})).toBeNull()
  })
  it('a bar from zero is full at 12%, half the track either way', () => {
    expect(zeroBar(0)).toBe(0)
    expect(zeroBar(6)).toBe(25)
    expect(zeroBar(-12)).toBe(50)
    expect(zeroBar(30)).toBe(50)
  })
})
