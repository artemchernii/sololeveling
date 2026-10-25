import { describe, expect, it } from 'vitest'

import { monthSix, monthWorth, sameDays } from './monthSix'

const DAY = 86_400_000
const prev = 0
const days = [30 * DAY, 31 * DAY, 32 * DAY]
const end = 33 * DAY

describe('monthSix', () => {
  it('counts each of the five by day, the month before as one number', () => {
    const six = monthSix(
      [
        { kind: 'workout', area: 'body', occurredAt: DAY },
        { kind: 'workout', area: 'body', occurredAt: 31 * DAY + 5 },
        { kind: 'session', area: 'portuguese', occurredAt: 30 * DAY },
        { kind: 'session', area: 'work', occurredAt: 30 * DAY },
        { kind: 'post', area: 'social', occurredAt: 32 * DAY },
        {
          kind: 'intake',
          area: 'body',
          occurredAt: 32 * DAY,
          meta: { category: 'supplements' },
        },
        { kind: 'workout', area: 'body', occurredAt: end },
      ],
      [
        { repo: 'a', authoredAt: 30 * DAY },
        { repo: 'a', authoredAt: 30 * DAY, isMerge: true },
      ],
      ['portuguese'],
      prev,
      days,
      end,
    )
    expect(six.workout).toEqual({ days: [0, 1, 0], prev: 1 })
    expect(six.langs).toEqual({
      days: [1, 0, 0],
      prev: 0,
      byArea: { portuguese: 1 },
    })
    expect(six.post.days).toEqual([0, 0, 1])
    expect(six.shake.days).toEqual([0, 0, 1])
    expect(six.commits).toEqual({ days: [1, 0, 0], prev: 0 })
  })

  it("splits this month's sessions by language, never the month before", () => {
    const six = monthSix(
      [
        { kind: 'session', area: 'portuguese', occurredAt: DAY },
        { kind: 'session', area: 'portuguese', occurredAt: 30 * DAY },
        { kind: 'session', area: 'english', occurredAt: 31 * DAY },
        { kind: 'session', area: 'english', occurredAt: 32 * DAY },
      ],
      [],
      ['portuguese', 'english'],
      prev,
      days,
      end,
    )
    expect(six.langs.prev).toBe(1)
    expect(six.langs.byArea).toEqual({ portuguese: 1, english: 2 })
  })

  /* 25 Oct: the month before over the same days, not all of it. */
  it('counts the month before only up to its cut', () => {
    const six = monthSix(
      [
        { kind: 'post', area: 'social', occurredAt: DAY },
        { kind: 'post', area: 'social', occurredAt: 10 * DAY },
        { kind: 'post', area: 'social', occurredAt: 31 * DAY },
      ],
      [{ repo: 'a', authoredAt: 20 * DAY }],
      ['portuguese'],
      prev,
      days,
      end,
      5 * DAY,
    )
    expect(six.post).toEqual({ days: [0, 1, 0], prev: 1 })
    expect(six.commits.prev).toBe(0)
  })
})

describe('sameDays', () => {
  it('25 Oct against 1–25 Sep', () => {
    const b = sameDays(new Date(2026, 9, 25, 10))
    expect(b.span).toBe('1–25 SEP')
    expect(b.prevCut).toBe(new Date(2026, 8, 26).getTime())
  })

  it('31 Oct against all 30 days of September', () => {
    const b = sameDays(new Date(2026, 9, 31, 23))
    expect(b.span).toBe('1–30 SEP')
    expect(b.prevCut).toBe(new Date(2026, 9, 1).getTime())
  })

  it('30 Mar against 1–28 Feb', () => {
    expect(sameDays(new Date(2026, 2, 30)).span).toBe('1–28 FEB')
  })

  it('1 Jan against 1 Dec', () => {
    const b = sameDays(new Date(2027, 0, 1))
    expect(b.span).toBe('1 DEC')
    expect(b.prevCut).toBe(new Date(2026, 11, 2).getTime())
  })
})

/* 20 Oct: the Revolut broker cash, first read on the 20th, showed as ▲€17k. */
describe('monthWorth', () => {
  it('a line first read this month is missing on the day before, not in', () => {
    expect(
      monthWorth([44_800, 44_900, 62_500], [{ at: 3, value: 17_400 }], 1),
    ).toEqual({ was: 44_800, now: 62_500, missing: 17_400, delta: 300 })
  })
  it('a line already there that day is not missing', () => {
    expect(monthWorth([100, 150], [{ at: 1, value: 50 }], 1)).toEqual({
      was: 100,
      now: 150,
      missing: 0,
      delta: 50,
    })
  })
  it('no reading that day: no change', () => {
    expect(monthWorth([null, 200], [], 1).delta).toBe(0)
  })
})
