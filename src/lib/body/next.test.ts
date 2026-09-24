import { describe, expect, test } from 'vitest'

import { lookupRef, PROGRAMS, programRefs, refFor } from './library'
import { nextRoutine } from './next'

const DAY = 86_400_000
const TODAY = new Date(2026, 8, 25).getTime()

function run(picked: Array<string>, last: Record<string, number>) {
  return nextRoutine(new Set(picked), (id) => last[id] ?? null, TODAY)
}

describe('nextRoutine — one routine for today', () => {
  test('nothing picked, nothing suggested', () => {
    expect(run([], {})).toBeNull()
  })

  test('mobility comes first when not done today', () => {
    const pick = run(['back', 'gym-a', 'gym-b'], { back: TODAY - DAY })
    expect(pick?.day.id).toBe('back')
    expect(pick?.reason).toMatch(/not done today/i)
  })

  test('after mobility, a rested gym day — the one done longest ago', () => {
    const pick = run(['back', 'gym-a', 'gym-b'], {
      back: TODAY + 1000,
      'gym-a': TODAY - 2 * DAY,
      'gym-b': TODAY - 4 * DAY,
    })
    expect(pick?.day.id).toBe('gym-b')
    expect(pick?.reason).toContain('Gym A')
  })

  test('no gym the day after a gym day', () => {
    const pick = run(['back', 'gym-a', 'gym-b', 'hiking'], {
      back: TODAY + 1000,
      'gym-a': TODAY - DAY + 5000,
    })
    expect(pick?.day.id).toBe('hiking')
  })

  test('a never-done gym day is first', () => {
    const pick = run(['gym-a', 'gym-b'], { 'gym-a': TODAY - 3 * DAY })
    expect(pick?.day.id).toBe('gym-b')
  })

  test('everything done today: nothing', () => {
    expect(
      run(['back', 'hips'], { back: TODAY + 1, hips: TODAY + 2 }),
    ).toBeNull()
  })
})

describe('library', () => {
  test('every ref is unique and finds its way back', () => {
    const refs = PROGRAMS.flatMap(programRefs)
    expect(new Set(refs).size).toBe(refs.length)
    for (const ref of refs) expect(lookupRef(ref)).toBeDefined()
    expect(lookupRef(refFor('back', 'bird-dog'))?.exercise.name).toBe(
      'Bird-dog',
    )
    expect(lookupRef(undefined)).toBeUndefined()
  })

  test('refs fit what drills accept', () => {
    for (const ref of PROGRAMS.flatMap(programRefs)) {
      expect(ref).toMatch(/^[a-z0-9-]{1,64}$/)
    }
  })
})
