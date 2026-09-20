import { localToday } from './today'

/* A goal's timeline (R3): the day it was made (0), its milestones in the
   order the person set (1, 2, 3…), and the goal itself at its deadline.

   Shape only. There is no fraction here and there must never be one: the
   number of milestones is a count of steps someone wrote down, not a
   denominator, so "2 of 4" or a filled bar would be an invented metric.
   "Next" is the first unreached step — the one live thing, so the only one
   that gets lavender. */

export type TimelineNode =
  | { kind: 'start'; date: string }
  | {
      kind: 'milestone'
      id: string
      number: number
      title: string
      dueDate?: string
      /** "HH:MM" on the due day, never without one (convex/schema.ts). */
      dueTime?: string
      reachedAt?: number
      state: 'reached' | 'next' | 'ahead'
    }
  | { kind: 'end'; deadline?: string }

export function goalTimeline(
  goal: { _creationTime: number; deadline?: string },
  milestones: Array<{
    _id: string
    title: string
    dueDate?: string
    dueTime?: string
    reachedAt?: number
    sortOrder: number
  }>,
): Array<TimelineNode> {
  const ordered = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder)
  /* The first step not yet reached, whatever happened after it: reaching
     step 3 before step 2 is allowed, and does not make 2 stop being next. */
  const nextId = ordered.find((x) => x.reachedAt === undefined)?._id

  const steps: Array<TimelineNode> = ordered.map((x, i) => ({
    kind: 'milestone',
    id: x._id,
    number: i + 1,
    title: x.title,
    ...(x.dueDate === undefined ? {} : { dueDate: x.dueDate }),
    ...(x.dueTime === undefined ? {} : { dueTime: x.dueTime }),
    ...(x.reachedAt === undefined ? {} : { reachedAt: x.reachedAt }),
    state:
      x.reachedAt !== undefined
        ? 'reached'
        : x._id === nextId
          ? 'next'
          : 'ahead',
  }))

  return [
    { kind: 'start', date: localToday(new Date(goal._creationTime)) },
    ...steps,
    goal.deadline === undefined
      ? { kind: 'end' }
      : { kind: 'end', deadline: goal.deadline },
  ]
}
