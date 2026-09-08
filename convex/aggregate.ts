import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'

/* PLAN.md §1: every number on screen comes from exactly one of three sources —
   a log count over a period, the latest stateSnapshots row for a key, or an
   entity count over projects/tasks. All three live here and nowhere else.
   Components read these numbers; they never compute them.
 
   Phase 3 needs only the third. monthCounts() and currentState() arrive with
   the dashboard in Phase 4.
 
   None of these can produce a score, an index or a percentage. `done` and
   `total` are handed over separately on purpose: a component may render
   "11 of 17", and a bar only where goals.targetValue gives a real denominator.
   Returning a ratio here would make the wrong thing easy. */

const MAX_ROWS = 500

/**
 * Rows in `tasks` matching a filter, per chain. The chains grid's
 * "11 of 17 tasks".
 *
 * Counted rather than stored: a denormalised counter would be a second source
 * of truth for the same fact, and the first thing to drift.
 */
export const entityCounts = query({
  args: {},
  returns: v.object({
    activeProjects: v.number(),
    focusProjects: v.number(),
    tasksByProject: v.record(
      v.string(),
      v.object({ done: v.number(), total: v.number(), open: v.number() }),
    ),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    const tasksByProject: Record<
      string,
      { done: number; total: number; open: number }
    > = {}

    for (const status of ['open', 'done', 'skipped'] as const) {
      const rows = await ctx.db
        .query('tasks')
        .withIndex('by_owner_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', status),
        )
        .take(MAX_ROWS)

      for (const task of rows) {
        if (task.projectId === undefined) continue
        const key = task.projectId
        tasksByProject[key] ??= { done: 0, total: 0, open: 0 }
        tasksByProject[key].total += 1
        if (status === 'done') tasksByProject[key].done += 1
        if (status === 'open') tasksByProject[key].open += 1
      }
    }

    let activeProjects = 0
    let focusProjects = 0
    for (const status of ['focus', 'active'] as const) {
      const rows = await ctx.db
        .query('projects')
        .withIndex('by_owner_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', status),
        )
        .take(MAX_ROWS)
      activeProjects += rows.length
      if (status === 'focus') focusProjects = rows.length
    }

    return { activeProjects, focusProjects, tasksByProject }
  },
})
