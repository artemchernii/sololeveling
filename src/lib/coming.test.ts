import { describe, expect, it } from 'vitest'

import {
  comingDays,
  lisbonDay,
  macroIn,
  parseCalendar,
  window7,
} from './coming'

describe('COMING', () => {
  const days = window7('2026-11-01')

  it('seven days from today, across the month', () => {
    expect(days).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ])
    expect(window7('2026-12-29').at(-1)).toBe('2027-01-04')
  })

  it('today on the Lisbon clock, not UTC', () => {
    expect(lisbonDay(Date.parse('2026-07-31T23:30:00Z'))).toBe('2026-08-01')
  })

  it('the Bank of England and the jobs report in the first week of November', () => {
    expect(macroIn(days)).toEqual([
      {
        kind: 'boe',
        day: '2026-11-05',
        time: '12:00',
        flag: 'GB',
        source: 'BANK OF ENGLAND',
      },
      {
        kind: 'jobs',
        day: '2026-11-06',
        time: '13:30',
        flag: 'US',
        source: 'BLS',
      },
    ])
    expect(macroIn(window7('2026-12-08')).map((e) => e.kind)).toEqual([
      'fed',
      'cpi',
    ])
  })

  const calendar = {
    earningsCalendar: [
      { symbol: 'PLTR', date: '2026-11-03', hour: 'amc', epsEstimate: 0.17 },
      { symbol: 'PLTR', date: '2026-11-03', hour: 'amc', epsEstimate: 0.17 },
      { symbol: 'TINY', date: '2026-11-03', hour: 'bmo', epsEstimate: 0.01 },
      { symbol: 'BRK.B', date: '2026-11-02', hour: '', epsEstimate: null },
      { symbol: 'UBER', date: '2026-11-04', hour: 'bmo', epsEstimate: 0.98 },
      { symbol: 'OZON', date: '2026-11-05', hour: 'dmh', epsEstimate: '2.5' },
      { symbol: 'AMD', date: '2026-11-20', hour: 'amc', epsEstimate: 1.1 },
    ],
  }

  it('the listed and the held companies only, once each, inside the days', () => {
    const rows = parseCalendar(calendar, days, [
      { symbol: 'UBER', name: 'Uber' },
      { symbol: 'OZON', name: 'Ozon Holdings' },
    ])
    expect(rows.map((r) => r.symbol)).toEqual(['PLTR', 'BRK-B', 'UBER', 'OZON'])
    expect(rows[0]).toEqual({
      day: '2026-11-03',
      symbol: 'PLTR',
      name: 'Palantir',
      domain: 'palantir.com',
      hour: 'AFTER CLOSE',
      expected: 0.17,
      held: false,
    })
    expect(rows[1]).toMatchObject({
      name: 'Berkshire Hathaway',
      hour: null,
      expected: null,
    })
    expect(rows[2]).toMatchObject({
      held: true,
      hour: 'BEFORE OPEN',
      expected: 0.98,
    })
    expect(rows[3]).toMatchObject({
      name: 'Ozon Holdings',
      domain: null,
      held: true,
      expected: 2.5,
    })
  })

  it('nothing from an answer that is not a calendar', () => {
    expect(parseCalendar(null, days, [])).toEqual([])
    expect(parseCalendar({ error: 'limit' }, days, [])).toEqual([])
  })

  it('a row per day with something, the held company first', () => {
    const rows = parseCalendar(
      {
        earningsCalendar: [
          { symbol: 'AMD', date: '2026-11-04', hour: 'amc' },
          { symbol: 'UBER', date: '2026-11-04', hour: 'bmo' },
        ],
      },
      days,
      [{ symbol: 'UBER', name: 'Uber' }],
    )
    const out = comingDays(days, macroIn(days), rows)
    expect(out.map((d) => d.day)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ])
    expect(out[0].reporters.map((r) => r.symbol)).toEqual(['UBER', 'AMD'])
  })
})
