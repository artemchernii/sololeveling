import { describe, expect, test } from 'vitest'

import { announceQuest, onQuest, reachedTarget } from './quest'

describe('reachedTarget — the popup fires once, on the log that gets there', () => {
  test('crossing the target', () => {
    expect(reachedTarget(1, 2, 2)).toBe(true)
    expect(reachedTarget(0, 3, 2)).toBe(true)
  })

  test('not before, not after, not on the way down', () => {
    expect(reachedTarget(0, 1, 2)).toBe(false)
    expect(reachedTarget(2, 3, 2)).toBe(false)
    expect(reachedTarget(2, 1, 2)).toBe(false)
  })

  test('not on opening a page where it was already met', () => {
    expect(reachedTarget(undefined, 2, 2)).toBe(false)
  })

  test('not without a target, and not when the target is what moved', () => {
    expect(reachedTarget(1, 2, undefined)).toBe(false)
    /* The count stays at 2 while he lowers the target from 3 to 2. */
    expect(reachedTarget(2, 2, 2)).toBe(false)
  })
})

describe('announceQuest', () => {
  test('reaches every host until it stops listening', () => {
    const seen: Array<string> = []
    const stop = onQuest((q) => seen.push(q.title))
    const quest = { title: 'Class', line: '2 of 2', area: 'pt', icon: null }
    announceQuest(quest)
    stop()
    announceQuest(quest)
    expect(seen).toEqual(['Class'])
  })
})
