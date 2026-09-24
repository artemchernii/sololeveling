import { describe, expect, test } from 'vitest'

import { dragResult, seriesPhrase, shiftSeries, snap } from './calendarDrag'

const ROW = 44
function at(d: number, h: number, m = 0) {
  return new Date(2026, 8, d, h, m).getTime()
}
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

describe('snap', () => {
  test('rounds to the nearest fifteen', () => {
    expect(snap(7)).toBe(0)
    expect(snap(8)).toBe(15)
    expect(snap(74)).toBe(75)
  })
})

describe('move', () => {
  test('the done-when: a gym session from 8:00 to 9:15', () => {
    const r = dragResult({
      mode: 'move',
      startsAt: at(24, 8),
      durationMin: 60,
      dxDays: 0,
      dyPx: ROW * 1.25,
      rowHeight: ROW,
    })
    expect(hhmm(r.startsAt)).toBe('24 09:15')
    expect(r.durationMin).toBe(60)
  })

  test('lands on the clock grid, not on the old offset', () => {
    const r = dragResult({
      mode: 'move',
      startsAt: at(24, 8, 7),
      durationMin: 30,
      dxDays: 0,
      dyPx: ROW / 4,
      rowHeight: ROW,
    })
    expect(hhmm(r.startsAt)).toBe('24 08:15')
  })

  test('moves across days on the calendar', () => {
    const r = dragResult({
      mode: 'move',
      startsAt: at(24, 8),
      durationMin: 60,
      dxDays: 2,
      dyPx: -ROW,
      rowHeight: ROW,
    })
    expect(hhmm(r.startsAt)).toBe('26 07:00')
  })

  test('never runs past midnight or before it', () => {
    const late = dragResult({
      mode: 'move',
      startsAt: at(24, 22),
      durationMin: 90,
      dxDays: 0,
      dyPx: ROW * 5,
      rowHeight: ROW,
    })
    expect(hhmm(late.startsAt)).toBe('24 22:30')
    const early = dragResult({
      mode: 'move',
      startsAt: at(24, 1),
      durationMin: 60,
      dxDays: 0,
      dyPx: -ROW * 5,
      rowHeight: ROW,
    })
    expect(hhmm(early.startsAt)).toBe('24 00:00')
  })

  test('an untimed task keeps the length it is drawn with', () => {
    const r = dragResult({
      mode: 'move',
      startsAt: at(24, 8),
      durationMin: undefined,
      dxDays: 0,
      dyPx: 0,
      rowHeight: ROW,
    })
    expect(r.durationMin).toBe(30)
  })
})

describe('resize', () => {
  test('any multiple of fifteen, start untouched', () => {
    const r = dragResult({
      mode: 'resize',
      startsAt: at(24, 8),
      durationMin: 60,
      dxDays: 0,
      dyPx: ROW * 0.25,
      rowHeight: ROW,
    })
    expect(hhmm(r.startsAt)).toBe('24 08:00')
    expect(r.durationMin).toBe(75)
  })

  test('never shorter than fifteen minutes', () => {
    const r = dragResult({
      mode: 'resize',
      startsAt: at(24, 8),
      durationMin: 60,
      dxDays: 0,
      dyPx: -ROW * 3,
      rowHeight: ROW,
    })
    expect(r.durationMin).toBe(15)
  })

  test('stops at midnight', () => {
    const r = dragResult({
      mode: 'resize',
      startsAt: at(24, 23),
      durationMin: 30,
      dxDays: 0,
      dyPx: ROW * 4,
      rowHeight: ROW,
    })
    expect(r.durationMin).toBe(60)
  })
})

describe('series', () => {
  test('the row shifts by as much as the occurrence moved', () => {
    const march = new Date(2026, 2, 3, 8).getTime()
    expect(shiftSeries(march, at(24, 8), at(24, 9, 15))).toBe(
      march + 75 * 60_000,
    )
  })

  test('says what moved in words', () => {
    expect(seriesPhrase('FREQ=DAILY', at(24, 8))).toBe('every day')
    expect(seriesPhrase('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', at(24, 8))).toBe(
      'every weekday',
    )
    expect(seriesPhrase('FREQ=WEEKLY', at(22, 8))).toBe('every Tuesday')
  })
})
