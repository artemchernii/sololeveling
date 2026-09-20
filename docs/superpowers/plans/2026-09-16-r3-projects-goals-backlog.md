# R3 — Projects Deep, Goals With a Timeline, Backlog Bound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a project a place you can work from (its tasks, notes, time and commits), give goals a milestone timeline and deadlines, and let a backlog task be bound to a project or goal and put on the calendar — with every number still from a sanctioned source.

**Architecture:** Three slices, each its own branch and PR, merged in order. **R3a** adds two indexes (`logs.by_owner_project_time`, `notes.by_owner_project`), `aggregate.projectTime()`, `notes.listByProject`, `tasks.setGoal`, and rebuilds the project and backlog pages. **R3b** adds a `milestones` table owned by a goal, `goals.update`/`goals.get`, a pure `goalTimeline()` in `src/lib`, and lets a goal be created on its own. **R3c** is the first implementation of source 4: a `commits` table filled hourly by an internal Convex action from the public GitHub API, `projects.githubRepo`/`githubCheckedAt`, and `aggregate.projectCommits()`.

**Tech Stack:** TanStack Start (file routes; no new routes in R3), Convex (`convex-test` + vitest, `edge-runtime`, `TZ=Europe/Lisbon` pinned in `vitest.config.ts`), Tailwind v4 with Nocturne tokens. **No DOM in tests** — test `src/lib/*` and `convex/*`, verify components in the browser. No new dependency.

**Spec:** `PLAN.md` §3 page table rows Projects, Goals, Backlog; §3c; §4 row R3. Read `CLAUDE.md` first; it wins over habit.

**Status (end of 16 Sep):** R3a shipped as #34. Between R3a and R3b two Today PRs landed from Artem's use (#35, #36): a finished task keeps its slot, `tasks.reopen`, `tasks.pickedAt`, the backlog picker as an overlay, one focus rule for text fields, and the Projects tile renamed Tasks. Next: R3b (Tasks 6–9), then R3c (Tasks 10–12).

**Decisions taken with Artem on 16 Sep (do not re-open):**

1. **Three PRs, one plan:** `rethink-r3a` (project page + backlog), `rethink-r3b` (goal milestones), `rethink-r3c` (GitHub). Each branch starts from `master` after the previous PR is merged.
2. **Milestones belong to a goal** (their own table: title, optional date, reached time, order). The project page shows its goal's timeline; there is no second timeline on projects. Reaching one is one tap. Reaching the last milestone does **not** mark the goal done — "Reached it" stays an explicit act.
3. **Hours on a project are the sum of the minutes on its session logs**, computed in `aggregate.ts` as `projectTime()`. This is read as source 1 (the log rows, their own real unit), not a fifth source.
4. **GitHub:** the repo is public, so no token is needed. `projects.githubRepo` holds `owner/name`; an hourly cron stores each commit as a row; the page shows `12 this week · 8 last week · as of 14:02`. Commits never count toward THIS MONTH. If GitHub rate-limits the shared Convex egress (403), Artem creates a read-only token and it is set with `npx convex env set GITHUB_TOKEN …` — the code already reads it when present.
5. **Files wait for R4.** R3 shows the notes attached to a project; R4 puts files on notes, and they arrive on the project through those notes.
6. **A goal can exist without a project.** Projects are programming or business; a goal can be "gain 5 kg of muscle" or "no fap for a month". A project still always has a goal above it (`projects.goalId` stays required). The Goals page gets "New goal"; the New project form can hang a project on an existing goal.
7. **Backlog defaults:** each row says when it was added (`3d ago`); one picker binds it to a project or a goal; "put it on the calendar" sets `scheduledAt` + minutes through the existing `tasks.setSchedule`, and does not pick it for today.
8. **Where backlog tasks join a project:** from the Backlog page only. The project page creates new tasks; it does not list unbound backlog tasks, because unpicked tasks live on the backlog page and nowhere else (§3c.3).
9. **§3c.2 governs the projects grid, not the project's own page.** Non-focus cards on `/projects` stay title + next action. `/projects/$id` is deep for every project — you opened it on purpose.
10. **The New project form is rebuilt in R3b, and gains Repo in R3c** (Artem, 16 Sep: "outline is bad", "maybe we can attach git projects — URL, optional"). Rows, in order: **Project** (title, first — it is the thing you know), **For** (a select of existing goals with "new goal…" last; a new goal's title and area appear only when that is chosen), **Ends** (optional). No "first project — the work that moves it" wording: it read as a wizard. In R3c the same form gains **Repo** (optional; `owner/name` or a github.com URL) and `projects.create` accepts it, so a project is connected from birth. The focus ring on its fields is already gone (#35).

## Global Constraints

- Every number on screen comes from `convex/aggregate.ts` (`CLAUDE.md` "Reality over gamification"). Components compose sanctioned values ("7h 30m this month · 9 sessions", "12 this week"); they never compute one. Durations and dates rendered as words ("3d ago", "ends 30 Sep") live in `src/lib/format.ts`, the same as `deadlineLabel`.
- No percentages, no scores, no "3 of 5 milestones" bar: a goal's milestones are a sequence, not a denominator. A bar renders only where `goals.targetValue` exists, and R3 adds none.
- Source 4 (R3c) meets `PLAN.md` §1's four conditions: **stored** (the `commits` table, never fetched at render), **attributed** (GitHub + `owner/name`, linked), **shown as of a time** (`githubCheckedAt`), **not a licence to derive** (counts of stored rows per week, and the rows themselves — no streaks, no "commits per day", no velocity).
- Three a day (`tasks.pickForToday`, `TODAY_FULL`) and "no backlog on Today" (§3c.3) are untouched. Nothing in R3 touches `/dashboard`.
- Lavender is reserved for live and focus. In R3 it marks the **next** unreached milestone and nothing else new.
- Colours, radii and spacing only from tokens; surfaces mix `lift`/`sink`, never `white`/`black` (`src/lib/theme-tokens.test.ts` enforces this).
- `useQuery` comes from `convex-helpers/react/cache/hooks` (eslint enforces), `useMutation` from `convex/react`.
- Every **public** Convex function opens with `requireUser(ctx)` and reads through an owner-leading index. The R3c cron's functions are `internal*` (unreachable from the internet, like `seed.ts`), act for every owner, and stamp each row with its project's `ownerId`. `projects.by_github_repo` is the one index not led by `ownerId`, and only those internal functions read it.
- A query that takes an id from a URL takes `v.string()` and `normalizeId`s it, returning empty/null for a bad or foreign id (the `projects.get` / `tasks.listByProject` pattern).
- Owner-isolation tests use **one** backend: `const t = convexTest(schema, modules)` then `t.withIdentity(...)` twice. Two `convexTest()` calls are two databases and prove nothing.
- Nothing is seeded. Rows created while checking in the browser are deleted before the task's commit. Artem's own goals, milestones, notes and repo binding are his; a check creates a row, reads it, and removes it. To reach Convex from the Browser pane's JavaScript tool on any app page:

  ```js
  const root = document.querySelector('main')
  let f = root[Object.keys(root).find((k) => k.startsWith('__reactFiber$'))]
  while (
    f &&
    !(f.memoizedProps?.client?.mutation && f.memoizedProps?.client?.watchQuery)
  )
    f = f.return
  const convex = f.memoizedProps.client
  // e.g. await convex.mutation('notes:remove', { noteId: '<id>' })
  ```

- Artem runs `pnpm dev` (and `convex dev`) on this working tree. Never `git stash` or `git checkout -- <file>` while working; copy files to the scratchpad to compare.
- Browser-pane quirks: Enter does not reach the page — dispatch `new KeyboardEvent('keydown',{key:'Enter',bubbles:true})`; React-controlled inputs need the native value setter plus an `input` event. Check pixels with a screenshot, not only the DOM.
- Every commit message explains why and ends with the attribution line the session reminder gives.
- Close each slice: `pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build` all pass. `gh pr merge` waits for CI (~55s); never `--admin`.

---

## File map

| slice | action | path                                         | responsibility                                                        |
| ----- | ------ | -------------------------------------------- | --------------------------------------------------------------------- |
| a     | modify | `convex/schema.ts`                           | `logs.by_owner_project_time`, `notes.by_owner_project`                |
| a     | modify | `convex/aggregate.ts`                        | `projectTime()`                                                       |
| a     | create | `convex/aggregate.project.test.ts`           | time on a project is its session minutes                              |
| a     | modify | `convex/notes.ts` (+ `notes.test.ts`)        | `listByProject`                                                       |
| a     | modify | `convex/tasks.ts` (+ `tasks.test.ts`)        | `setGoal`                                                             |
| a     | modify | `src/lib/format.ts` (+ test)                 | `durationLabel`, `agoLabel`, `localInputValue`                        |
| a     | create | `src/components/projects/ProjectNotes.tsx`   | the notes card on a project                                           |
| a     | modify | `src/routes/_app/projects.$id.tsx`           | time line in the header; tasks beside notes                           |
| a     | create | `src/components/backlog/BindSelect.tsx`      | one picker: a project, a goal, or nothing                             |
| a     | create | `src/components/backlog/ScheduleTask.tsx`    | put a task on the calendar, or take it off                            |
| a     | modify | `src/routes/_app/backlog.tsx`                | two-line rows: title, then added · bound to · on calendar             |
| a     | modify | `PLAN.md` §2, §4                             | the indexes; R3 split into three PRs                                  |
| b     | modify | `convex/schema.ts`                           | `milestones` table                                                    |
| b     | create | `convex/milestones.ts` (+ test)              | create, listByGoal, setReached, update, move, remove                  |
| b     | modify | `convex/goals.ts` (+ `goals.test.ts`)        | `get`, `update`; `remove` deletes the goal's milestones               |
| b     | create | `src/lib/goal-timeline.ts` (+ test)          | start · milestones (reached / next / ahead) · end                     |
| b     | create | `src/components/goals/GoalTimeline.tsx`      | draws the timeline; a tap reaches or un-reaches a milestone           |
| b     | create | `src/components/goals/MilestoneEditor.tsx`   | add, reorder, delete milestones                                       |
| b     | create | `src/components/goals/NewGoal.tsx`           | a goal on its own                                                     |
| b     | modify | `src/routes/_app/goals.tsx`                  | New goal, deadline editing, projects as links, timeline + editor      |
| b     | modify | `src/routes/_app/projects.index.tsx`         | New project can hang on an existing goal                              |
| b     | modify | `src/routes/_app/projects.$id.tsx`           | the goal's name and timeline                                          |
| b     | modify | `PLAN.md` §2                                 | milestones; a goal need not have a project                            |
| c     | modify | `convex/schema.ts`                           | `commits`; `projects.githubRepo`, `githubCheckedAt`, `by_github_repo` |
| c     | create | `convex/github.ts` (+ test)                  | `parseRepo`, `setRepo`, `listRecent`, the internal check functions    |
| c     | create | `convex/crons.ts`                            | hourly check                                                          |
| c     | modify | `convex/aggregate.ts`                        | `projectCommits()`; header comment: source 4 exists now               |
| c     | modify | `convex/projects.ts`                         | `remove` deletes the project's commits                                |
| c     | create | `src/components/projects/ProjectCommits.tsx` | connect a repo; counts, as-of, latest five                            |
| c     | modify | `src/routes/_app/projects.$id.tsx`           | mounts ProjectCommits                                                 |
| c     | modify | `PLAN.md` §1, §2; `CLAUDE.md`                | source 4's first reading; "three sources" → "four" in Working style   |

---

# R3a — the project page and the backlog — SHIPPED as #34

Branch: `git switch -c rethink-r3a master` (if `rethink-r3` exists from planning, rename it: `git branch -m rethink-r3 rethink-r3a`). This plan file is committed as the first commit on it.

### Task 1: Time on a project

**Files:**

- Modify: `convex/schema.ts` (the `logs` table's indexes)
- Modify: `convex/aggregate.ts` (append after `kindCount`)
- Create: `convex/aggregate.project.test.ts`
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**

- Produces: `api.aggregate.projectTime({ projectId: string, start: number, end: number }) → { minutes: number; sessions: number }`; `durationLabel(minutes: number): string` in `src/lib/format.ts`.

- [x] **Step 1: Write the failing Convex test**

Create `convex/aggregate.project.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* Logs refuse the future, so "now" is pinned. Only Date is faked: convex-test
   schedules with real timers. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 16, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

const SEP = new Date(2026, 8, 1).getTime()
const OCT = new Date(2026, 9, 1).getTime()

async function project(
  t: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
  title: string,
) {
  const goalId = await t.mutation(api.goals.create, {
    title: `goal for ${title}`,
    area: 'business',
  })
  return await t.mutation(api.projects.create, { goalId, title })
}

describe('time on a project (source 1: its session logs)', () => {
  test('sums the minutes of its sessions this month, and counts them', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const oreum = await project(me, 'Oreum')
    const other = await project(me, 'Solo Leveling')

    const log = (
      occurredAt: number,
      value: number | undefined,
      projectId = oreum,
    ) =>
      me.mutation(api.logs.create, {
        kind: 'session',
        area: 'business',
        occurredAt,
        value,
        unit: value === undefined ? undefined : 'min',
        projectId,
      })

    await log(new Date(2026, 8, 2, 9).getTime(), 90)
    await log(new Date(2026, 8, 15, 20).getTime(), 45)
    /* A session with no minutes still happened: counted, adds nothing. */
    await log(new Date(2026, 8, 16, 8).getTime(), undefined)
    /* Last month, and another project: neither. */
    await log(new Date(2026, 7, 31, 22).getTime(), 60)
    await log(new Date(2026, 8, 10, 9).getTime(), 30, other)

    expect(
      await me.query(api.aggregate.projectTime, {
        projectId: oreum,
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 135, sessions: 3 })
  })

  test('a ticked task on the project is not time spent on it', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const oreum = await project(me, 'Oreum')
    const taskId = await me.mutation(api.tasks.create, { title: 'Invoice' })
    await me.mutation(api.tasks.setProject, { taskId, projectId: oreum })
    await me.mutation(api.tasks.complete, { taskId })

    expect(
      await me.query(api.aggregate.projectTime, {
        projectId: oreum,
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 0, sessions: 0 })
  })

  test('another owner’s project reads as nothing, and a bad id does not throw', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const oreum = await project(me, 'Oreum')
    await me.mutation(api.logs.create, {
      kind: 'session',
      area: 'business',
      occurredAt: new Date(2026, 8, 2, 9).getTime(),
      value: 90,
      unit: 'min',
      projectId: oreum,
    })

    expect(
      await them.query(api.aggregate.projectTime, {
        projectId: oreum,
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 0, sessions: 0 })
    expect(
      await me.query(api.aggregate.projectTime, {
        projectId: 'not-an-id',
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 0, sessions: 0 })
  })
})
```

- [x] **Step 2: Run it to see it fail**

Run: `pnpm vitest run convex/aggregate.project.test.ts`
Expected: FAIL — `api.aggregate.projectTime` is undefined.

- [x] **Step 3: Add the index**

In `convex/schema.ts`, the `logs` table, after `.index('by_owner_area_time', …)`:

```ts
    .index('by_owner_area_time', ['ownerId', 'area', 'occurredAt'])
    /* Time on one project (R3): a range over one project's logs, rather than
       every log this month filtered in JavaScript. A log with no project has
       an absent projectId and never matches an eq(). */
    .index('by_owner_project_time', ['ownerId', 'projectId', 'occurredAt']),
```

(remove the trailing comma/paren from the previous last index accordingly so the chain ends with this one).

- [x] **Step 4: Implement `projectTime`**

Append to `convex/aggregate.ts`:

```ts
/**
 * Time on one project in a period: the minutes on its session logs, added
 * up, and how many sessions there were — "7h 30m this month · 9 sessions".
 *
 * Source 1. A sum rather than a count, and still only the log rows
 * themselves: each minute is one you logged with the project's verb
 * (`oreum 45`), in its own unit. Sessions only — a ticked task on the project
 * is intent, not time (§3b.1).
 *
 * The id comes from the page's URL, so it is a string: a bad or foreign id
 * reads as nothing, and the page already says "No such project".
 */
export const projectTime = query({
  args: {
    projectId: v.string(),
    /** Epoch ms, local midnight — inclusive. */
    start: v.number(),
    /** Epoch ms, local midnight — exclusive. */
    end: v.number(),
  },
  returns: v.object({ minutes: v.number(), sessions: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    if (projectId === null) return { minutes: 0, sessions: 0 }

    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_project_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('projectId', projectId)
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .take(MAX_ROWS)

    let minutes = 0
    let sessions = 0
    for (const row of rows) {
      if (row.kind !== 'session') continue
      sessions += 1
      minutes += row.value ?? 0
    }
    return { minutes, sessions }
  },
})
```

- [x] **Step 5: Run it to see it pass**

Run: `pnpm vitest run convex/aggregate.project.test.ts`
Expected: PASS (3 tests).

- [x] **Step 6: Write the failing format test**

Append to `src/lib/format.test.ts` (add `durationLabel` to its import from `./format`):

```ts
describe('durationLabel', () => {
  test('under an hour is minutes', () => {
    expect(durationLabel(45)).toBe('45m')
  })
  test('whole hours drop the minutes', () => {
    expect(durationLabel(120)).toBe('2h')
  })
  test('hours and minutes', () => {
    expect(durationLabel(450)).toBe('7h 30m')
  })
  test('a fraction of a minute is rounded, not shown', () => {
    expect(durationLabel(59.6)).toBe('1h')
  })
})
```

- [x] **Step 7: Run it to see it fail**

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: FAIL — `durationLabel` is not exported.

- [x] **Step 8: Implement**

Append to `src/lib/format.ts`:

```ts
/** "45m", "2h", "7h 30m" — minutes that were logged, said the short way. */
export function durationLabel(minutes: number): string {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
```

- [x] **Step 9: Run both, then typecheck**

Run: `pnpm vitest run src/lib/format.test.ts convex/aggregate.project.test.ts && pnpm typecheck`
Expected: PASS.

- [x] **Step 10: Commit**

```bash
git add convex/schema.ts convex/aggregate.ts convex/aggregate.project.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "Time on a project is the minutes on its session logs

R3's done-when asks for hours this month on Oreum's page. Those minutes
already exist — every \`oreum 45\` writes a session with the project on it —
so projectTime adds them up through a new owner+project+time index. Sessions
only: a ticked task is intent, not time.

<attribution line>"
```

---

### Task 2: Notes on a project, and a task bound to a goal

**Files:**

- Modify: `convex/schema.ts` (the `notes` table's indexes)
- Modify: `convex/notes.ts`, `convex/notes.test.ts`
- Modify: `convex/tasks.ts`, `convex/tasks.test.ts`

**Interfaces:**

- Produces: `api.notes.listByProject({ projectId: string }) → Array<Doc<'notes'>>` (newest first, at most 50); `api.tasks.setGoal({ taskId: Id<'tasks'>, goalId: Id<'goals'> | null }) → null` (sets the goal and clears the project; `null` clears the goal).

- [x] **Step 1: Write the failing tests**

Append to `convex/notes.test.ts` (it already has `api`, `convexTest`, `schema`, `modules`; add the two identity constants if the file does not define them under these names):

```ts
describe('notes on a project', () => {
  test('lists the notes attached to one project, newest first', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: 'https://clerk.test|user_me' })
    const goalId = await me.mutation(api.goals.create, {
      title: 'A business',
      area: 'business',
    })
    const oreum = await me.mutation(api.projects.create, {
      goalId,
      title: 'Oreum',
    })
    const other = await me.mutation(api.projects.create, {
      goalId,
      title: 'Other',
    })

    await me.mutation(api.notes.create, { title: 'Pricing', projectId: oreum })
    await me.mutation(api.notes.create, { title: 'Loose thought' })
    await me.mutation(api.notes.create, {
      title: 'Not this one',
      projectId: other,
    })
    await me.mutation(api.notes.create, {
      title: 'Onboarding',
      projectId: oreum,
    })

    const notes = await me.query(api.notes.listByProject, { projectId: oreum })
    expect(notes.map((n) => n.title)).toEqual(['Onboarding', 'Pricing'])
  })

  test('another owner’s project has no notes for you, and a bad id is empty', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: 'https://clerk.test|user_me' })
    const them = t.withIdentity({
      tokenIdentifier: 'https://clerk.test|user_them',
    })
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'business',
    })
    const oreum = await me.mutation(api.projects.create, {
      goalId,
      title: 'Oreum',
    })
    await me.mutation(api.notes.create, { title: 'Pricing', projectId: oreum })

    expect(
      await them.query(api.notes.listByProject, { projectId: oreum }),
    ).toEqual([])
    expect(
      await me.query(api.notes.listByProject, { projectId: 'nope' }),
    ).toEqual([])
  })
})
```

Append to `convex/tasks.test.ts`:

```ts
describe('a task bound to a goal without a project', () => {
  test('setGoal binds the goal and cuts the project loose', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: 'https://clerk.test|user_me' })
    const business = await me.mutation(api.goals.create, {
      title: 'A business',
      area: 'business',
    })
    const muscle = await me.mutation(api.goals.create, {
      title: 'Gain 5 kg of muscle',
      area: 'body',
    })
    const oreum = await me.mutation(api.projects.create, {
      goalId: business,
      title: 'Oreum',
    })
    const taskId = await me.mutation(api.tasks.create, { title: 'Buy protein' })
    await me.mutation(api.tasks.setProject, { taskId, projectId: oreum })

    await me.mutation(api.tasks.setGoal, { taskId, goalId: muscle })

    const [task] = (await me.query(api.tasks.listBacklog, {})).filter(
      (x) => x._id === taskId,
    )
    expect(task.goalId).toBe(muscle)
    expect(task.projectId).toBeUndefined()

    await me.mutation(api.tasks.setGoal, { taskId, goalId: null })
    const [loose] = (await me.query(api.tasks.listBacklog, {})).filter(
      (x) => x._id === taskId,
    )
    expect(loose.goalId).toBeUndefined()
  })

  test('refuses someone else’s goal', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: 'https://clerk.test|user_me' })
    const them = t.withIdentity({
      tokenIdentifier: 'https://clerk.test|user_them',
    })
    const theirGoal = await them.mutation(api.goals.create, {
      title: 'Theirs',
      area: 'life',
    })
    const taskId = await me.mutation(api.tasks.create, { title: 'Mine' })

    await expect(
      me.mutation(api.tasks.setGoal, { taskId, goalId: theirGoal }),
    ).rejects.toThrow('No such goal')
  })
})
```

- [x] **Step 2: Run them to see them fail**

Run: `pnpm vitest run convex/notes.test.ts convex/tasks.test.ts`
Expected: FAIL — `listByProject` / `setGoal` undefined.

- [x] **Step 3: Add the notes index**

In `convex/schema.ts`, the `notes` table, after `.index('by_owner_kind', ['ownerId', 'kind'])`:

```ts
    .index('by_owner_kind', ['ownerId', 'kind'])
    /* The notes on one project's page (R3). _creationTime is the implicit last
       column, so ordering desc is newest first without a sort. */
    .index('by_owner_project', ['ownerId', 'projectId'])
```

- [x] **Step 4: Implement `notes.listByProject`**

Append to `convex/notes.ts`:

```ts
/**
 * The notes attached to one project, newest first — the notes card on the
 * project page. Read by the page's URL, so the id is a string: a bad or
 * foreign id is an empty list, which reveals nothing.
 */
export const listByProject = query({
  args: { projectId: v.string() },
  returns: v.array(schema.doc('notes')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    if (projectId === null) return []
    return await ctx.db
      .query('notes')
      .withIndex('by_owner_project', (q) =>
        q.eq('ownerId', ownerId).eq('projectId', projectId),
      )
      .order('desc')
      .take(50)
  },
})
```

- [x] **Step 5: Implement `tasks.setGoal`**

Append to `convex/tasks.ts`, after `setProject`:

```ts
/**
 * Bind a task to a goal directly, or cut it loose. For work that serves a
 * goal with no project under it — "buy protein" under "gain 5 kg of muscle"
 * (R3, 16 Sep: a goal need not have a project).
 *
 * A task under a project already carries that project's goal (setProject), so
 * choosing a goal here clears the project: the goal is now the authority.
 */
export const setGoal = mutation({
  args: {
    taskId: v.id('tasks'),
    goalId: v.union(v.id('goals'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)

    if (args.goalId !== null) {
      const goal = await ctx.db.get(args.goalId)
      if (goal === null || goal.ownerId !== ownerId) {
        throw new Error('No such goal')
      }
    }

    await ctx.db.patch(args.taskId, {
      goalId: args.goalId ?? undefined,
      projectId: undefined,
    })
    return null
  },
})
```

- [x] **Step 6: Run them to see them pass**

Run: `pnpm vitest run convex/notes.test.ts convex/tasks.test.ts && pnpm typecheck`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add convex/schema.ts convex/notes.ts convex/notes.test.ts convex/tasks.ts convex/tasks.test.ts
git commit -m "A project can list its notes; a task can answer to a goal alone

Two reads R3's pages need. Notes already carried projectId but nothing
could find them by it. And a goal can now stand without a project (\"gain
5 kg of muscle\"), so a backlog task needs a way to serve it directly —
setGoal binds the goal and clears the project, which would otherwise
disagree with it.

<attribution line>"
```

---

### Task 3: The project page, deep

**Files:**

- Create: `src/components/projects/ProjectNotes.tsx`
- Modify: `src/routes/_app/projects.$id.tsx`
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**

- Consumes: `api.aggregate.projectTime`, `durationLabel` (Task 1); `api.notes.listByProject` (Task 2).
- Produces: `agoLabel(ms: number, now?: Date): string`; `<ProjectNotes projectId={Id<'projects'>} />`.

- [x] **Step 1: Write the failing `agoLabel` test**

Append to `src/lib/format.test.ts` (add `agoLabel` to the import):

```ts
describe('agoLabel', () => {
  const now = new Date(2026, 8, 16, 10, 0)
  test('today and yesterday by calendar day, not by 24 hours', () => {
    expect(agoLabel(new Date(2026, 8, 16, 0, 5).getTime(), now)).toBe('today')
    expect(agoLabel(new Date(2026, 8, 15, 23, 50).getTime(), now)).toBe(
      'yesterday',
    )
  })
  test('days up to two weeks', () => {
    expect(agoLabel(new Date(2026, 8, 13, 9).getTime(), now)).toBe('3d ago')
    expect(agoLabel(new Date(2026, 8, 3, 9).getTime(), now)).toBe('13d ago')
  })
  test('weeks up to two months', () => {
    expect(agoLabel(new Date(2026, 8, 2, 9).getTime(), now)).toBe('2w ago')
    expect(agoLabel(new Date(2026, 6, 20, 9).getTime(), now)).toBe('8w ago')
  })
  test('older than that is the date', () => {
    expect(agoLabel(new Date(2026, 6, 1, 9).getTime(), now)).toBe(
      new Date(2026, 6, 1).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      }),
    )
  })
})
```

- [x] **Step 2: Run to fail**

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: FAIL — `agoLabel` not exported.

- [x] **Step 3: Implement**

Append to `src/lib/format.ts`:

```ts
/**
 * How long ago something was written down: "today", "yesterday", "3d ago",
 * "2w ago", then the date. Whole local days, so last night is yesterday.
 * A display of `_creationTime`, like deadlineLabel is of a deadline — not a
 * metric.
 */
export function agoLabel(ms: number, now: Date = new Date()): string {
  const day = new Date(ms).setHours(0, 0, 0, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  const days = Math.round((today - day) / MS_PER_DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d ago`
  if (days < 60) return `${Math.floor(days / 7)}w ago`
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}
```

Run: `pnpm vitest run src/lib/format.test.ts` — Expected: PASS.

- [x] **Step 4: Create `ProjectNotes`**

Create `src/components/projects/ProjectNotes.tsx`:

```tsx
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { SaveGlyph, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { agoLabel } from '@/lib/format'

/* The notes attached to a project (R3). Writing one here creates it already
   attached and opens it, because a note is written on its own page. Files
   arrive in R4, on notes — and so on the project through this card. */
export function ProjectNotes({ projectId }: { projectId: Id<'projects'> }) {
  const notes = useQuery(api.notes.listByProject, { projectId })
  const create = useMutation(api.notes.create)
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const writing = useSave()

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || writing.busy) return
    const noteId = await writing.run(() =>
      create({ title: trimmed, projectId }),
    )
    setTitle('')
    if (noteId) await navigate({ to: '/notes/$id', params: { id: noteId } })
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="label-caps">Notes</div>

      {notes === undefined ? (
        <SkeletonRows rows={3} />
      ) : notes.length === 0 ? (
        <p className="text-[13px] text-ink-500">No notes on this project.</p>
      ) : (
        <div className="flex flex-col">
          {notes.map((note) => (
            <Link
              key={note._id}
              to="/notes/$id"
              params={{ id: note._id }}
              className="flex items-baseline gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0"
            >
              <span className="flex-1 truncate text-[13px] text-foreground transition-colors hover:text-lav-300">
                {note.title}
              </span>
              <span className="label-caps shrink-0">{note.kind}</span>
              <span className="shrink-0 font-mono text-[11px] text-ink-600">
                {agoLabel(note._creationTime)}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-lift/[0.07] pt-3">
        <SaveGlyph
          status={writing.status}
          onSettled={writing.settle}
          idle={<Plus className="size-3.5" />}
          className="text-ink-600"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="A note on this project"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </div>
    </div>
  )
}
```

`useSave().run` returns the wrapped function's result and `busy` is `status !== 'idle'` (`src/components/Saving.tsx:24-47`), so `noteId` is the new note's id.

- [x] **Step 5: Rebuild the project page's body**

In `src/routes/_app/projects.$id.tsx`:

1. Add imports:

```tsx
import { ProjectNotes } from '@/components/projects/ProjectNotes'
import { durationLabel } from '@/lib/format'
```

(merge `durationLabel` into the existing `import { deadlineLabel } from '@/lib/format'`).

2. After `const counts = useQuery(api.aggregate.entityCounts, {})`, add the month's bounds and the query. Month bounds are computed on the client, as `StateStrip` does:

```tsx
const now = new Date()
const time = useQuery(api.aggregate.projectTime, {
  projectId,
  start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
  end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
})
```

3. In the header's mono meta line (the `div` holding `{count.done} of {count.total} tasks` and the deadline), add after the tasks span:

```tsx
{
  time === undefined ? null : time.sessions === 0 ? (
    <span>no time logged this month</span>
  ) : (
    <span>
      {durationLabel(time.minutes)} this month · {time.sessions}{' '}
      {time.sessions === 1 ? 'session' : 'sessions'}
    </span>
  )
}
```

4. Wrap the "Open" card and a new `<ProjectNotes />` in a two-column grid. Replace the opening of the Open card:

```tsx
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <div className="label-caps">Open</div>
```

with:

```tsx
      <div className="grid items-start gap-[18px] md:grid-cols-2">
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <div className="label-caps">Open</div>
```

and immediately after that card's closing `</div>` (the one after the "Another task for this project" input row), add:

```tsx
      <ProjectNotes projectId={projectId} />
      </div>
```

5. The loading skeleton: replace its second glass block (the `SkeletonRows rows={3}` one) with the same two-column grid holding two of them, so the shape matches:

```tsx
<div className="grid gap-[18px] md:grid-cols-2">
  {[0, 1].map((i) => (
    <div key={i} className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <Skeleton className="h-2.5 w-12" />
      <SkeletonRows rows={3} />
    </div>
  ))}
</div>
```

Run `pnpm exec prettier --write src/routes/_app/projects.\$id.tsx src/components/projects/ProjectNotes.tsx`.

- [x] **Step 6: Verify in the browser**

`pnpm typecheck && pnpm lint`. Open `/projects`, then Oreum.

- Header meta line reads `N of M tasks · <time this month> · ends …`. Cross-check the minutes: in the JS tool, `await convex.query('aggregate:projectTime', { projectId: '<id from URL>', start: new Date(2026,8,1).getTime(), end: new Date(2026,9,1).getTime() })` equals the words on screen.
- Desktop: Open and Notes side by side, tops aligned; phone (`resize_window` mobile): stacked, no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).
- Type `r3 check` in the notes input, dispatch Enter → lands on `/notes/<id>`; go back → the note is listed with `today`. Delete it (`notes:remove`) and confirm the card returns to "No notes on this project." (or to Artem's own notes).
- Screenshot both themes once.

- [x] **Step 7: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/components/projects/ProjectNotes.tsx src/routes/_app/projects.\$id.tsx
git commit -m "A project's page shows its time this month and its notes

The page listed tasks and nothing else, so a project was a checklist with a
title. Now the header says how much time went into it this month (its
session logs) and the notes written for it sit beside the open tasks.
A note started here is created attached and opened.

<attribution line>"
```

---

### Task 4: The backlog, bound and schedulable

**Files:**

- Create: `src/components/backlog/BindSelect.tsx`
- Create: `src/components/backlog/ScheduleTask.tsx`
- Modify: `src/routes/_app/backlog.tsx`
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**

- Consumes: `api.tasks.setGoal` (Task 2), `api.tasks.setProject`, `api.tasks.setSchedule`, `api.projects.listLive`, `api.goals.listActive`, `agoLabel` (Task 3), `whenLabel`.
- Produces: `localInputValue(ms: number): string` ("YYYY-MM-DDTHH:mm", local); `<BindSelect task={Doc<'tasks'>} projects goals />`; `<ScheduleTask task={Doc<'tasks'>} />`.

- [x] **Step 1: Failing test for `localInputValue`**

Append to `src/lib/format.test.ts` (add to import):

```ts
describe('localInputValue', () => {
  test('is local wall-clock time, not UTC', () => {
    /* Lisbon is UTC+1 in September: toISOString would say 08:05. */
    expect(localInputValue(new Date(2026, 8, 17, 9, 5).getTime())).toBe(
      '2026-09-17T09:05',
    )
  })
  test('round-trips through the Date constructor', () => {
    const ms = new Date(2026, 11, 1, 18, 30).getTime()
    expect(new Date(localInputValue(ms)).getTime()).toBe(ms)
  })
})
```

Run: `pnpm vitest run src/lib/format.test.ts` — Expected: FAIL.

- [x] **Step 2: Implement**

Append to `src/lib/format.ts` (import `localToday` from `./today` at the top):

```ts
/** A time as a `datetime-local` input wants it: local, to the minute. */
export function localInputValue(ms: number): string {
  const d = new Date(ms)
  return `${localToday(d)}T${clock(d)}`
}
```

Run: `pnpm vitest run src/lib/format.test.ts` — Expected: PASS.

- [x] **Step 3: Create `BindSelect`**

Create `src/components/backlog/BindSelect.tsx`:

```tsx
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'

/* One picker for what a backlog task answers to: a project (which brings its
   goal), a goal on its own, or nothing. A native select, because this is
   picked once per task and a custom menu would be slower on a phone. Monthly
   tile targets are goals too, but nobody files a task under "Workouts each
   month", so they are left out. */
export function BindSelect({
  task,
  projects,
  goals,
}: {
  task: Doc<'tasks'>
  projects: Array<Doc<'projects'>>
  goals: Array<Doc<'goals'>>
}) {
  const setProject = useMutation(api.tasks.setProject)
  const setGoal = useMutation(api.tasks.setGoal)

  const value = task.projectId
    ? `p:${task.projectId}`
    : task.goalId
      ? `g:${task.goalId}`
      : ''

  function change(next: string) {
    if (next === '') {
      void setProject({ taskId: task._id, projectId: null })
    } else if (next.startsWith('p:')) {
      void setProject({
        taskId: task._id,
        projectId: next.slice(2) as Id<'projects'>,
      })
    } else {
      void setGoal({ taskId: task._id, goalId: next.slice(2) as Id<'goals'> })
    }
  }

  return (
    <select
      aria-label={`What ${task.title} is for`}
      value={value}
      onChange={(e) => change(e.target.value)}
      className="max-w-[11rem] truncate rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[11.5px] text-ink-400"
    >
      <option value="">unbound</option>
      {projects.length > 0 ? (
        <optgroup label="Projects">
          {projects.map((p) => (
            <option key={p._id} value={`p:${p._id}`}>
              {p.title}
            </option>
          ))}
        </optgroup>
      ) : null}
      {goals.length > 0 ? (
        <optgroup label="Goals">
          {goals.map((g) => (
            <option key={g._id} value={`g:${g._id}`}>
              {g.title}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  )
}
```

(`setProject({ projectId: null })` clears both project and goal — see `convex/tasks.ts` `setProject`.)

- [x] **Step 4: Create `ScheduleTask`**

Create `src/components/backlog/ScheduleTask.tsx`:

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { CalendarPlus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { localInputValue, whenLabel } from '@/lib/format'

/* "Put it on the calendar" (R3). A time and a length, written through
   tasks.setSchedule — the same field the TODAY timeline and the week view
   read. Scheduling is not picking: the task stays in the backlog, and today's
   three are still chosen on Today (§3c.1). */
export function ScheduleTask({ task }: { task: Doc<'tasks'> }) {
  const setSchedule = useMutation(api.tasks.setSchedule)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState('')
  const [minutes, setMinutes] = useState('60')

  function begin() {
    const start = task.scheduledAt ?? nextHour()
    setAt(localInputValue(start))
    setMinutes(String(task.durationMin ?? 60))
    setOpen(true)
  }

  async function save() {
    const ms = new Date(at).getTime()
    if (Number.isNaN(ms)) return
    const mins = Number(minutes)
    await setSchedule({
      taskId: task._id,
      scheduledAt: ms,
      durationMin:
        Number.isFinite(mins) && mins > 0 ? Math.round(mins) : undefined,
    })
    setOpen(false)
  }

  async function clear() {
    await setSchedule({ taskId: task._id, scheduledAt: null })
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={begin}
        className="flex items-center gap-1.5 rounded-[7px] border border-lift/10 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lift/20 hover:text-ink-200"
      >
        <CalendarPlus className="size-3" />
        {task.scheduledAt ? whenLabel(task.scheduledAt) : 'Calendar'}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[11.5px] text-ink-300"
      />
      <input
        type="number"
        min={5}
        step={5}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        aria-label="Minutes"
        className="w-16 rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[11.5px] text-ink-300"
      />
      <span className="font-mono text-[11px] text-ink-600">min</span>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-[7px] border border-lav-500/60 px-2 py-1 text-[11.5px] text-lav-300 transition-colors hover:bg-lav-900/60"
      >
        Put it there
      </button>
      {task.scheduledAt ? (
        <button
          type="button"
          onClick={() => void clear()}
          className="text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
        >
          Take it off
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
      >
        Cancel
      </button>
    </div>
  )
}

/** The top of the next hour — a sensible first guess, never a stored value. */
function nextHour(): number {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d.getTime()
}
```

- [x] **Step 5: Rebuild the backlog rows**

In `src/routes/_app/backlog.tsx`:

1. Imports: add

```tsx
import { BindSelect } from '@/components/backlog/BindSelect'
import { ScheduleTask } from '@/components/backlog/ScheduleTask'
import { agoLabel } from '@/lib/format'
```

2. After `const picked = …`, add:

```tsx
const projects = useQuery(api.projects.listLive, {})
const goals = useQuery(api.goals.listActive, {})
const goalsToBind = (goals ?? []).filter((g) => g.tile === undefined)
```

3. Replace the row `div` inside `tasks.map((task) => (…))` with a two-line row: title and actions on the first line, what is known about it on the second.

```tsx
<div
  key={task._id}
  className="flex flex-col gap-1.5 border-b border-lift/[0.05] py-2.5 last:border-b-0"
>
  <div className="flex items-center gap-3">
    <span className="flex-1 text-[13px] text-foreground">{task.title}</span>

    <AreaBadge
      area={task.area}
      onChange={(area: Area) => void setArea({ taskId: task._id, area })}
    />

    <button
      type="button"
      disabled={full}
      onClick={() => void pick(task._id)}
      title={full ? 'Today is full. Finish one or drop one.' : undefined}
      className="flex items-center gap-1.5 rounded-[7px] border border-lift/10 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300 disabled:cursor-default disabled:border-lift/[0.06] disabled:text-ink-700 disabled:hover:text-ink-700"
    >
      <ArrowUp className="size-3" />
      Today
    </button>

    <button
      type="button"
      aria-label={`Delete ${task.title}`}
      onClick={() => void removeTask({ taskId: task._id })}
      className="text-ink-700 transition-colors hover:text-ink-400"
    >
      <Trash2 className="size-3.5" />
    </button>
  </div>

  <div className="flex flex-wrap items-center gap-2">
    <span className="font-mono text-[11px] text-ink-600">
      added {agoLabel(task._creationTime)}
    </span>
    <BindSelect task={task} projects={projects ?? []} goals={goalsToBind} />
    <ScheduleTask task={task} />
  </div>
</div>
```

4. The skeleton rows are one line tall; a row is now two. Change `<SkeletonRows rows={4} line="h-[26px]" />` to `<SkeletonRows rows={4} line="h-[58px]" />` and adjust after measuring in Step 6 so the skeleton row height matches a real row within 2px.

Run prettier on the three files.

- [x] **Step 6: Verify in the browser**

`pnpm typecheck && pnpm lint`. On `/backlog`, with a throwaway task `r3 bind check` created from the input:

- Second line reads `added today`, `unbound`, `Calendar`.
- Pick Oreum in the select → reload `/projects/<Oreum id>`: the task is in Open. Back on `/backlog`, pick a goal → `await convex.query('tasks:listBacklog', {})` shows `goalId` set and no `projectId`.
- `Calendar` → set tomorrow 09:00, 45 min → `Put it there` → the button reads the time through `whenLabel` (a future time renders as `17 Sep 09:00`); `/calendar` shows it tomorrow 09:00–09:45; it is **not** in Today's three.
- `Take it off` clears it. Delete the task with its trash button.
- Measure a real row's height: `document.querySelector('main .flex.flex-col.gap-1\\.5').getBoundingClientRect().height`, set the skeleton `line` to it.
- Phone width: the second line wraps, no horizontal scroll.

- [x] **Step 7: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/components/backlog src/routes/_app/backlog.tsx
git commit -m "Backlog rows say when they were added, what they are for, and when

A backlog was a list of titles with no age, no home and no time. Each row
now says how long it has waited, binds to a project or a goal in one
picker, and can be put on the calendar without being picked for today.

<attribution line>"
```

---

### Task 5: Close R3a

- [x] **Step 1: Update `PLAN.md`**

In §2, the `logs` line gains `.index('by_owner_project_time', ['ownerId','projectId','occurredAt'])`; the `notes` line gains `.index('by_owner_kind', ['ownerId','kind']).index('by_owner_project', ['ownerId','projectId'])`. In §4's R3 row, append to the Deliverable: `Shipped as three PRs: R3a project page + backlog, R3b goal milestones, R3c GitHub commits.`

- [x] **Step 2: The full check**

```bash
pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build
```

Expected: all pass.

- [x] **Step 3: Commit, push, PR**

```bash
git add PLAN.md
git commit -m "PLAN: R3a's indexes, and R3 as three PRs

<attribution line>"
git push -u origin rethink-r3a
gh pr create --base master --title "R3a: a project's page shows its time and notes; the backlog binds and schedules" --body "<what shipped, what was checked in the browser, the one thing to press by hand; end with the PR attribution line>"
```

Wait for CI, merge (`gh pr merge --merge`), `git switch master && git pull`. Tell Artem the one thing to press: bind a backlog task to Oreum and see it on Oreum's page.

---

# R3b — goals with a milestone timeline

Branch: `git switch -c rethink-r3b master` after R3a is merged.

**What changed under this plan since it was written (17 Sep, PRs #38–#46).**
This plan describes R3a's ground; nine polish PRs have moved it. Tasks 7–9
should be read against these, not against the text above:

- `tasks.listBacklog` now takes `{ today }` and returns open tasks that are
  not on today's three — an unticked task returns to the backlog when its
  day ends (#39/#41). Any call added here passes `today`.
- A task created in quick capture starts **unfiled** — no area until one is
  chosen (#42). A milestone editor must not assume a task or goal has an area
  to borrow.
- The backlog page has **Backlog** and **Done** tabs, with search, area,
  project-or-goal and sort controls shared through
  `src/components/backlog/ListControls.tsx` (#45). A Goals page list reuses
  that component rather than growing its own.
- `--color-saved` is gone; a confirmation with no area of its own borrows
  `--color-accent` (#47).

### Task 6: Milestones, and goals that can be edited

**Files:**

- Modify: `convex/schema.ts` (new `milestones` table)
- Create: `convex/milestones.ts`, `convex/milestones.test.ts`
- Modify: `convex/goals.ts`, `convex/goals.test.ts`

**Interfaces:**

- Produces:
  - `api.milestones.create({ goalId: Id<'goals'>, title: string, dueDate?: string }) → Id<'milestones'>` (appended last)
  - `api.milestones.listByGoal({ goalId: string }) → Array<Doc<'milestones'>>` (by `sortOrder`)
  - `api.milestones.setReached({ milestoneId, reached: boolean }) → null`
  - `api.milestones.update({ milestoneId, title?: string, dueDate?: string | null }) → null`
  - `api.milestones.move({ milestoneId, direction: 'earlier' | 'later' }) → null`
  - `api.milestones.remove({ milestoneId }) → null`
  - `api.goals.get({ goalId: string }) → Doc<'goals'> | null`
  - `api.goals.update({ goalId, title?: string, area?: Area, deadline?: string | null, targetLabel?: string | null }) → null`
  - `goals.remove` also deletes the goal's milestones.

- [x] **Step 1: Write the failing tests**

Create `convex/milestones.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function setup() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('milestones belong to a goal', () => {
  test('are listed in the order they were added', async () => {
    const { me } = setup()
    const goalId = await me.mutation(api.goals.create, {
      title: 'Gain 5 kg of muscle',
      area: 'body',
    })
    await me.mutation(api.milestones.create, { goalId, title: '+1 kg' })
    await me.mutation(api.milestones.create, {
      goalId,
      title: '+3 kg',
      dueDate: '2026-11-01',
    })
    await me.mutation(api.milestones.create, { goalId, title: '+5 kg' })

    const list = await me.query(api.milestones.listByGoal, { goalId })
    expect(list.map((m) => m.title)).toEqual(['+1 kg', '+3 kg', '+5 kg'])
    expect(list[1].dueDate).toBe('2026-11-01')
  })

  test('reaching one stamps a time; un-reaching clears it; the goal stays active', async () => {
    const { me } = setup()
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'body',
    })
    const m = await me.mutation(api.milestones.create, {
      goalId,
      title: 'Only one',
    })

    await me.mutation(api.milestones.setReached, {
      milestoneId: m,
      reached: true,
    })
    let [row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(typeof row.reachedAt).toBe('number')
    /* Reaching the last milestone is not reaching the goal — that is its own act. */
    expect((await me.query(api.goals.get, { goalId }))?.status).toBe('active')

    await me.mutation(api.milestones.setReached, {
      milestoneId: m,
      reached: false,
    })
    ;[row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(row.reachedAt).toBeUndefined()
  })

  test('move swaps with the neighbour, and does nothing at either end', async () => {
    const { me } = setup()
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    const a = await me.mutation(api.milestones.create, { goalId, title: 'a' })
    const b = await me.mutation(api.milestones.create, { goalId, title: 'b' })
    await me.mutation(api.milestones.create, { goalId, title: 'c' })

    await me.mutation(api.milestones.move, {
      milestoneId: b,
      direction: 'earlier',
    })
    await me.mutation(api.milestones.move, {
      milestoneId: b,
      direction: 'earlier',
    })
    await me.mutation(api.milestones.move, {
      milestoneId: a,
      direction: 'later',
    })

    const list = await me.query(api.milestones.listByGoal, { goalId })
    expect(list.map((m) => m.title)).toEqual(['b', 'c', 'a'])
  })

  test('update renames and re-dates; null clears the date', async () => {
    const { me } = setup()
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    const m = await me.mutation(api.milestones.create, {
      goalId,
      title: 'x',
      dueDate: '2026-10-01',
    })
    await me.mutation(api.milestones.update, {
      milestoneId: m,
      title: 'Two weeks clean',
    })
    await me.mutation(api.milestones.update, { milestoneId: m, dueDate: null })
    const [row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(row.title).toBe('Two weeks clean')
    expect(row.dueDate).toBeUndefined()
  })

  test('deleting a goal deletes its milestones', async () => {
    const { t, me } = setup()
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    await me.mutation(api.milestones.create, { goalId, title: 'a' })
    await me.mutation(api.goals.remove, { goalId })
    const left = await t.run((ctx) => ctx.db.query('milestones').collect())
    expect(left).toEqual([])
  })

  test('another owner can neither add to my goal nor read or touch its milestones', async () => {
    const { me, them } = setup()
    const goalId = await me.mutation(api.goals.create, {
      title: 'Mine',
      area: 'life',
    })
    const m = await me.mutation(api.milestones.create, { goalId, title: 'a' })

    await expect(
      them.mutation(api.milestones.create, { goalId, title: 'b' }),
    ).rejects.toThrow('No such goal')
    expect(await them.query(api.milestones.listByGoal, { goalId })).toEqual([])
    await expect(
      them.mutation(api.milestones.setReached, {
        milestoneId: m,
        reached: true,
      }),
    ).rejects.toThrow('No such milestone')
    await expect(
      them.mutation(api.milestones.remove, { milestoneId: m }),
    ).rejects.toThrow('No such milestone')
  })
})
```

Append to `convex/goals.test.ts`:

```ts
describe('a goal stands on its own, and can be edited', () => {
  test('get reads one goal by a URL-shaped id; foreign and bad ids are null', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const goalId = await me.mutation(api.goals.create, {
      title: 'No fap for a month',
      area: 'life',
    })

    expect((await me.query(api.goals.get, { goalId }))?.title).toBe(
      'No fap for a month',
    )
    expect(await them.query(api.goals.get, { goalId })).toBeNull()
    expect(await me.query(api.goals.get, { goalId: 'nope' })).toBeNull()
  })

  test('update sets and clears the deadline and the target label', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const goalId = await me.mutation(api.goals.create, {
      title: 'Gain muscle',
      area: 'body',
    })

    await me.mutation(api.goals.update, {
      goalId,
      deadline: '2027-03-01',
      targetLabel: '+5 kg',
      title: 'Gain 5 kg of muscle',
    })
    let goal = await me.query(api.goals.get, { goalId })
    expect([goal?.title, goal?.deadline, goal?.targetLabel]).toEqual([
      'Gain 5 kg of muscle',
      '2027-03-01',
      '+5 kg',
    ])

    await me.mutation(api.goals.update, {
      goalId,
      deadline: null,
      targetLabel: null,
    })
    goal = await me.query(api.goals.get, { goalId })
    expect(goal?.deadline).toBeUndefined()
    expect(goal?.targetLabel).toBeUndefined()
  })

  test('update refuses an empty title and another owner', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    await expect(
      me.mutation(api.goals.update, { goalId, title: '  ' }),
    ).rejects.toThrow('A goal needs a title')
    await expect(
      them.mutation(api.goals.update, { goalId, title: 'x' }),
    ).rejects.toThrow('No such goal')
  })
})
```

(If `convex/goals.test.ts` names its constants differently, use its names.)

- [x] **Step 2: Run to fail**

Run: `pnpm vitest run convex/milestones.test.ts convex/goals.test.ts`
Expected: FAIL — `api.milestones` undefined.

- [x] **Step 3: Add the table**

In `convex/schema.ts`, after the `goals` table:

```ts
  /* Steps on the way to a goal, in an order the person sets (R3, 16 Sep).
     A sequence, not a denominator: "2 of 4 milestones" would be a progress
     bar with an invented denominator, so nothing divides by these. Reaching
     one is a claim the person makes with one tap, like ticking a task. */
  milestones: defineTable({
    ownerId: v.string(),
    goalId: v.id('goals'),
    title: v.string(),
    dueDate: v.optional(v.string()), // ISO date
    reachedAt: v.optional(v.number()),
    sortOrder: v.number(),
  }).index('by_owner_goal', ['ownerId', 'goalId', 'sortOrder']),
```

- [x] **Step 4: Implement `convex/milestones.ts`**

```ts
import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'

/* A goal's milestones (R3). Owned by the goal, never by a project: a project
   page shows its goal's timeline, so there is exactly one timeline per goal. */

const MAX_ROWS = 100

async function ownedGoal(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  goalId: Id<'goals'>,
) {
  const goal = await ctx.db.get(goalId)
  if (goal === null || goal.ownerId !== ownerId) throw new Error('No such goal')
  return goal
}

async function ownedMilestone(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  milestoneId: Id<'milestones'>,
): Promise<Doc<'milestones'>> {
  const m = await ctx.db.get(milestoneId)
  if (m === null || m.ownerId !== ownerId) throw new Error('No such milestone')
  return m
}

async function siblings(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  goalId: Id<'goals'>,
) {
  return await ctx.db
    .query('milestones')
    .withIndex('by_owner_goal', (q) =>
      q.eq('ownerId', ownerId).eq('goalId', goalId),
    )
    .take(MAX_ROWS)
}

export const create = mutation({
  args: {
    goalId: v.id('goals'),
    title: v.string(),
    dueDate: v.optional(v.string()),
  },
  returns: v.id('milestones'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedGoal(ctx, ownerId, args.goalId)
    const title = args.title.trim()
    if (title.length === 0) throw new Error('A milestone needs a title')

    const existing = await siblings(ctx, ownerId, args.goalId)
    const last =
      existing.length === 0 ? -1 : existing[existing.length - 1].sortOrder
    return await ctx.db.insert('milestones', {
      ownerId,
      goalId: args.goalId,
      title,
      dueDate: args.dueDate,
      sortOrder: last + 1,
    })
  },
})

/* By a URL-shaped id, like goals.get: a bad or foreign id is an empty list. */
export const listByGoal = query({
  args: { goalId: v.string() },
  returns: v.array(schema.doc('milestones')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const goalId = ctx.db.normalizeId('goals', args.goalId)
    if (goalId === null) return []
    return await siblings(ctx, ownerId, goalId)
  },
})

export const setReached = mutation({
  args: { milestoneId: v.id('milestones'), reached: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedMilestone(ctx, ownerId, args.milestoneId)
    await ctx.db.patch(args.milestoneId, {
      reachedAt: args.reached ? Date.now() : undefined,
    })
    return null
  },
})

export const update = mutation({
  args: {
    milestoneId: v.id('milestones'),
    title: v.optional(v.string()),
    dueDate: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const m = await ownedMilestone(ctx, ownerId, args.milestoneId)
    const title = args.title === undefined ? m.title : args.title.trim()
    if (title.length === 0) throw new Error('A milestone needs a title')
    await ctx.db.patch(args.milestoneId, {
      title,
      dueDate:
        args.dueDate === undefined ? m.dueDate : (args.dueDate ?? undefined),
    })
    return null
  },
})

/** One step earlier or later. At either end it is a no-op, not an error. */
export const move = mutation({
  args: {
    milestoneId: v.id('milestones'),
    direction: v.union(v.literal('earlier'), v.literal('later')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const m = await ownedMilestone(ctx, ownerId, args.milestoneId)
    const list = await siblings(ctx, ownerId, m.goalId)
    const i = list.findIndex((x) => x._id === m._id)
    const j = args.direction === 'earlier' ? i - 1 : i + 1
    if (j < 0 || j >= list.length) return null
    await ctx.db.patch(list[i]._id, { sortOrder: list[j].sortOrder })
    await ctx.db.patch(list[j]._id, { sortOrder: list[i].sortOrder })
    return null
  },
})

export const remove = mutation({
  args: { milestoneId: v.id('milestones') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedMilestone(ctx, ownerId, args.milestoneId)
    await ctx.db.delete(args.milestoneId)
    return null
  },
})
```

- [x] **Step 5: `goals.get`, `goals.update`, and the cascade**

In `convex/goals.ts`, after `listActive`:

```ts
/* Read by a URL-shaped id (a project page's goal, a goal anchor): a bad or
   foreign id is null, which the page renders as nothing. */
export const get = query({
  args: { goalId: v.string() },
  returns: v.union(schema.doc('goals'), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const goalId = ctx.db.normalizeId('goals', args.goalId)
    if (goalId === null) return null
    const goal = await ctx.db.get(goalId)
    return goal === null || goal.ownerId !== ownerId ? null : goal
  },
})

/**
 * Rename, refile, re-date. `null` clears a deadline or a target label;
 * leaving a field out keeps it. The measurable target (targetValue + unit)
 * is not edited here — it is set on a tile or at creation.
 */
export const update = mutation({
  args: {
    goalId: v.id('goals'),
    title: v.optional(v.string()),
    area: v.optional(areaValidator),
    deadline: v.optional(v.union(v.string(), v.null())),
    targetLabel: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const goal = await ownedGoal(ctx, ownerId, args.goalId)
    const title = args.title === undefined ? goal.title : args.title.trim()
    if (title.length === 0) throw new Error('A goal needs a title')
    await ctx.db.patch(args.goalId, {
      title,
      area: args.area ?? goal.area,
      deadline:
        args.deadline === undefined
          ? goal.deadline
          : (args.deadline ?? undefined),
      targetLabel:
        args.targetLabel === undefined
          ? goal.targetLabel
          : args.targetLabel?.trim() || undefined,
    })
    return null
  },
})
```

In `goals.remove`, before `await ctx.db.delete(args.goalId)`:

```ts
/* Milestones are steps of this goal and mean nothing without it. */
const milestones = await ctx.db
  .query('milestones')
  .withIndex('by_owner_goal', (q) =>
    q.eq('ownerId', ownerId).eq('goalId', args.goalId),
  )
  .take(MAX_ROWS)
for (const m of milestones) await ctx.db.delete(m._id)
```

- [x] **Step 6: Run to pass**

Run: `pnpm vitest run convex/milestones.test.ts convex/goals.test.ts && pnpm typecheck`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add convex/schema.ts convex/milestones.ts convex/milestones.test.ts convex/goals.ts convex/goals.test.ts
git commit -m "A goal has milestones, and can be edited after it is made

R3 gives goals a timeline. Milestones are their own table, owned by the
goal, ordered by hand and reached with a tap — a sequence, never a
denominator. Goals gain get and update (deadline, target label, title,
area), and deleting a goal takes its milestones with it.

<attribution line>"
```

---

### Task 7: The timeline, as a pure function

**Files:**

- Create: `src/lib/goal-timeline.ts`, `src/lib/goal-timeline.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks at runtime (plain shapes).
- Produces:

```ts
export type TimelineNode =
  | { kind: 'start'; date: string }
  | {
      kind: 'milestone'
      id: string
      number: number
      title: string
      dueDate?: string
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
    reachedAt?: number
    sortOrder: number
  }>,
): Array<TimelineNode>
```

- [x] **Step 1: Write the failing test**

Create `src/lib/goal-timeline.test.ts`:

```ts
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
) => ({
  _id: id,
  title: id,
  sortOrder,
  reachedAt,
  dueDate,
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
})
```

- [x] **Step 2: Run to fail**

Run: `pnpm vitest run src/lib/goal-timeline.test.ts` — Expected: FAIL (module not found).

- [x] **Step 3: Implement**

Create `src/lib/goal-timeline.ts`:

```ts
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
    reachedAt?: number
    sortOrder: number
  }>,
): Array<TimelineNode> {
  const ordered = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder)
  const nextId = ordered.find((x) => x.reachedAt === undefined)?._id

  const steps: Array<TimelineNode> = ordered.map((x, i) => ({
    kind: 'milestone',
    id: x._id,
    number: i + 1,
    title: x.title,
    ...(x.dueDate === undefined ? {} : { dueDate: x.dueDate }),
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
```

- [x] **Step 4: Run to pass, commit**

Run: `pnpm vitest run src/lib/goal-timeline.test.ts` — Expected: PASS.

```bash
git add src/lib/goal-timeline.ts src/lib/goal-timeline.test.ts
git commit -m "A goal's timeline is start, ordered milestones, and the deadline

The shape the Goals and project pages will draw, worked out once and
tested: numbered by the order the person set, the first unreached step is
the live one, and nothing in it is a fraction.

<attribution line>"
```

---

### Task 8: Goals page — new goal, deadlines, the timeline

**Files:**

- Create: `src/components/goals/GoalTimeline.tsx`
- Create: `src/components/goals/MilestoneEditor.tsx`
- Create: `src/components/goals/NewGoal.tsx`
- Modify: `src/routes/_app/goals.tsx`
- Modify: `src/routes/_app/projects.index.tsx` (`NewProject`)
- Modify: `src/routes/_app/projects.$id.tsx`

**Interfaces:**

- Consumes: `api.milestones.*`, `api.goals.get`, `api.goals.update` (Task 6); `goalTimeline`, `TimelineNode` (Task 7); `shortDate`, `deadlineLabel` from `src/lib/format.ts`; `AREAS` from `@/components/AreaBadge`.
- Produces: `<GoalTimeline goal={Doc<'goals'>} />` (loads its own milestones; tap toggles reached); `<MilestoneEditor goalId={Id<'goals'>} />`; `<NewGoal />`.

- [x] **Step 1: `GoalTimeline`**

Create `src/components/goals/GoalTimeline.tsx`:

```tsx
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Skeleton } from '@/components/Skeleton'
import { shortDate } from '@/lib/format'
import { goalTimeline } from '@/lib/goal-timeline'
import type { TimelineNode } from '@/lib/goal-timeline'
import { localToday } from '@/lib/today'

/* 0 — 1 — 2 — 3 — goal (R3). Horizontal from md, a vertical list on a phone.
   Reached steps are filled, the next one is lavender (the one live thing),
   the rest are outlines. A tap on a step reaches it or takes it back — one
   tap, like ticking a task. No fraction anywhere (goal-timeline.ts). */
export function GoalTimeline({ goal }: { goal: Doc<'goals'> }) {
  const milestones = useQuery(api.milestones.listByGoal, { goalId: goal._id })
  const setReached = useMutation(api.milestones.setReached)

  if (milestones === undefined) {
    return <Skeleton className="h-[52px] w-full" />
  }

  const nodes = goalTimeline(goal, milestones)

  return (
    <ol className="flex flex-col gap-2 md:flex-row md:items-start md:gap-0">
      {nodes.map((node, i) => (
        <li
          key={node.kind === 'milestone' ? node.id : node.kind}
          className="flex min-w-0 items-start gap-2.5 md:flex-1 md:flex-col md:items-stretch md:gap-2"
        >
          <div className="flex items-center md:w-full">
            <Dot
              node={node}
              onToggle={
                node.kind === 'milestone'
                  ? () =>
                      void setReached({
                        milestoneId: node.id as Id<'milestones'>,
                        reached: node.state !== 'reached',
                      })
                  : undefined
              }
            />
            {i < nodes.length - 1 ? (
              <span
                aria-hidden
                className="hidden h-px flex-1 bg-lift/10 md:block"
              />
            ) : null}
          </div>
          <Caption node={node} />
        </li>
      ))}
    </ol>
  )
}

function Dot({
  node,
  onToggle,
}: {
  node: TimelineNode
  onToggle?: () => void
}) {
  const base =
    'grid size-[22px] shrink-0 place-items-center rounded-full font-mono text-[10px]'
  if (node.kind === 'start') {
    return (
      <span className={`${base} border border-lift/15 text-ink-500`}>0</span>
    )
  }
  if (node.kind === 'end') {
    return (
      <span className={`${base} border border-lift/25 text-ink-300`}>◆</span>
    )
  }
  const tone =
    node.state === 'reached'
      ? 'bg-ink-300 text-background'
      : node.state === 'next'
        ? 'border border-lav-500 text-lav-300'
        : 'border border-lift/15 text-ink-500'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={node.state === 'reached'}
      aria-label={`${node.title}: ${node.state === 'reached' ? 'reached — tap to undo' : 'tap when reached'}`}
      className={`${base} ${tone} transition-colors hover:border-lav-500`}
    >
      {node.number}
    </button>
  )
}

function Caption({ node }: { node: TimelineNode }) {
  const today = localToday()
  if (node.kind === 'start') {
    return (
      <div className="flex flex-col md:pr-3">
        <span className="label-caps">Started</span>
        <span className="font-mono text-[11px] text-ink-600">
          {shortDate(node.date)}
        </span>
      </div>
    )
  }
  if (node.kind === 'end') {
    return (
      <div className="flex flex-col">
        <span className="label-caps">Goal</span>
        <span className="font-mono text-[11px] text-ink-600">
          {node.deadline ? shortDate(node.deadline) : 'no deadline'}
        </span>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col md:pr-3">
      <span
        className={`truncate text-[12.5px] ${node.state === 'next' ? 'text-lav-300' : node.state === 'reached' ? 'text-ink-400' : 'text-foreground'}`}
      >
        {node.title}
      </span>
      <span className="font-mono text-[11px] text-ink-600">
        {node.reachedAt
          ? `reached ${shortDate(localToday(new Date(node.reachedAt)))}`
          : node.dueDate
            ? `${node.dueDate < today ? 'was due' : 'by'} ${shortDate(node.dueDate)}`
            : ''}
      </span>
    </div>
  )
}
```

Check `text-background` exists as a Tailwind colour from the `@theme` in `src/styles.css`; if not, use the token the app uses for text on a filled light surface (grep `bg-ink-300` for an existing pairing) — never `text-black`.

- [x] **Step 2: `MilestoneEditor`**

Create `src/components/goals/MilestoneEditor.tsx`:

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/* Add, reorder, delete — the editing the timeline itself stays free of, so a
   tap on the timeline only ever means "reached". Behind a disclosure on the
   Goals page; never on a project page. */
export function MilestoneEditor({ goalId }: { goalId: Id<'goals'> }) {
  const milestones = useQuery(api.milestones.listByGoal, { goalId })
  const create = useMutation(api.milestones.create)
  const move = useMutation(api.milestones.move)
  const remove = useMutation(api.milestones.remove)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    await create({ goalId, title: trimmed, dueDate: dueDate || undefined })
    setTitle('')
    setDueDate('')
  }

  const iconButton =
    'text-ink-600 transition-colors hover:text-ink-300 disabled:opacity-30'

  return (
    <div className="flex flex-col">
      {(milestones ?? []).map((m, i, all) => (
        <div
          key={m._id}
          className="flex items-center gap-2 border-b border-lift/[0.05] py-2"
        >
          <span className="w-5 font-mono text-[11px] text-ink-600">
            {i + 1}
          </span>
          <span className="flex-1 truncate text-[12.5px] text-ink-300">
            {m.title}
          </span>
          <button
            type="button"
            aria-label={`Move ${m.title} earlier`}
            disabled={i === 0}
            onClick={() =>
              void move({ milestoneId: m._id, direction: 'earlier' })
            }
            className={iconButton}
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Move ${m.title} later`}
            disabled={i === all.length - 1}
            onClick={() =>
              void move({ milestoneId: m._id, direction: 'later' })
            }
            className={iconButton}
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${m.title}`}
            onClick={() => void remove({ milestoneId: m._id })}
            className={iconButton}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Plus className="size-3.5 text-ink-600" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="A milestone"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-ink-700"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="By when"
          className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[11.5px] text-ink-300"
        />
      </div>
    </div>
  )
}
```

- [x] **Step 3: `NewGoal`**

Create `src/components/goals/NewGoal.tsx`, following `NewProject` in `src/routes/_app/projects.index.tsx` (same closed button, same `Field`-style rows, `useSave` + `SaveLabel`):

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { AREAS } from '@/components/AreaBadge'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Area } from '@/lib/capture-parser'

/* A goal on its own (R3, 16 Sep). Projects are programming or business work;
   a goal can be "gain 5 kg of muscle" or "a month clean", with no project
   under it and milestones instead. */
export function NewGoal() {
  const createGoal = useMutation(api.goals.create)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<Area>('life')
  const [deadline, setDeadline] = useState('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saving = useSave()

  async function submit() {
    if (saving.busy) return
    if (title.trim().length === 0) {
      setError('A goal needs a title.')
      return
    }
    try {
      await saving.run(() =>
        createGoal({
          title: title.trim(),
          area,
          deadline: deadline || undefined,
          targetLabel: target.trim() || undefined,
        }),
      )
      setError(null)
    } catch {
      setError('That did not work.')
    }
  }

  function finish() {
    saving.settle()
    setTitle('')
    setDeadline('')
    setTarget('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex items-center gap-2 self-start rounded-[14px] px-4 py-2.5 text-[12.5px] text-ink-300 transition-colors hover:text-foreground"
      >
        <Plus className="size-3.5" />
        New goal
      </button>
    )
  }

  const control =
    'rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-300'

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="label-caps">New goal</div>
      <div className="flex flex-col gap-1 border-b border-lift/[0.07] pb-2">
        <span className="label-caps">Goal</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Gain 5 kg of muscle"
          className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="label-caps">Area</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as Area)}
            className={control}
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="label-caps">By</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={`${control} font-mono`}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="label-caps">Target</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="+5 kg"
            className={`${control} w-24`}
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={saving.status === 'saved' ? finish : () => setOpen(false)}
            className="text-[12px] text-ink-600 transition-colors hover:text-ink-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving.busy}
            onClick={() => void submit()}
            className="rounded-[7px] border border-lav-500/60 px-3 py-1 text-[12px] text-lav-300 transition-colors hover:bg-lav-900/60"
          >
            <SaveLabel status={saving.status} onSettled={finish}>
              Set it
            </SaveLabel>
          </button>
        </div>
      </div>
      {error ? <p className="text-[12.5px] text-ink-400">{error}</p> : null}
    </div>
  )
}
```

- [x] **Step 4: The Goals page**

In `src/routes/_app/goals.tsx`:

1. Replace the header comment with:

```tsx
/* Goals are what work answers to. A goal can stand alone — "gain 5 kg of
   muscle" has milestones, not a project — or carry projects, which always
   have one above them (R3, 16 Sep). This page is where they are made,
   dated, stepped through, and finally called done or dropped. */
```

2. Imports: add `Link` from `@tanstack/react-router`; `GoalTimeline`, `MilestoneEditor`, `NewGoal`; `useState` is already imported.
3. Add `const update = useMutation(api.goals.update)`.
4. Render `<NewGoal />` as the first child of the page's outer `div`.
5. Empty state text: `No goals yet.`
6. Give each goal card `id={`goal-${goal._id}`}` (the project page links here).
7. Replace the meta line (`projectCount(...)` and the deadline) with:

```tsx
<div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-600">
  {(projects ?? [])
    .filter((p) => p.goalId === goal._id)
    .map((p) => (
      <Link
        key={p._id}
        to="/projects/$id"
        params={{ id: p._id }}
        className="text-ink-400 transition-colors hover:text-lav-300"
      >
        {p.title}
      </Link>
    ))}
  <label className="flex items-center gap-1.5">
    <span>{goal.deadline ? deadlineLabel(goal.deadline) : 'no deadline'}</span>
    <input
      type="date"
      aria-label={`Deadline for ${goal.title}`}
      value={goal.deadline ?? ''}
      onChange={(e) =>
        void update({ goalId: goal._id, deadline: e.target.value || null })
      }
      className="w-[7.5rem] rounded-[6px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 text-[11px] text-ink-400"
    />
  </label>
</div>
```

and delete the now-unused `projectCount` function.

8. After the meta line, for goals **without** a `tile` (monthly tile targets have no timeline), add:

```tsx
{
  goal.tile === undefined ? (
    <div className="flex flex-col gap-3 border-t border-lift/[0.07] pt-3">
      <GoalTimeline goal={goal} />
      <details className="group">
        <summary className="label-caps cursor-pointer list-none transition-colors hover:text-ink-300">
          Milestones
        </summary>
        <div className="pt-2">
          <MilestoneEditor goalId={goal._id} />
        </div>
      </details>
    </div>
  ) : null
}
```

- [x] **Step 5: The New project form, rebuilt (decision 10)**

Rewrite `NewProject` in `src/routes/_app/projects.index.tsx`. Keep the closed button, `useSave` + `SaveLabel`, `Field`, and the error line; change the rows and their order.

State: `const [project, setProject] = useState('')`, `const [goalId, setGoalId] = useState<string>('')` (empty = not chosen yet), `const [goal, setGoal] = useState('')`, `const [area, setArea] = useState<Area>('business')`, `const [deadline, setDeadline] = useState('')`. Add `const goals = useQuery(api.goals.listActive, {})` and import `Id` from the dataModel.

The open form's body:

```tsx
<div className="glass flex flex-col gap-3 rounded-[22px] p-6">
  <div className="label-caps">New project</div>

  <Field label="Project">
    <input
      autoFocus
      value={project}
      onChange={(e) => setProject(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void submit()
      }}
      placeholder="Oreum"
      className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
    />
  </Field>

  <Field label="For">
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={goalId}
        onChange={(e) => setGoalId(e.target.value)}
        className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-300"
      >
        <option value="">Which goal is this for?</option>
        {(goals ?? [])
          .filter((g) => g.tile === undefined)
          .map((g) => (
            <option key={g._id} value={g._id}>
              {g.title}
            </option>
          ))}
        <option value="new">A new goal…</option>
      </select>
      {goalId === 'new' ? (
        <>
          <input
            autoFocus
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="A profitable business"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
          />
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as Area)}
            aria-label="Area of the new goal"
            className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-300"
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  </Field>

  <div className="flex flex-wrap items-center gap-4">
    <label className="flex items-center gap-2">
      <span className="label-caps">Ends</span>
      <input
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[12px] text-ink-300"
      />
    </label>
    <div className="ml-auto flex items-center gap-2">
      {/* Cancel and Start it, unchanged */}
    </div>
  </div>

  {error ? <p className="text-[12.5px] text-ink-400">{error}</p> : null}
</div>
```

(The R3c task adds a **Repo** row between For and Ends.)

`submit`:

```tsx
async function submit() {
  if (starting.busy) return
  if (project.trim().length === 0) {
    setError('A project needs a title.')
    return
  }
  if (goalId === '' || (goalId === 'new' && goal.trim().length === 0)) {
    setError('A project answers to a goal — pick one, or name a new one.')
    return
  }
  try {
    await starting.run(async () => {
      const parent =
        goalId === 'new'
          ? await createGoal({ title: goal.trim(), area })
          : (goalId as Id<'goals'>)
      await createProject({
        goalId: parent,
        title: project.trim(),
        deadline: deadline.length > 0 ? deadline : undefined,
      })
    })
    setError(null)
  } catch {
    setError('That did not work.')
  }
}
```

`finish` also resets `goalId` to `''` and `goal` to `''`. Remove the old "Goal — what this is ultimately for" and "First project — the work that moves it" fields and the standalone Area label.

Check in the browser: the form opens with the cursor in **Project** and no ring round it; "For" lists his goals with "A new goal…" last; choosing it reveals the title and area; Start it with an existing goal creates only the project. Delete anything created.

- [x] **Step 6: The project page shows its goal**

In `src/routes/_app/projects.$id.tsx`:

1. Import `GoalTimeline`.
2. After the `project` query: `const goal = useQuery(api.goals.get, project ? { goalId: project.goalId } : 'skip')`.
3. After the header card (before the tasks/notes grid), add:

```tsx
{
  goal ? (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="label-caps">For</span>
          <Link
            to="/goals"
            hash={`goal-${goal._id}`}
            className="text-[14px] text-foreground transition-colors hover:text-lav-300"
          >
            {goal.title}
          </Link>
        </div>
      </div>
      <GoalTimeline goal={goal} />
    </div>
  ) : null
}
```

(`useQuery` from `convex-helpers/react/cache/hooks` accepts `'skip'`; if its types object, pass `{ goalId: project?.goalId ?? '' }` — an empty string normalizes to null and returns null.)

Run prettier on every touched file.

- [x] **Step 7: Verify in the browser**

`pnpm typecheck && pnpm lint`, then:

- `/goals` → New goal `R3 check goal`, area body, by a date next month, target `+5 kg` → the card appears with `Started <today>` · `Goal <date>`.
- Milestones → add `a` (no date), `b` (a date), `c`. Timeline: `1` lavender outline (next), `2`, `3` outlines. Tap `1` → filled, `2` turns lavender. Tap `1` again → back. Move `c` earlier → order `a c b`. Screenshot desktop and phone (vertical), dark and light.
- Change the deadline with the date input → `ends … · N days` updates; clear it → `no deadline`.
- `/projects` → New project → pick `R3 check goal` in the select → the goal/area inputs disappear → title `R3 check project` → Start it. Open it: the FOR card shows the goal and the same timeline; a tap there toggles the same milestone (check it changed on `/goals`).
- Clean up: delete the project on its page, then Delete the goal on `/goals` → `await convex.query('milestones:listByGoal', { goalId: '<id>' })` is `[]`.
- No red anywhere; the only lavender added is the next milestone.

- [ ] **Step 8: Commit**

```bash
git add src/components/goals src/routes/_app/goals.tsx src/routes/_app/projects.index.tsx src/routes/_app/projects.\$id.tsx
git commit -m "Goals are made on their own, dated, and stepped through

A goal could only be born with a project, which fit Oreum and nothing like
\"gain 5 kg of muscle\". Goals now have New goal, an editable deadline, the
projects under them as links, and a timeline — started, numbered
milestones, the goal — where a tap reaches a step. A new project can hang
on a goal that already exists, and its page shows that goal's timeline.

<attribution line>"
```

---

### Task 9: Close R3b

- [ ] **Step 1: `PLAN.md` §2**

Add after the `goals` line:

```
milestones:{ ownerId, goalId, title, dueDate?: string, reachedAt?: number, sortOrder: number }
           .index('by_owner_goal', ['ownerId','goalId','sortOrder'])
           // a goal's steps (R3). A sequence, never a denominator.
```

and change the `projects` comment line to note: `// a project always has a goal; a goal need not have a project (16 Sep)`.

- [ ] **Step 2: Full check, commit, PR, merge**

```bash
pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build
git add PLAN.md
git commit -m "PLAN: milestones, and goals that stand alone

<attribution line>"
git push -u origin rethink-r3b
gh pr create --base master --title "R3b: goals with a milestone timeline, made on their own" --body "<summary, what was checked, the one thing to press; end with the PR attribution line>"
```

Wait for CI, merge, `git switch master && git pull`. The one thing for Artem to press: create "Gain 5 kg of muscle" with three milestones and tap the first.

---

# R3c — GitHub commits, the first external reading

Branch: `git switch -c rethink-r3c master` after R3b is merged. Before Task 12's browser check, ask Artem for Oreum's repo as `owner/name`.

### Task 10: Commits as stored readings

**Files:**

- Modify: `convex/schema.ts` (`commits` table; three `projects` fields/index)
- Create: `convex/github.ts`, `convex/github.test.ts`
- Create: `convex/crons.ts`
- Modify: `convex/aggregate.ts` (`projectCommits`; the header comment)
- Modify: `convex/projects.ts` (`remove` deletes commits)

**Interfaces:**

- Produces:
  - `parseRepo(input: string): string | null` — `'owner/name'` from `owner/name` or any `github.com/owner/name[.git][/…]` URL.
  - `api.github.setRepo({ projectId: Id<'projects'>, repo: string | null }) → null` — throws `ConvexError('That is not a GitHub repo: use owner/name.')`; schedules an immediate check.
  - `api.github.listRecent({ projectId: string }) → Array<{ sha: string; message: string; url: string; authoredAt: number }>` (newest first, ≤ 5, current repo only).
  - `internal.github.checkOne({ projectId: Id<'projects'> }) → null`; `internal.github.checkAll({}) → null`.
  - `api.aggregate.projectCommits({ projectId: string, lastWeekStart: number, weekStart: number, nextWeekStart: number }) → { repo: string | null; checkedAt: number | null; thisWeek: number; lastWeek: number }`.

- [ ] **Step 1: Write the failing tests**

Create `convex/github.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import { parseRepo } from './github'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* 14 Sep 2026 is a Monday. Lisbon is UTC+1 in September. */
const LAST_WEEK = new Date(2026, 8, 7).getTime()
const THIS_WEEK = new Date(2026, 8, 14).getTime()
const NEXT_WEEK = new Date(2026, 8, 21).getTime()

function gh(sha: string, message: string, date: string) {
  return {
    sha,
    html_url: `https://github.com/artemchernii/oreum/commit/${sha}`,
    commit: { message, author: { date }, committer: { date } },
  }
}

const PAYLOAD = [
  gh('c3', 'Ship onboarding\n\nlong body', '2026-09-14T10:00:00Z'),
  gh('c2', 'Fix pricing', '2026-09-10T09:00:00Z'),
  gh('c1', 'Start', '2026-09-01T09:00:00Z'),
]

function stubGitHub(status = 200, body: unknown = PAYLOAD) {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function oreum(
  t: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
) {
  const goalId = await t.mutation(api.goals.create, {
    title: 'A business',
    area: 'business',
  })
  return await t.mutation(api.projects.create, { goalId, title: 'Oreum' })
}

const bounds = {
  lastWeekStart: LAST_WEEK,
  weekStart: THIS_WEEK,
  nextWeekStart: NEXT_WEEK,
}

describe('parseRepo', () => {
  test.each([
    ['artemchernii/oreum', 'artemchernii/oreum'],
    ['https://github.com/artemchernii/oreum', 'artemchernii/oreum'],
    ['https://github.com/artemchernii/oreum.git', 'artemchernii/oreum'],
    ['github.com/artemchernii/oreum/tree/main', 'artemchernii/oreum'],
    ['  artemchernii/oreum.js  ', 'artemchernii/oreum.js'],
  ])('%s → %s', (input, out) => {
    expect(parseRepo(input)).toBe(out)
  })

  test.each(['oreum', 'https://gitlab.com/a/b', 'a/b/c d', ''])(
    '%s is not a repo',
    (input) => {
      expect(parseRepo(input)).toBeNull()
    },
  )
})

describe('commits are stored readings (source 4)', () => {
  test('a check stores each commit once and stamps when it looked', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    const fetchMock = stubGitHub()

    await t.action(internal.github.checkOne, { projectId })
    await t.action(internal.github.checkOne, { projectId })

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/repos/artemchernii/oreum/commits?since=',
    )
    const rows = await t.run((ctx) => ctx.db.query('commits').collect())
    expect(rows.map((r) => r.sha).sort()).toEqual(['c1', 'c2', 'c3'])
    expect(rows.every((r) => r.ownerId === ME)).toBe(true)

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.repo).toBe('artemchernii/oreum')
    expect(typeof counts.checkedAt).toBe('number')
    expect([counts.thisWeek, counts.lastWeek]).toEqual([1, 1])

    const recent = await me.query(api.github.listRecent, { projectId })
    expect(recent.map((c) => c.message)).toEqual([
      'Ship onboarding',
      'Fix pricing',
      'Start',
    ])
  })

  test('a failed fetch stores nothing and does not pretend it looked', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub(403, { message: 'API rate limit exceeded' })

    await t.action(internal.github.checkOne, { projectId })

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.checkedAt).toBeNull()
    expect(await t.run((ctx) => ctx.db.query('commits').collect())).toEqual([])
  })

  test('setRepo accepts a URL, stores owner/name, and checks straight away', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    stubGitHub()

    await me.mutation(api.github.setRepo, {
      projectId,
      repo: 'https://github.com/artemchernii/oreum',
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.repo).toBe('artemchernii/oreum')
    expect(counts.thisWeek).toBe(1)
  })

  test('changing the repo stops counting the old one’s commits', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub()
    await t.action(internal.github.checkOne, { projectId })

    await t.run((ctx) =>
      ctx.db.patch(projectId, {
        githubRepo: 'artemchernii/other',
        githubCheckedAt: undefined,
      }),
    )
    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect([counts.thisWeek, counts.lastWeek, counts.checkedAt]).toEqual([
      0,
      0,
      null,
    ])
    expect(await me.query(api.github.listRecent, { projectId })).toEqual([])
  })

  test('setRepo refuses nonsense and another owner’s project; null disconnects', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const projectId = await oreum(me)

    await expect(
      me.mutation(api.github.setRepo, { projectId, repo: 'oreum' }),
    ).rejects.toThrow('not a GitHub repo')
    await expect(
      them.mutation(api.github.setRepo, { projectId, repo: null }),
    ).rejects.toThrow('No such project')

    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    await me.mutation(api.github.setRepo, { projectId, repo: null })
    expect(
      (await me.query(api.aggregate.projectCommits, { projectId, ...bounds }))
        .repo,
    ).toBeNull()
  })

  test('another owner reads nothing of mine', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub()
    await t.action(internal.github.checkOne, { projectId })

    expect(
      await them.query(api.aggregate.projectCommits, { projectId, ...bounds }),
    ).toEqual({
      repo: null,
      checkedAt: null,
      thisWeek: 0,
      lastWeek: 0,
    })
    expect(await them.query(api.github.listRecent, { projectId })).toEqual([])
  })

  test('deleting a project deletes its commits', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub()
    await t.action(internal.github.checkOne, { projectId })

    await me.mutation(api.projects.remove, { projectId })
    expect(await t.run((ctx) => ctx.db.query('commits').collect())).toEqual([])
  })
})
```

- [ ] **Step 2: Run to fail**

Run: `pnpm vitest run convex/github.test.ts` — Expected: FAIL (module `./github` not found).

- [ ] **Step 3: Schema**

In `convex/schema.ts`, the `projects` table gains, after `deadline`:

```ts
    /* Source 4 (R3c): a public GitHub repo as `owner/name`. Its commits are
       fetched hourly into `commits`; githubCheckedAt is when that last
       succeeded — the "as of" every reading must carry (PLAN.md §1). */
    githubRepo: v.optional(v.string()),
    githubCheckedAt: v.optional(v.number()),
```

and, after its `by_owner_status` index:

```ts
    /* Read only by the internal hourly check, which acts for every owner — the
       one index here not led by ownerId. An absent repo sorts before every
       string, so gte('') is exactly the connected projects. */
    .index('by_github_repo', ['githubRepo'])
```

After the `projects` table add:

```ts
  /* The first external reading (PLAN.md §1 source 4, R3c): a commit as GitHub
     reported it, stored — never fetched at render. `repo` is kept on each row
     so a project whose repo changes stops counting the old one's commits
     without deleting them. Counted per week; nothing is derived from them. */
  commits: defineTable({
    ownerId: v.string(),
    projectId: v.id('projects'),
    repo: v.string(),
    sha: v.string(),
    message: v.string(), // first line only
    url: v.string(),
    authoredAt: v.number(),
    fetchedAt: v.number(),
  })
    .index('by_owner_project_time', ['ownerId', 'projectId', 'authoredAt'])
    .index('by_project_sha', ['projectId', 'sha']),
```

- [ ] **Step 4: Implement `convex/github.ts`**

```ts
import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/* PLAN.md §1 source 4, first implementation (R3c, 16 Sep): commits on a
   project's public GitHub repo. The four conditions, and where each is kept:
   stored — the `commits` table, filled here, never fetched by a page;
   attributed — GitHub and `owner/name` travel with every row and the card
   links to the repo; as of a time — projects.githubCheckedAt, stamped only
   when a fetch succeeded; not a licence to derive — aggregate.projectCommits
   counts rows per week, and that is all anything reads.

   No token: the repo is public. GitHub allows 60 unauthenticated requests an
   hour per IP, and Convex's egress is shared, so if checks start failing with
   403, set GITHUB_TOKEN (read-only) and it is used. */

const LOOKBACK_MS = 14 * 86_400_000
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/

/** `owner/name` from what a person pastes: the pair itself or a github.com URL. */
export function parseRepo(input: string): string | null {
  const trimmed = input.trim()
  const url = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)/i,
  )
  const candidate = url ? `${url[1]}/${url[2].replace(/\.git$/, '')}` : trimmed
  return REPO.test(candidate) ? candidate : null
}

export const setRepo = mutation({
  args: { projectId: v.id('projects'), repo: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const project = await ctx.db.get(args.projectId)
    if (project === null || project.ownerId !== ownerId) {
      throw new Error('No such project')
    }

    if (args.repo === null) {
      await ctx.db.patch(args.projectId, {
        githubRepo: undefined,
        githubCheckedAt: undefined,
      })
      return null
    }

    const repo = parseRepo(args.repo)
    if (repo === null) {
      throw new ConvexError('That is not a GitHub repo: use owner/name.')
    }
    await ctx.db.patch(args.projectId, {
      githubRepo: repo,
      githubCheckedAt: undefined,
    })
    /* Look now, rather than leaving the card empty until the next hour. */
    await ctx.scheduler.runAfter(0, internal.github.checkOne, {
      projectId: args.projectId,
    })
    return null
  },
})

/** The latest five commits on the project's current repo, newest first. */
export const listRecent = query({
  args: { projectId: v.string() },
  returns: v.array(
    v.object({
      sha: v.string(),
      message: v.string(),
      url: v.string(),
      authoredAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    const project = projectId === null ? null : await ctx.db.get(projectId)
    if (project === null || project.ownerId !== ownerId || !project.githubRepo)
      return []

    const rows = await ctx.db
      .query('commits')
      .withIndex('by_owner_project_time', (q) =>
        q.eq('ownerId', ownerId).eq('projectId', project._id),
      )
      .order('desc')
      .take(50)
    return rows
      .filter((r) => r.repo === project.githubRepo)
      .slice(0, 5)
      .map((r) => ({
        sha: r.sha,
        message: r.message,
        url: r.url,
        authoredAt: r.authoredAt,
      }))
  },
})

/* ---- the hourly check: internal, for every owner ---------------------- */

export const repoFor = internalQuery({
  args: { projectId: v.id('projects') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    return project?.githubRepo ?? null
  },
})

export const connectedProjects = internalQuery({
  args: {},
  returns: v.array(v.id('projects')),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_github_repo', (q) => q.gte('githubRepo', ''))
      .take(200)
    return rows.map((p) => p._id)
  },
})

const commitRow = v.object({
  sha: v.string(),
  message: v.string(),
  url: v.string(),
  authoredAt: v.number(),
})

export const record = internalMutation({
  args: {
    projectId: v.id('projects'),
    repo: v.string(),
    checkedAt: v.number(),
    commits: v.array(commitRow),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    /* Deleted or re-pointed while the fetch was in flight: these readings
       belong to nothing now. */
    if (project === null || project.githubRepo !== args.repo) return null

    for (const c of args.commits) {
      const seen = await ctx.db
        .query('commits')
        .withIndex('by_project_sha', (q) =>
          q.eq('projectId', args.projectId).eq('sha', c.sha),
        )
        .first()
      if (seen !== null) continue
      await ctx.db.insert('commits', {
        ownerId: project.ownerId,
        projectId: args.projectId,
        repo: args.repo,
        ...c,
        fetchedAt: args.checkedAt,
      })
    }
    await ctx.db.patch(args.projectId, { githubCheckedAt: args.checkedAt })
    return null
  },
})

type GitHubCommit = {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { date: string } | null
    committer: { date: string } | null
  }
}

async function check(ctx: ActionCtx, projectId: Id<'projects'>): Promise<void> {
  const repo: string | null = await ctx.runQuery(internal.github.repoFor, {
    projectId,
  })
  if (repo === null) return

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString()
  const token = process.env.GITHUB_TOKEN
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'solo-leveling',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  )
  if (!res.ok) {
    /* No stamp: the card keeps its last "as of", which is the truth. */
    console.error(`GitHub ${res.status} for ${repo}`)
    return
  }

  const body = (await res.json()) as Array<GitHubCommit>
  const commits = body.flatMap((c) => {
    const date = c.commit.author?.date ?? c.commit.committer?.date
    if (!date) return []
    return [
      {
        sha: c.sha,
        message: c.commit.message.split('\n')[0].slice(0, 200),
        url: c.html_url,
        authoredAt: Date.parse(date),
      },
    ]
  })

  await ctx.runMutation(internal.github.record, {
    projectId,
    repo,
    checkedAt: Date.now(),
    commits,
  })
}

export const checkOne = internalAction({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await check(ctx, args.projectId)
    return null
  },
})

export const checkAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ids: Array<Id<'projects'>> = await ctx.runQuery(
      internal.github.connectedProjects,
      {},
    )
    for (const id of ids) {
      await check(ctx, id)
    }
    return null
  },
})
```

- [ ] **Step 5: The cron**

Create `convex/crons.ts`:

```ts
import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

/* Source 4's readings (R3c). Hourly: often enough that "last week" is right
   the morning you look, rare enough to stay far inside GitHub's limits. */
crons.interval(
  'check GitHub commits',
  { hours: 1 },
  internal.github.checkAll,
  {},
)

export default crons
```

- [ ] **Step 6: `aggregate.projectCommits`**

Append to `convex/aggregate.ts`:

```ts
/* ---------------------------------------------------------------------------
   Source 4 — external readings. GitHub commits, stored by convex/github.ts.
   ------------------------------------------------------------------------ */

/**
 * Commits on a project's repo this week and last week, with the repo they
 * are attributed to and when they were last checked — "12 this week · 8
 * last week · as of 14:02". Counts of stored rows and nothing else: no rate,
 * no streak. Rows from a repo the project no longer points at are not
 * counted. Week bounds arrive as arguments, as they do everywhere.
 */
export const projectCommits = query({
  args: {
    projectId: v.string(),
    lastWeekStart: v.number(),
    weekStart: v.number(),
    nextWeekStart: v.number(),
  },
  returns: v.object({
    repo: v.union(v.string(), v.null()),
    checkedAt: v.union(v.number(), v.null()),
    thisWeek: v.number(),
    lastWeek: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const none = { repo: null, checkedAt: null, thisWeek: 0, lastWeek: 0 }
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    const project = projectId === null ? null : await ctx.db.get(projectId)
    if (
      project === null ||
      project.ownerId !== ownerId ||
      !project.githubRepo
    ) {
      return none
    }

    const rows = await ctx.db
      .query('commits')
      .withIndex('by_owner_project_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('projectId', project._id)
          .gte('authoredAt', args.lastWeekStart)
          .lt('authoredAt', args.nextWeekStart),
      )
      .take(MAX_ROWS)

    let thisWeek = 0
    let lastWeek = 0
    for (const row of rows) {
      if (row.repo !== project.githubRepo) continue
      if (row.authoredAt >= args.weekStart) thisWeek += 1
      else lastWeek += 1
    }
    return {
      repo: project.githubRepo,
      checkedAt: project.githubCheckedAt ?? null,
      thisWeek,
      lastWeek,
    }
  },
})
```

Update the header comment's sentence `the fourth has no implementation yet, and arrives with Money.` to `the fourth's first reading is GitHub commits (R3c, convex/github.ts); prices arrive with Finances.`

- [ ] **Step 7: `projects.remove` deletes commits**

In `convex/projects.ts` `remove`, before `await ctx.db.delete(args.projectId)`:

```ts
/* Readings about this project mean nothing without it. */
const commits = await ctx.db
  .query('commits')
  .withIndex('by_owner_project_time', (q) =>
    q.eq('ownerId', ownerId).eq('projectId', args.projectId),
  )
  .take(1000)
for (const commit of commits) await ctx.db.delete(commit._id)
```

- [ ] **Step 8: Run to pass**

Run: `pnpm vitest run convex/github.test.ts && pnpm test && pnpm typecheck`
Expected: PASS. If `finishAllScheduledFunctions` complains about real timers, keep `vi.useFakeTimers()` at the top of that one test as written; do not fake timers file-wide.

- [ ] **Step 9: Commit**

```bash
git add convex/schema.ts convex/github.ts convex/github.test.ts convex/crons.ts convex/aggregate.ts convex/projects.ts
git commit -m "Commits on a project's repo, stored hourly: source 4's first reading

R3's done-when wants last week's commits on Oreum's page. They come from
outside, so they meet §1's four conditions: an hourly internal action
stores each commit as a row (never fetched at render), every row names
its repo, the project carries when GitHub was last checked, and
projectCommits only counts rows per week. Public repo, no token; one is
read if GITHUB_TOKEN is ever set.

<attribution line>"
```

---

### Task 11: The commits card

**Files:**

- Create: `src/components/projects/ProjectCommits.tsx`
- Modify: `src/routes/_app/projects.$id.tsx`

**Interfaces:**

- Consumes: `api.aggregate.projectCommits`, `api.github.setRepo`, `api.github.listRecent` (Task 10); `startOfWeek`, `addWeeks` from `src/lib/weeks.ts`; `whenLabel`, `clock` from `src/lib/format.ts`.
- Produces: `<ProjectCommits projectId={Id<'projects'>} />`.

- [ ] **Step 1: Create the card**

Create `src/components/projects/ProjectCommits.tsx`:

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { ArrowUpRight } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { SkeletonRows } from '@/components/Skeleton'
import { whenLabel } from '@/lib/format'
import { addWeeks, startOfWeek } from '@/lib/weeks'

/* GitHub on a project (R3c) — source 4, so it always says where the number
   came from (the repo, linked) and as of when (the last successful check).
   Two counts and the latest five commits. No graph, no streak, no rate. */
export function ProjectCommits({ projectId }: { projectId: Id<'projects'> }) {
  const week = startOfWeek()
  const counts = useQuery(api.aggregate.projectCommits, {
    projectId,
    lastWeekStart: addWeeks(week, -1).getTime(),
    weekStart: week.getTime(),
    nextWeekStart: addWeeks(week, 1).getTime(),
  })
  const recent = useQuery(api.github.listRecent, { projectId })
  const setRepo = useMutation(api.github.setRepo)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    try {
      await setRepo({ projectId, repo: input })
      setInput('')
      setError(null)
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'That did not work.')
    }
  }

  if (counts === undefined) {
    return (
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <div className="label-caps">GitHub</div>
        <SkeletonRows rows={3} />
      </div>
    )
  }

  if (counts.repo === null) {
    return (
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <div className="label-caps">GitHub</div>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void connect()
            }}
            placeholder="owner/name, or the repo's github.com link"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
          />
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lift/20 hover:text-ink-200"
          >
            Connect
          </button>
        </div>
        {error ? <p className="text-[12.5px] text-ink-400">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="glass flex flex-col gap-4 rounded-[22px] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a
          href={`https://github.com/${counts.repo}`}
          target="_blank"
          rel="noreferrer"
          className="label-caps flex items-center gap-1 transition-colors hover:text-ink-300"
        >
          GitHub · {counts.repo}
          <ArrowUpRight className="size-3" />
        </a>
        <span className="font-mono text-[11px] text-ink-600">
          {counts.checkedAt === null
            ? 'checking…'
            : `as of ${whenLabel(counts.checkedAt)}`}
        </span>
      </div>

      <div className="flex gap-8">
        <Count n={counts.thisWeek} label="this week" />
        <Count n={counts.lastWeek} label="last week" />
      </div>

      {recent === undefined ? null : recent.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          No commits in the last two weeks.
        </p>
      ) : (
        <div className="flex flex-col">
          {recent.map((c) => (
            <a
              key={c.sha}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-baseline gap-3 border-b border-lift/[0.05] py-2 last:border-b-0"
            >
              <span className="flex-1 truncate text-[12.5px] text-ink-300 transition-colors hover:text-foreground">
                {c.message}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-600">
                {whenLabel(c.authoredAt)}
              </span>
            </a>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void setRepo({ projectId, repo: null })}
        className="self-start text-[11.5px] text-ink-700 transition-colors hover:text-ink-400"
      >
        Disconnect
      </button>
    </div>
  )
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[28px] leading-none font-light text-foreground">
        {n}
      </span>
      <span className="label-caps pt-1.5">{label}</span>
    </div>
  )
}
```

(`checking…` is the one text loading state here, and it is honest: a write was made and a fetch is in flight — §3d.2's "a write you pressed for".)

- [ ] **Step 2: Mount it**

In `src/routes/_app/projects.$id.tsx`, import `ProjectCommits` and render `<ProjectCommits projectId={projectId} />` after the tasks/notes grid and before the Done card.

- [ ] **Step 2b: Repo on the New project form (decision 10)**

In `convex/projects.ts` `create`, add `githubRepo: v.optional(v.string())` to `args`; in the handler, when given, `const repo = parseRepo(args.githubRepo)` (import from `./github`), throw `new ConvexError('That is not a GitHub repo: use owner/name.')` when null, store it as `githubRepo`, and after the insert `await ctx.scheduler.runAfter(0, internal.github.checkOne, { projectId })` (import `internal` from `./_generated/api`; `ConvexError` from `convex/values`). Add to `convex/github.test.ts`:

```ts
test('a project made with a repo is connected from birth', async () => {
  vi.useFakeTimers()
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  stubGitHub()
  const goalId = await me.mutation(api.goals.create, {
    title: 'A business',
    area: 'business',
  })
  const projectId = await me.mutation(api.projects.create, {
    goalId,
    title: 'Oreum',
    githubRepo: 'github.com/artemchernii/oreum',
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const counts = await me.query(api.aggregate.projectCommits, {
    projectId,
    ...bounds,
  })
  expect(counts.repo).toBe('artemchernii/oreum')
  expect(counts.thisWeek).toBe(1)
})
```

In `NewProject` (`src/routes/_app/projects.index.tsx`), add `const [repo, setRepo] = useState('')`, a row between **For** and **Ends**:

```tsx
<Field label="Repo — optional">
  <input
    value={repo}
    onChange={(e) => setRepo(e.target.value)}
    placeholder="owner/name, or the repo's github.com link"
    className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
  />
</Field>
```

pass `githubRepo: repo.trim() || undefined` to `createProject`, surface a `ConvexError`'s `.data` in the error line (as the Goals page does), and reset `repo` in `finish`. Browser check: create a project with `https://github.com/artemchernii/oreum` pasted; its page shows the GitHub card filling within seconds. If Artem has not made Oreum yet, this is how he does it — keep it.

Prettier both files.

- [ ] **Step 3: Verify in the browser**

Ask Artem for Oreum's repo (`owner/name`) if not already given. `pnpm typecheck && pnpm lint`; make sure `convex dev` pushed (the cron appears in the Convex dashboard → Schedules → Cron jobs).

- Oreum's page: GitHub card with the input. Type `oreum` → Connect → `That is not a GitHub repo: use owner/name.`
- Paste the repo's `https://github.com/…` URL → Connect → `checking…`, then within seconds `as of now`, two counts, the latest commits. Cross-check one count against GitHub's commit list for the week (Mon–Sun, Lisbon time).
- Open a commit row → it opens that commit on github.com.
- Screenshot desktop and phone, dark and light.
- **Leave the repo connected** if Artem named it for Oreum — it is his configuration, not a test row. If the check used any other repo, Disconnect.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectCommits.tsx src/routes/_app/projects.\$id.tsx
git commit -m "A project's page shows its commits, and says from where and as of when

The GitHub card: connect a repo by pasting it, then this week's and last
week's counts, the latest five commits linked to GitHub, and the time of
the last check — the attribution source 4 requires on screen, not only
in the table.

<attribution line>"
```

---

### Task 12: Close R3c, and R3

- [ ] **Step 1: Docs**

- `PLAN.md` §2: the `projects` line gains `githubRepo?, githubCheckedAt?` and `.index('by_github_repo', ['githubRepo'])  // internal cron only`; add
  ```
  commits:   { ownerId, projectId, repo, sha, message, url, authoredAt: number, fetchedAt: number }
             .index('by_owner_project_time', ['ownerId','projectId','authoredAt']).index('by_project_sha', ['projectId','sha'])
             // source 4's first reading (R3c): stored hourly by convex/github.ts, counted per week
  ```
- `PLAN.md` §1, under the four sources: note that GitHub commits are the first external reading, with the four conditions met as listed at the top of `convex/github.ts`.
- `CLAUDE.md` "Working style", last bullet: `a number that is not one of the three sources` → `a number that is not one of the four sources`.

- [ ] **Step 2: Full check**

```bash
pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build
```

- [ ] **Step 3: R3's done-when** (`PLAN.md` §4): "Oreum's page shows its tasks, notes, hours this month and last week's commits, and its goal's timeline." Open Oreum's page and check each of the five on screen; screenshot it for the PR. If any is missing, fix it in this slice.

- [ ] **Step 4: Commit, PR, merge**

```bash
git add PLAN.md CLAUDE.md
git commit -m "PLAN and CLAUDE: source 4 has its first reading

<attribution line>"
git push -u origin rethink-r3c
gh pr create --base master --title "R3c: GitHub commits on a project — source 4's first reading" --body "<summary, the done-when screenshot, the one thing to press; end with the PR attribution line>"
```

Wait for CI, merge, `git switch master && git pull`. Then tell Artem: R3 is shipped; if the GitHub card ever stays on an old "as of", GitHub has rate-limited the shared egress and the fix is a read-only token set with `npx convex env set GITHUB_TOKEN …`; R4 (Notes as the knowledge base) is next and its plan is written only now.
