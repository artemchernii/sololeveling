import { describe, expect, test } from 'vitest'

import { goalTimeline } from './goal-timeline'

const goal = {
  _creationTime: new Date(2026, 8, 1, 10).getTime(),
  deadline: '2027-03-01',
}
const m = (
  id: string,
  sortOrder: number,
  reachedAt?: number,
  dueDate?: string,
  dueTime?: string,
) => ({
  _id: id,
  title: id,
  sortOrder,
  reachedAt,
  dueDate,
  dueTime,
})

describe('a goal’s timeline: 0 — 1 — 2 — 3 — goal', () => {
  test('starts on the day the goal was made and ends at its deadline', () => {
    const nodes = goalTimeline(goal, [])
    expect(nodes).toEqual([
      { kind: 'start', date: '2026-09-01' },
      { kind: 'end', deadline: '2027-03-01' },
    ])
  })

  test('numbers milestones by their order, not by the array they came in', () => {
    const nodes = goalTimeline(goal, [m('c', 2), m('a', 0), m('b', 1)])
    expect(
      nodes.filter((n) => n.kind === 'milestone').map((n) => [n.id, n.number]),
    ).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  test('the first unreached milestone is next; the rest ahead; reached ones stay reached', () => {
    const nodes = goalTimeline(goal, [m('a', 0, 1), m('b', 1), m('c', 2)])
    expect(
      nodes.filter((n) => n.kind === 'milestone').map((n) => n.state),
    ).toEqual(['reached', 'next', 'ahead'])
  })

  test('a reached milestone after an unreached one is still reached — order is not enforced', () => {
    const nodes = goalTimeline(goal, [m('a', 0), m('b', 1, 1)])
    expect(
      nodes.filter((n) => n.kind === 'milestone').map((n) => n.state),
    ).toEqual(['next', 'reached'])
  })

  test('all reached: nothing is next', () => {
    const nodes = goalTimeline(goal, [m('a', 0, 1), m('b', 1, 2)])
    expect(
      nodes.some((n) => n.kind === 'milestone' && n.state === 'next'),
    ).toBe(false)
  })

  test('no deadline is an end with no date', () => {
    expect(
      goalTimeline({ _creationTime: goal._creationTime }, []).at(-1),
    ).toEqual({ kind: 'end' })
  })

  test('a due date and a reached time are carried through; absent ones stay absent', () => {
    const [, withBoth, bare] = goalTimeline(goal, [
      m('a', 0, 1_700_000_000_000, '2026-11-01'),
      m('b', 1),
    ])
    expect(withBoth).toEqual({
      kind: 'milestone',
      id: 'a',
      number: 1,
      title: 'a',
      dueDate: '2026-11-01',
      reachedAt: 1_700_000_000_000,
      state: 'reached',
    })
    expect(bare).toEqual({
      kind: 'milestone',
      id: 'b',
      number: 2,
      title: 'b',
      state: 'next',
    })
  })

  test('an hour on the due day is carried through; a bare day has none', () => {
    const [, timed, allDay] = goalTimeline(goal, [
      m('a', 0, undefined, '2026-11-01', '14:00'),
      m('b', 1, undefined, '2026-11-02'),
    ])
    expect(timed).toMatchObject({ dueDate: '2026-11-01', dueTime: '14:00' })
    expect(allDay).toMatchObject({ dueDate: '2026-11-02' })
    expect(allDay).not.toHaveProperty('dueTime')
  })

  test('the start is the local day of creation, not a UTC one', () => {
    /* 23:30 local on 1 Sep is 2 Sep in UTC east of Greenwich; the timeline
       says the day he made it, in his own clock. */
    const late = { _creationTime: new Date(2026, 8, 1, 23, 30).getTime() }
    expect(goalTimeline(late, [])[0]).toEqual({
      kind: 'start',
      date: '2026-09-01',
    })
  })
})
