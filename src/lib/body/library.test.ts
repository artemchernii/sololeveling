import { describe, expect, test } from 'vitest'

import { howToLink, KINDS, sessionText, workoutById, WORKOUTS } from './library'
import { readTicks, toggleTick, writeTicks } from './ticks'

describe('workouts', () => {
  test('ids are unique, and each exercise id is unique in its workout', () => {
    const ids = WORKOUTS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const w of WORKOUTS) {
      const ex = w.exercises.map((e) => e.id)
      expect(new Set(ex).size).toBe(ex.length)
    }
  })

  test('every workout files under a known kind, and every kind has one', () => {
    for (const w of WORKOUTS) expect(KINDS).toContain(w.kind)
    for (const kind of KINDS) {
      expect(WORKOUTS.some((w) => w.kind === kind)).toBe(true)
    }
  })

  test('gym is split into back, chest & shoulders, legs', () => {
    expect(WORKOUTS.filter((w) => w.kind === 'gym').map((w) => w.name)).toEqual(
      ['Back day', 'Chest & shoulders', 'Leg day'],
    )
  })

  test('lookup by id', () => {
    expect(workoutById('gym-legs')?.name).toBe('Leg day')
    expect(workoutById('nope')).toBeUndefined()
    expect(workoutById(null)).toBeUndefined()
  })

  test('a session names what was ticked, in the workout order', () => {
    const back = workoutById('gym-back')!
    expect(sessionText(back, ['face-pull', 'lat-pulldown', 'nope'])).toBe(
      'Back day — Lat pulldown, Face pull',
    )
    expect(sessionText(back, [])).toBe('Back day')
  })

  test('watch how is a video search for the move', () => {
    expect(howToLink({ name: "Child's pose" })).toBe(
      "https://www.youtube.com/results?search_query=Child's%20pose%20exercise%20how%20to",
    )
  })
})

describe('ticks — a guide for today, not a record', () => {
  const TODAY = '2026-09-26'

  test('round trip, and toggling on and off', () => {
    let ticks = toggleTick({}, 'back', 'cat-cow')
    ticks = toggleTick(ticks, 'back', 'bird-dog')
    ticks = toggleTick(ticks, 'back', 'cat-cow')
    expect(readTicks(writeTicks(ticks, TODAY), TODAY)).toEqual({
      back: ['bird-dog'],
    })
  })

  test("yesterday's ticks are gone today", () => {
    const raw = writeTicks({ back: ['cat-cow'] }, '2026-09-25')
    expect(readTicks(raw, TODAY)).toEqual({})
  })

  test('nothing stored, or junk, reads as none', () => {
    expect(readTicks(null, TODAY)).toEqual({})
    expect(readTicks('{not json', TODAY)).toEqual({})
    expect(readTicks('"a string"', TODAY)).toEqual({})
    expect(
      readTicks(
        JSON.stringify({ day: TODAY, ticks: { back: [1, 'x'] } }),
        TODAY,
      ),
    ).toEqual({ back: ['x'] })
  })
})
