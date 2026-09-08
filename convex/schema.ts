import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/* PLAN.md §2. Every table carries `ownerId` — the Clerk `identity.subject` —
   and an owner-scoped index, so a query that reads across owners cannot be
   written by accident. There is one user today; the schema does not know that,
   and retrofitting ownership later is a day of work and a way to leak a net
   worth to a friend (§3b.4).

   Each index leads with `ownerId`, which means the same index also serves the
   owner-only read: `withIndex('by_owner_status', q => q.eq('ownerId', id))` is
   a prefix scan, not a table scan. No function needs a `.filter()` to stay in
   its own lane. */

export const areaValidator = v.union(
  v.literal('business'),
  v.literal('portuguese'),
  v.literal('body'),
  v.literal('money'),
  v.literal('social'),
  v.literal('career'),
  v.literal('style'),
  v.literal('knowledge'),
  v.literal('life'),
)

const goalStatus = v.union(
  v.literal('active'),
  v.literal('done'),
  v.literal('dropped'),
)

const projectStatus = v.union(
  v.literal('focus'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('completed'),
  v.literal('archived'),
)

const taskStatus = v.union(
  v.literal('open'),
  v.literal('done'),
  v.literal('skipped'),
)

/* Evidence, not intent. `task_done` is what ticking a box writes; every other
   kind is a thing that actually happened and the user confirmed (§3b.1). */
const logKind = v.union(
  v.literal('workout'),
  v.literal('weight'),
  v.literal('expense'),
  v.literal('transfer'),
  v.literal('session'),
  v.literal('conversation'),
  v.literal('event'),
  v.literal('people_met'),
  v.literal('task_done'),
  v.literal('piece'),
  v.literal('note'),
  v.literal('idea'),
  v.literal('custom'),
)

const noteKind = v.union(
  v.literal('note'),
  v.literal('idea'),
  v.literal('book'),
  v.literal('reference'),
)

const reviewPeriod = v.union(
  v.literal('daily'),
  v.literal('weekly'),
  v.literal('monthly'),
)

const area = areaValidator

export default defineSchema({
  goals: defineTable({
    ownerId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    area,
    status: goalStatus,
    /* A target is what makes a progress bar honest. `targetLabel` is the human
       form ("B2", "€80,000"); `targetValue` + `unit` exist only when the goal
       is genuinely measurable, and only they may be divided by. */
    targetLabel: v.optional(v.string()),
    targetValue: v.optional(v.number()),
    unit: v.optional(v.string()),
    deadline: v.optional(v.string()), // ISO date
  }).index('by_owner_status', ['ownerId', 'status']),

  /* A chain is a goal with a project under it, so goalId is required: a project
     that answers to nothing is the thing this app exists to prevent. */
  projects: defineTable({
    ownerId: v.string(),
    goalId: v.id('goals'),
    title: v.string(),
    description: v.optional(v.string()),
    status: projectStatus,
    deadline: v.optional(v.string()), // ISO date
  }).index('by_owner_status', ['ownerId', 'status']), // one 'focus' per owner — setFocus enforces

  tasks: defineTable({
    ownerId: v.string(),
    title: v.string(), // a task is creatable from this alone
    notes: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
    area: v.optional(area),
    dueDate: v.optional(v.string()), // ISO date
    scheduledAt: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    rrule: v.optional(v.string()), // recurring template; instances expanded on the client
    priority: v.number(),
    status: taskStatus,
    completedAt: v.optional(v.number()),
    /* ISO date, set only while this task is one of today's three (§3c.1).
       pickForToday sets it; complete and dropFromToday clear it. */
    todayFor: v.optional(v.string()),
  })
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_owner_today', ['ownerId', 'todayFor'])
    .index('by_project', ['projectId'])
    .index('by_owner_due', ['ownerId', 'dueDate']),

  events: defineTable({
    ownerId: v.string(),
    title: v.string(),
    area: v.optional(area),
    projectId: v.optional(v.id('projects')),
    startsAt: v.number(),
    endsAt: v.number(),
    rrule: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index('by_owner_start', ['ownerId', 'startsAt'])
    /* A series that began in March still has occurrences in June, so a window
       read on `startsAt` cannot find it — the row is behind the window and the
       occurrences are computed. This index is how the running series are read
       without scanning every past event. PLAN §2 lists only `by_owner_start`;
       this is the one addition, and it exists because expansion is client-side.
       `.gte('rrule', '')` selects exactly the rows that have one: an absent
       optional field sorts before every string. */
    .index('by_owner_rrule', ['ownerId', 'rrule']),

  /* Quick capture lands here. Append-only: a log is a record of something that
     happened, so it is never edited into a different truth. */
  logs: defineTable({
    ownerId: v.string(),
    kind: logKind,
    area,
    occurredAt: v.number(),
    value: v.optional(v.number()), // 60 (min), 48 (eur), 75.4 (kg)
    unit: v.optional(v.string()),
    text: v.optional(v.string()), // "push day", "groceries"
    taskId: v.optional(v.id('tasks')),
    projectId: v.optional(v.id('projects')),
    meta: v.optional(
      v.object({
        reps: v.optional(v.number()),
        sets: v.optional(v.number()),
        weightKg: v.optional(v.number()),
        category: v.optional(v.string()),
        people: v.optional(v.number()),
      }),
    ),
  })
    .index('by_owner_time', ['ownerId', 'occurredAt'])
    .index('by_owner_area_time', ['ownerId', 'area', 'occurredAt']),

  /* The second number source: latest row for a key wins. Keys in use so far —
     weight, bench, net_worth, cefr_level, protein_avg, savings. */
  stateSnapshots: defineTable({
    ownerId: v.string(),
    area,
    key: v.string(),
    value: v.optional(v.number()),
    textValue: v.optional(v.string()),
    unit: v.optional(v.string()),
    recordedAt: v.number(),
  }).index('by_owner_key_time', ['ownerId', 'key', 'recordedAt']),

  notes: defineTable({
    ownerId: v.string(),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
    kind: noteKind,
  }).index('by_owner_kind', ['ownerId', 'kind']),

  principles: defineTable({
    ownerId: v.string(),
    text: v.string(),
    sortOrder: v.number(),
  }).index('by_owner_order', ['ownerId', 'sortOrder']),

  reviews: defineTable({
    ownerId: v.string(),
    period: reviewPeriod,
    periodStart: v.string(), // ISO date
    closedAt: v.optional(v.number()),
    answers: v.object({
      didHappen: v.optional(v.string()), // what I actually did
      movedForward: v.optional(v.string()),
      avoided: v.optional(v.string()),
      overthought: v.optional(v.string()),
      shouldChange: v.optional(v.string()),
    }),
    decision: v.optional(v.string()), // the one sentence "what changes next week"
  }).index('by_owner_period_start', ['ownerId', 'period', 'periodStart']),
})
