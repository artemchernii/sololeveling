import { describe, expect, it } from 'vitest'

import { monthSix } from './monthSix'

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
    expect(six.langs).toEqual({ days: [1, 0, 0], prev: 0 })
    expect(six.post.days).toEqual([0, 0, 1])
    expect(six.shake.days).toEqual([0, 0, 1])
    expect(six.commits).toEqual({ days: [1, 0, 0], prev: 0 })
  })
})
