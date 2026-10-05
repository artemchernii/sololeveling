import { describe, expect, test } from 'vitest'

import { freshness } from './freshness'

const now = new Date(2026, 8, 27, 18).getTime()

describe('freshness', () => {
  test('an August statement read today: says both, and is out of date', () => {
    const f = freshness(
      [
        {
          recordedAt: new Date(2026, 7, 31, 23).getTime(),
          writtenAt: new Date(2026, 8, 27, 17).getTime(),
          source: 'statement',
        },
      ],
      now,
    )
    expect(f.label).toBe('statement read today · balance of Aug 31')
    expect(f.stale).toBe(true)
    expect(f.todo).toContain('Aug 31')
  })

  test('typed three days ago, true that day: fresh, one time only', () => {
    const t = new Date(2026, 8, 24, 10).getTime()
    const f = freshness([{ recordedAt: t, writtenAt: t, source: 'typed' }], now)
    expect(f).toMatchObject({ label: 'typed 3d ago', stale: false, todo: null })
  })

  test('nothing read', () => {
    expect(
      freshness([{ recordedAt: null, writtenAt: null, source: null }], now)
        .label,
    ).toBe('no balance yet')
  })
})

test('an account with two pockets names the old one (5 Oct)', () => {
  const at = new Date(2026, 9, 5, 12).getTime()
  const f = freshness(
    [
      {
        currency: 'EUR',
        recordedAt: at - 86_400_000,
        writtenAt: null,
        source: 'statement',
      },
      {
        currency: 'USD',
        recordedAt: at - 9 * 86_400_000,
        writtenAt: null,
        source: 'typed',
      },
    ],
    at,
  )
  expect(f.label).toBe('USD typed 9d ago')
  expect(f.stale).toBe(true)
  expect(f.todo).toMatch(/^Its USD balance is from/)
})
