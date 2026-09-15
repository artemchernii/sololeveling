# R2 — Today, Rebuilt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Today the four things `PLAN.md` §3 promised it after the prune: a year bar beside LEVEL, a monthly target on each month tile, a THIS WEEK glance, and colour by kind — with every number still from a sanctioned source.

**Architecture:** One small schema addition: `goals.tile`, an optional binding that makes a goal a _monthly_ target counted by one of the six tiles, set from the tile itself. `aggregate.ts` gains `tileTargets()`; `weekCounts()` is reused with day boundaries for the week glance. Everything else is pure functions in `src/lib` (tested) and components (verified in the browser). Targets leave `stateSnapshots`: the Languages cell reads the same goal the tile does.

**Tech Stack:** TanStack Start (file routes, `pnpm generate-routes` — no route changes in this slice), Convex (`convex-test` + vitest, `edge-runtime`, `TZ=Europe/Lisbon` pinned in `vitest.config.ts`), Tailwind v4 with Nocturne tokens. **No DOM in tests** — test `src/lib/*` and `convex/*`, verify components in the browser.

**Spec:** `PLAN.md` §3 "Today" items 1, 4, 5 and the three 15 Sep defaults; §3d.3 (colour); §4 row R2. Read `CLAUDE.md` first; it wins over habit.

**Decisions taken with Artem on 15 Sep (do not re-open):**

1. A tile's target is **set on the tile**: it writes a goal bound to that tile (`goals.tile`), read per month. One active target per tile. The Languages cell's "2 of 4 sessions" reads the same goal; the old `sessions_target` state row is no longer read (Artem re-enters his 4 once, on the tile).
2. The birthday is **a constant in code**: 14 Dec 1993. LEVEL is computed from it, so it becomes 33 on 14 Dec by itself.
3. THIS WEEK is **seven columns** (Mon–Sun): booked items as short area-coloured lines, logs as area-coloured dots, today edged in lavender; the columns stack into rows on a phone.

## Global Constraints

- Every number on screen comes from `convex/aggregate.ts` (`CLAUDE.md` "Reality over gamification"). Components compose sanctioned values ("5 of 9", "4 to go"); they never invent one.
- A bar renders only where a real denominator exists: a goal's `targetValue` (tiles) or the length of a calendar year (the year bar).
- **No red on the morning screen** (`PLAN.md` §3, 15 Sep). Behind a target reads as words — `4 to go · 16 days left` — in the tile's normal colours. A bar and a dot are the same colour whether behind or met: colour says kind, never valence (§3d.3).
- Lavender is reserved for live and focus. In this slice only today's column in THIS WEEK gets it.
- Three a day (`tasks.pickForToday`, `TODAY_FULL`) and "no backlog on Today" (§3c.3) are untouched. THIS WEEK shows scheduled items only, never a count of open tasks.
- Colours, radii and spacing only from tokens; surfaces mix `lift`/`sink`, never `white`/`black` (`src/lib/theme-tokens.test.ts` enforces this).
- `useQuery` comes from `convex-helpers/react/cache/hooks` (eslint enforces), `useMutation` from `convex/react`.
- Every Convex function opens with `requireUser(ctx)` and reads through an owner-scoped index.
- Nothing is seeded. Rows created while checking in the browser are deleted before the task's commit, and Artem's own targets are his to set — a check sets a target, reads it, and removes the goal again.
- **Removing a test goal from the browser.** A cleared tile target is _dropped_, not deleted, so it stays in `goals`. Run this in the Browser pane's JavaScript tool on any app page, note the goal's `_id` **before** clearing it in the UI, then remove it after:

  ```js
  const root = document.querySelector('main')
  let f = root[Object.keys(root).find((k) => k.startsWith('__reactFiber$'))]
  while (
    f &&
    !(f.memoizedProps?.client?.mutation && f.memoizedProps?.client?.watchQuery)
  )
    f = f.return
  const convex = f.memoizedProps.client
  // before clearing: find it
  ;(await convex.query('goals:listActive', {}))
    .filter((g) => g.tile)
    .map((g) => [g._id, g.title, g.targetValue])
  // after clearing in the UI: remove it (goals.remove works on a dropped goal with no projects)
  await convex.mutation('goals:remove', { goalId: '<the _id noted above>' })
  ```

- Artem runs `pnpm dev` (and `convex dev`) on this working tree. Never `git stash` or `git checkout -- <file>` while working; copy files to the scratchpad if you need to compare.
- **Cross-owner tests share one database.** `convexTest(schema, modules)` is a fresh backend per call, so two `as(...)` helpers can never see each other's rows. In this slice, write owner-isolation tests as `const t = convexTest(schema, modules)` then `t.withIdentity(...)` twice.
- Every commit message explains why and ends with the attribution line the session reminder gives.
- Close: `pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build` all pass.

---

## File map

| action | path                                         | responsibility                                                       |
| ------ | -------------------------------------------- | -------------------------------------------------------------------- |
| create | `src/lib/year.ts` (+ test)                   | the birthday, LEVEL, and how far through the year of it today is     |
| create | `src/components/dashboard/YearBar.tsx`       | renders LEVEL, the bar and "90 days to 33"                           |
| modify | `convex/schema.ts`                           | `tileValidator`, `Tile`, `goals.tile`, index `by_owner_tile`         |
| modify | `convex/goals.ts`                            | `setTileTarget`, `clearTileTarget`                                   |
| create | `convex/goals.test.ts`                       | a monthly target is a goal bound to its tile                         |
| modify | `convex/aggregate.ts` (+ test)               | `tileTargets()`; `currentState()` loses the three target/career keys |
| modify | `PLAN.md` §2, §3 item 4                      | the schema and the spec say what was built                           |
| create | `src/lib/month.ts` (+ test)                  | days left in the month; "4 to go · 16 days left"                     |
| create | `src/lib/tiles.ts` (+ test)                  | the six tiles: key, label, noun, area colour                         |
| modify | `src/components/dashboard/ActionsLogged.tsx` | tiles with target, bar, inline target editor, area-coloured labels   |
| modify | `src/routes/_app/goals.tsx`                  | "target 9 workouts a month" for a tile goal                          |
| modify | `src/components/dashboard/StateStrip.tsx`    | Languages reads the tile target; no editable target slot             |
| create | `src/lib/week-glance.ts` (+ test)            | the seven day bounds; the timeline split by day                      |
| modify | `src/lib/format.ts`                          | export `clock`                                                       |
| create | `src/components/dashboard/WeekGlance.tsx`    | THIS WEEK                                                            |
| modify | `src/components/dashboard/TodayCard.tsx`     | an area-coloured rule on each timeline row                           |
| modify | `src/routes/_app/dashboard.tsx`              | mounts YearBar and WeekGlance, final order                           |

---

### Task 1: The year bar

**Files:**

- Create: `src/lib/year.ts`, `src/lib/year.test.ts`
- Create: `src/components/dashboard/YearBar.tsx`
- Modify: `src/routes/_app/dashboard.tsx` (the LEVEL span in the greeting block)

**Interfaces:**

- Produces: `BIRTHDAY: { year: 1993; month: 12; day: 14 }`; `yearOfLevel(date: Date, birthday?: Birthday): { level: number; daysIn: number; daysInYear: number; daysToNext: number }`; `<YearBar date={Date} />`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/year.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { yearOfLevel } from './year'

/* Born 14 Dec 1993. Dates are local; vitest pins TZ to Europe/Lisbon. */
describe('the year of LEVEL', () => {
  test('15 Sep 2026: level 32, 275 days in, 90 to go', () => {
    expect(yearOfLevel(new Date(2026, 8, 15, 9, 0))).toEqual({
      level: 32,
      daysIn: 275,
      daysInYear: 365,
      daysToNext: 90,
    })
  })

  test('the day before the birthday is the last day of the level', () => {
    const y = yearOfLevel(new Date(2026, 11, 13, 23, 59))
    expect(y.level).toBe(32)
    expect(y.daysToNext).toBe(1)
  })

  test('the birthday itself starts the next level, from zero', () => {
    const y = yearOfLevel(new Date(2026, 11, 14, 0, 1))
    expect(y).toEqual({
      level: 33,
      daysIn: 0,
      daysInYear: 365,
      daysToNext: 365,
    })
  })

  test('New Year does not reset it', () => {
    const y = yearOfLevel(new Date(2027, 0, 1, 12, 0))
    expect(y.level).toBe(33)
    expect(y.daysIn).toBe(18)
  })

  test('a year with 29 February in it is 366 days long', () => {
    expect(yearOfLevel(new Date(2028, 5, 1)).daysInYear).toBe(366)
  })

  test('a clock change is still one day', () => {
    /* Lisbon springs forward on 28 Mar 2027. */
    const sat = yearOfLevel(new Date(2027, 2, 27, 12))
    const sun = yearOfLevel(new Date(2027, 2, 28, 12))
    const mon = yearOfLevel(new Date(2027, 2, 29, 12))
    expect([sun.daysIn - sat.daysIn, mon.daysIn - sun.daysIn]).toEqual([1, 1])
  })

  test('the two halves always make the whole year', () => {
    for (let m = 0; m < 12; m++) {
      const y = yearOfLevel(new Date(2027, m, 10))
      expect(y.daysIn + y.daysToNext).toBe(y.daysInYear)
    }
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run src/lib/year.test.ts`
Expected: FAIL — `Cannot find module './year'`.

- [ ] **Step 3: Implement**

Create `src/lib/year.ts`:

```ts
/* LEVEL is my age, and the bar beside it is how far through this year of it
   I am (PLAN.md §3 item 1). A calendar fact, not a score: nothing I do moves
   it, and it is the one bar on Today whose denominator is not a goal.

   The birthday is a constant because it is one (decided 15 Sep). */

export type Birthday = { year: number; month: number; day: number }

export const BIRTHDAY = { year: 1993, month: 12, day: 14 } as const

export type YearOfLevel = {
  level: number
  /** Whole days since the last birthday; 0 on the birthday. */
  daysIn: number
  /** 365, or 366 when a 29 February falls inside. */
  daysInYear: number
  /** Whole days until the next birthday; 1 on the day before. */
  daysToNext: number
}

/* A calendar date read as UTC, divided by a day: an exact integer in any
   timezone. Local midnight in milliseconds would move an hour across a clock
   change and give two days one number. */
function dayNumber(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function yearOfLevel(
  date: Date,
  birthday: Birthday = BIRTHDAY,
): YearOfLevel {
  const year = date.getFullYear()
  const today = dayNumber(year, date.getMonth() + 1, date.getDate())
  const thisYears = dayNumber(year, birthday.month, birthday.day)
  const since = today >= thisYears ? year : year - 1
  const last = dayNumber(since, birthday.month, birthday.day)
  const next = dayNumber(since + 1, birthday.month, birthday.day)

  return {
    level: since - birthday.year,
    daysIn: today - last,
    daysInYear: next - last,
    daysToNext: next - today,
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/lib/year.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: The component**

Create `src/components/dashboard/YearBar.tsx`:

```tsx
import { yearOfLevel } from '@/lib/year'

/* LEVEL, the year of it as a bar, and the days left in it (PLAN.md §3 item
   1). Neutral ink, not lavender: a year passing is not a live thing, and not
   an area either. The width is days over days — both calendar facts. */
export function YearBar({ date }: { date: Date }) {
  const { level, daysIn, daysInYear, daysToNext } = yearOfLevel(date)

  return (
    <span className="flex items-center gap-2.5">
      <span className="label-caps">Level {level}</span>
      <span
        role="img"
        aria-label={`${daysIn} of ${daysInYear} days into level ${level}`}
        className="relative h-[3px] w-24 overflow-hidden rounded-full bg-lift/10"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-ink-400"
          style={{ width: `${(daysIn / daysInYear) * 100}%` }}
        />
      </span>
      <span className="font-mono text-[10px] tracking-[0.1em] text-ink-600 uppercase">
        {daysToNext} {daysToNext === 1 ? 'day' : 'days'} to {level + 1}
      </span>
    </span>
  )
}
```

- [ ] **Step 6: Mount it**

In `src/routes/_app/dashboard.tsx`, add `import { YearBar } from '@/components/dashboard/YearBar'` and replace:

```tsx
{
  /* LEVEL 32 is my age. It is a joke, and it stays honest by being
              one: it is not derived from anything and it never goes up
              because of what I did this week. */
}
;<span className="label-caps">Level 32</span>
```

with:

```tsx
{
  /* LEVEL is my age, from the birthday in lib/year.ts. It is a joke,
              and it stays honest by being one: it goes up on 14 December and
              never because of what I did this week. */
}
;<YearBar date={now} />
```

- [ ] **Step 7: Verify in the browser**

`pnpm typecheck && pnpm lint`, then open `http://localhost:3000/dashboard`. The greeting line reads `LEVEL 32 ▬▬▬▬░ 90 DAYS TO 33 · CURRENT FOCUS …` (the day count is 90 on 15 Sep; one less each day after). Measure the fill: `document.querySelector('[aria-label*="days into level"] span').style.width` is `75.34…%` on 15 Sep. Check light theme too (Settings → Appearance → Light, then back to System): the track and fill are both visible.

- [ ] **Step 8: Commit**

```bash
git add src/lib/year.ts src/lib/year.test.ts src/components/dashboard/YearBar.tsx src/routes/_app/dashboard.tsx
git commit -m "LEVEL has its year beside it, and counts itself

The bar is days since the last birthday over the days in that year — a
calendar fact, the one bar on Today whose denominator is not a goal. LEVEL
is computed from the same date, so it turns 33 on 14 December without an
edit. Day numbers come from the date read as UTC, so a clock change is one
day, not two.

<attribution line>"
```

---

### Task 2: A monthly target is a goal bound to its tile

**Files:**

- Modify: `convex/schema.ts` (validators near the top; the `goals` table)
- Modify: `convex/goals.ts` (append two mutations and their helpers)
- Create: `convex/goals.test.ts`
- Modify: `convex/aggregate.ts` (append `tileTargets`), `convex/aggregate.test.ts` (append tests)
- Modify: `PLAN.md` §2 (goals block) and §3 item 4

**Interfaces:**

- Produces: `tileValidator` and `type Tile = 'projects' | 'portuguese' | 'body' | 'money' | 'style' | 'social'` exported from `convex/schema.ts`; `goals.tile?: Tile`; index `goals.by_owner_tile`.
- Produces: `api.goals.setTileTarget({ tile: Tile, targetValue: number }) → Id<'goals'>` (throws `ConvexError('A monthly target is a whole number above zero.')`), `api.goals.clearTileTarget({ tile: Tile }) → null`.
- Produces: `api.aggregate.tileTargets({}) → Record<Tile, number | null>`.

- [ ] **Step 1: Write the failing tests**

Create `convex/goals.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

describe('a monthly target is a goal bound to its tile (PLAN.md §3 item 4)', () => {
  test('setting one writes a goal the Goals page can read', async () => {
    const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
    await me.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })

    const goals = await me.query(api.goals.listActive, {})
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({
      tile: 'body',
      area: 'body',
      targetValue: 9,
      unit: 'workouts',
      status: 'active',
    })
  })

  test('setting it again changes the number, not the number of goals', async () => {
    const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
    const first = await me.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 9,
    })
    const second = await me.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 12,
    })

    expect(second).toBe(first)
    const goals = await me.query(api.goals.listActive, {})
    expect(goals).toHaveLength(1)
    expect(goals[0].targetValue).toBe(12)
  })

  test('each tile has its own', async () => {
    const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
    await me.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    await me.mutation(api.goals.setTileTarget, {
      tile: 'social',
      targetValue: 2,
    })

    const goals = await me.query(api.goals.listActive, {})
    expect(goals.map((g) => g.tile).sort()).toEqual(['body', 'social'])
  })

  test('clearing drops the goal rather than deleting it', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    await me.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    await me.mutation(api.goals.clearTileTarget, { tile: 'body' })

    expect(await me.query(api.goals.listActive, {})).toHaveLength(0)
    /* A target you had in March is part of March. */
    const rows = await t.run((ctx) => ctx.db.query('goals').collect())
    expect(rows.map((g) => g.status)).toEqual(['dropped'])
  })

  test('a target is a whole number above zero', async () => {
    const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
    for (const targetValue of [0, -3, 2.5]) {
      await expect(
        me.mutation(api.goals.setTileTarget, { tile: 'body', targetValue }),
      ).rejects.toThrow('whole number above zero')
    }
  })

  test('another owner’s target is theirs', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })

    await them.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 9,
    })
    await me.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 4 })
    await me.mutation(api.goals.clearTileTarget, { tile: 'body' })

    const theirs = await them.query(api.goals.listActive, {})
    expect(theirs).toHaveLength(1)
    expect(theirs[0].targetValue).toBe(9)
  })
})
```

Append to `convex/aggregate.test.ts` (the file's fake clock and `as` helper already exist; add `convexTest`-sharing where owners meet):

```ts
describe('tileTargets is a goal’s targetValue per tile (PLAN.md §1)', () => {
  test('null where no target is set — absent, not zero', async () => {
    const targets = await as(ME).query(api.aggregate.tileTargets, {})
    expect(targets).toEqual({
      projects: null,
      portuguese: null,
      body: null,
      money: null,
      style: null,
      social: null,
    })
  })

  test('a target shows on its own tile only', async () => {
    const t = as(ME)
    await t.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    const targets = await t.query(api.aggregate.tileTargets, {})
    expect(targets.body).toBe(9)
    expect(targets.social).toBeNull()
  })

  test('a measurable goal with no tile is not a monthly target', async () => {
    const t = as(ME)
    await t.mutation(api.goals.create, {
      title: '€80,000',
      area: 'money',
      targetValue: 80000,
      unit: '€',
    })
    expect((await t.query(api.aggregate.tileTargets, {})).money).toBeNull()
  })

  test('a cleared target is gone from the tile', async () => {
    const t = as(ME)
    await t.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    await t.mutation(api.goals.clearTileTarget, { tile: 'body' })
    expect((await t.query(api.aggregate.tileTargets, {})).body).toBeNull()
  })

  test('never another owner’s', async () => {
    const t = convexTest(schema, modules)
    await t
      .withIdentity({ tokenIdentifier: SOMEONE_ELSE })
      .mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    const mine = await t
      .withIdentity({ tokenIdentifier: ME })
      .query(api.aggregate.tileTargets, {})
    expect(mine.body).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run convex/goals.test.ts convex/aggregate.test.ts`
Expected: FAIL — convex-test cannot find `goals:setTileTarget` / `aggregate:tileTargets` (vitest does not typecheck, so the missing functions surface when called).

- [ ] **Step 3: The schema**

In `convex/schema.ts`, change the first import to `import { v } from 'convex/values'` plus a type import, and add the tile validator after `areaValidator`:

```ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'
```

```ts
/* The six THIS MONTH tiles (PLAN.md §3 item 4) — the fixed shape monthCounts
   returns, deliberately not the area enum. A goal carrying one is a monthly
   target read against that tile's count (R2, 15 Sep). */
export const tileValidator = v.union(
  v.literal('projects'),
  v.literal('portuguese'),
  v.literal('body'),
  v.literal('money'),
  v.literal('style'),
  v.literal('social'),
)

export type Tile = Infer<typeof tileValidator>
```

In the `goals` table, after `deadline`, add the field, and add the index after `by_owner_status`:

```ts
    deadline: v.optional(v.string()), // ISO date
    /* Set only on a monthly target written from a THIS MONTH tile: then
       `targetValue` is per month, and the tile's log count is what it is
       read against. One active goal per tile — goals.setTileTarget keeps
       it that way. */
    tile: v.optional(tileValidator),
  })
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_owner_tile', ['ownerId', 'tile'])
```

- [ ] **Step 4: The mutations**

In `convex/goals.ts`, change the schema import to
`import schema, { areaValidator, tileValidator } from './schema'` and add
`import type { Tile } from './schema'`. Append:

```ts
/* What a monthly target is called when it is written from a tile. A goal
   needs an area: Projects counts ticked tasks from every area, and business
   is where that work is mostly filed. The unit is the tile's noun, so the
   Goals page reads "target 9 workouts a month". */
const TILE_GOALS: Record<
  Tile,
  { title: string; area: Doc<'goals'>['area']; unit: string }
> = {
  projects: {
    title: 'Tasks shipped each month',
    area: 'business',
    unit: 'tasks',
  },
  portuguese: {
    title: 'Portuguese sessions each month',
    area: 'portuguese',
    unit: 'sessions',
  },
  body: { title: 'Workouts each month', area: 'body', unit: 'workouts' },
  money: {
    title: 'Transfers to the floor each month',
    area: 'money',
    unit: 'transfers',
  },
  style: {
    title: 'Pieces bought or altered each month',
    area: 'style',
    unit: 'pieces',
  },
  social: {
    title: 'Events attended each month',
    area: 'social',
    unit: 'events',
  },
}

/* Newest first, so if two ever claim a tile — a dropped one set back to
   active on the Goals page — the one written last is the one changed. */
async function activeTileGoals(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  tile: Tile,
): Promise<Array<Doc<'goals'>>> {
  const rows = await ctx.db
    .query('goals')
    .withIndex('by_owner_tile', (q) =>
      q.eq('ownerId', ownerId).eq('tile', tile),
    )
    .order('desc')
    .take(MAX_ROWS)
  return rows.filter((goal) => goal.status === 'active')
}

/**
 * A monthly target, set from its tile (PLAN.md §3 item 4). It is a goal
 * because a goal's targetValue is the one thing §1 lets a count be read
 * against. Setting it again changes the number on the same goal rather than
 * stacking a second one.
 */
export const setTileTarget = mutation({
  args: { tile: tileValidator, targetValue: v.number() },
  returns: v.id('goals'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    if (!Number.isInteger(args.targetValue) || args.targetValue <= 0) {
      /* ConvexError: this sentence is for a person, and a plain Error
         reaches the client wrapped in a stack trace. */
      throw new ConvexError('A monthly target is a whole number above zero.')
    }

    const [current] = await activeTileGoals(ctx, ownerId, args.tile)
    if (current !== undefined) {
      await ctx.db.patch(current._id, { targetValue: args.targetValue })
      return current._id
    }

    const shape = TILE_GOALS[args.tile]
    return await ctx.db.insert('goals', {
      ownerId,
      title: shape.title,
      area: shape.area,
      status: 'active',
      targetValue: args.targetValue,
      unit: shape.unit,
      tile: args.tile,
    })
  },
})

/** No target on this tile any more. Dropped, not deleted. */
export const clearTileTarget = mutation({
  args: { tile: tileValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    for (const goal of await activeTileGoals(ctx, ownerId, args.tile)) {
      await ctx.db.patch(goal._id, { status: 'dropped' })
    }
    return null
  },
})
```

- [ ] **Step 5: `tileTargets` in aggregate.ts**

In `convex/aggregate.ts`, add `import type { Tile } from './schema'` beside the existing schema import, and insert this block **directly above** the comment block that begins `Source 2 — the latest stateSnapshots row for a key.` (after `weekCounts`), so the file reads counts → targets → state → kindCount:

```ts
/* ---------------------------------------------------------------------------
   Targets — a goal's targetValue, the one denominator §1 allows a count.

   Per tile, in the same fixed shape monthCounts has, null where none is set.
   Handed over beside the counts and never divided by them here: "5 of 9" is
   two values a component composes, and a ratio returned from this file would
   make the wrong thing easy.
   ------------------------------------------------------------------------ */

const tileTarget = v.union(v.number(), v.null())

export const tileTargets = query({
  args: {},
  returns: v.object({
    projects: tileTarget,
    portuguese: tileTarget,
    body: tileTarget,
    money: tileTarget,
    style: tileTarget,
    social: tileTarget,
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    const targets: Record<Tile, number | null> = {
      projects: null,
      portuguese: null,
      body: null,
      money: null,
      style: null,
      social: null,
    }

    /* Newest first: if two active goals ever claim a tile, the later wins,
       the same one goals.setTileTarget would change. */
    const goals = await ctx.db
      .query('goals')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'active'),
      )
      .order('desc')
      .take(MAX_ROWS)

    for (const goal of goals) {
      if (
        goal.tile !== undefined &&
        goal.targetValue !== undefined &&
        targets[goal.tile] === null
      ) {
        targets[goal.tile] = goal.targetValue
      }
    }

    return targets
  },
})
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm exec vitest run convex/goals.test.ts convex/aggregate.test.ts && pnpm typecheck`
Expected: PASS. If `convex dev` is running it pushes the schema; the new optional field and index need no migration.

- [ ] **Step 7: The spec says what was built**

In `PLAN.md` §2, in the `goals:` block, replace

```
             deadline?: string }      // ISO date
           .index('by_owner_status', ['ownerId','status'])
```

with

```
             deadline?: string,       // ISO date
             tile?: 'projects'|'portuguese'|'body'|'money'|'style'|'social' }
                                      // a monthly target read against that §3 tile (R2)
           .index('by_owner_status', ['ownerId','status']).index('by_owner_tile', ['ownerId','tile'])
```

In `PLAN.md` §3 item 4, replace

```
4. **THIS MONTH · ACTIONS LOGGED** — the six tiles, each against a **target**
   when one exists (R2): `Gym · 5 of 9 · 12 days left`. The target is a goal's
   `targetValue` (§1) — the only thing a count may be divided by. A tile with
   no target shows the count and last month, as today.
```

with

```
4. **THIS MONTH · ACTIONS LOGGED** — the six tiles, each against a **target**
   when one exists (R2): `Body · 5 of 9 workouts · 4 to go · 16 days left`. The
   target is a goal's `targetValue` (§1) — the only thing a count may be divided
   by — set on the tile itself: a goal bound to that tile (`goals.tile`), read
   per month, one per tile. A tile with no target shows the count and last
   month, as before.
```

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/goals.ts convex/goals.test.ts convex/aggregate.ts convex/aggregate.test.ts PLAN.md
git commit -m "A monthly target is a goal bound to its tile

PLAN.md §3 says a tile's target is a goal's targetValue, but goals had no
period and no screen could set a target. goals.tile binds a goal to one of
the six tiles and makes its targetValue per month; setTileTarget writes or
changes it, clearTileTarget drops it. tileTargets() hands the numbers over
in the tiles' fixed shape, beside the counts, never divided by them.

The new owner-isolation tests share one convex-test backend: two separate
convexTest() calls are two databases, where isolation cannot fail.

<attribution line>"
```

---

### Task 3: Targets on the month tiles

**Files:**

- Create: `src/lib/month.ts`, `src/lib/month.test.ts`
- Create: `src/lib/tiles.ts`, `src/lib/tiles.test.ts`
- Modify: `src/components/dashboard/ActionsLogged.tsx` (rewrite)
- Modify: `src/routes/_app/goals.tsx` (the `Target` component)

**Interfaces:**

- Consumes: `api.aggregate.tileTargets`, `api.goals.setTileTarget`, `api.goals.clearTileTarget` (Task 2); `api.aggregate.monthCounts`; `monthRange` from `./StateStrip`; `areaVars` from `@/lib/areas`.
- Produces: `daysLeftInMonth(date: Date): number`; `targetLine(count: number, target: number, daysLeft: number): string`; `type Tile`; `type MonthTile = { key: Tile; label: string; noun: string; area?: Area }`; `MONTH_TILES: ReadonlyArray<MonthTile>` (Task 5 reuses it).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/month.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { daysLeftInMonth, targetLine } from './month'

describe('days left in the month, counting today', () => {
  test('15 Sep has 16 left, today among them', () => {
    expect(daysLeftInMonth(new Date(2026, 8, 15, 7))).toBe(16)
  })

  test('the last day has one', () => {
    expect(daysLeftInMonth(new Date(2026, 8, 30, 23, 59))).toBe(1)
  })

  test('February knows a leap year', () => {
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29)
    expect(daysLeftInMonth(new Date(2027, 1, 1))).toBe(28)
  })

  test('a clock change inside the month changes nothing', () => {
    expect(daysLeftInMonth(new Date(2027, 2, 27, 12))).toBe(5)
  })
})

describe('the words under a tile with a target', () => {
  test('short of it: how many to go, and how long is left', () => {
    expect(targetLine(5, 9, 16)).toBe('4 to go · 16 days left')
  })

  test('met, and past it, say the same calm thing', () => {
    expect(targetLine(9, 9, 16)).toBe('target met · 16 days left')
    expect(targetLine(11, 9, 3)).toBe('target met · 3 days left')
  })

  test('the last day is named', () => {
    expect(targetLine(7, 9, 1)).toBe('2 to go · last day')
  })
})
```

Create `src/lib/tiles.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { MONTH_TILES } from './tiles'

describe('the six month tiles (PLAN.md §3 item 4)', () => {
  test('the order monthCounts has, and no others', () => {
    expect(MONTH_TILES.map((t) => t.key)).toEqual([
      'projects',
      'portuguese',
      'body',
      'money',
      'style',
      'social',
    ])
  })

  test('Projects wears no area colour — it counts every area', () => {
    expect(MONTH_TILES[0].area).toBeUndefined()
    expect(MONTH_TILES.slice(1).every((t) => t.area !== undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/month.test.ts src/lib/tiles.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the two modules**

Create `src/lib/month.ts`:

```ts
/* The words under a tile that has a target (PLAN.md §3 item 4). Calendar
   arithmetic, and the composition of two sanctioned values — a log count and
   a goal's targetValue — the same shape as "2 of 4". Not a fifth source.

   Being short reads as words, never as red (§3, 15 Sep): "4 to go" is what
   is true, and it needs no colour to be heard. */

/** Days left in the month, counting today: 16 on 15 Sep, 1 on the 30th. */
export function daysLeftInMonth(date: Date): number {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return lastDay - date.getDate() + 1
}

/** "4 to go · 16 days left", "target met · 16 days left", "2 to go · last day". */
export function targetLine(
  count: number,
  target: number,
  daysLeft: number,
): string {
  const days = daysLeft === 1 ? 'last day' : `${daysLeft} days left`
  return count >= target
    ? `target met · ${days}`
    : `${target - count} to go · ${days}`
}
```

Create `src/lib/tiles.ts`:

```ts
import type { Doc } from '../../convex/_generated/dataModel'
import type { Area } from './capture-parser'

export type Tile = NonNullable<Doc<'goals'>['tile']>

export type MonthTile = {
  key: Tile
  label: string
  noun: string
  /** The colour the tile wears — a kind, never a grade (§3d.3). */
  area?: Area
}

/* PLAN.md §3 item 4: the six tiles, in monthCounts' order. Labels say
   Languages and Finances since 15 Sep; the keys stay the area names until R6
   migrates the enum. Projects has no area colour: it counts ticked tasks
   from every area, so no one colour is true of it. */
export const MONTH_TILES: ReadonlyArray<MonthTile> = [
  { key: 'projects', label: 'Projects', noun: 'tasks shipped' },
  {
    key: 'portuguese',
    label: 'Languages',
    noun: 'sessions logged',
    area: 'portuguese',
  },
  { key: 'body', label: 'Body', noun: 'workouts done', area: 'body' },
  {
    key: 'money',
    label: 'Finances',
    noun: 'transfers to the floor',
    area: 'money',
  },
  {
    key: 'style',
    label: 'Style',
    noun: 'pieces bought or altered',
    area: 'style',
  },
  { key: 'social', label: 'Social', noun: 'events attended', area: 'social' },
]
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/lib/month.test.ts src/lib/tiles.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Rewrite `ActionsLogged.tsx`**

Replace the whole file with:

```tsx
import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'
import { daysLeftInMonth, targetLine } from '@/lib/month'
import { MONTH_TILES } from '@/lib/tiles'
import type { MonthTile, Tile } from '@/lib/tiles'
import { monthRange } from './StateStrip'

/* PLAN.md §3 item 4. Exactly these six tiles, in this order, each against
   last month — or, since R2, against a monthly target when one is set on the
   tile. The counts come from monthCounts() and the targets from
   tileTargets(); this component composes them and computes neither.

   "Counts of things you did. There is no score for Portuguese, and there never
   will be." A target is the one thing a count may be read against (§1), and
   being short of it reads as words — "4 to go · 16 days left" — in the same
   colours as being past it. The label and the bar wear the tile's area: a
   kind, not a verdict (§3d.3). Career, Knowledge and Life have no tile. Nine
   areas, six tiles, on purpose. */

export function ActionsLogged({ today }: { today: number }) {
  const counts = useQuery(api.aggregate.monthCounts, monthRange(today))
  const targets = useQuery(api.aggregate.tileTargets, {})

  const now = new Date(today)
  const daysLeft = daysLeftInMonth(now)
  /* The first of last month, not today minus a month: 31 March minus a month
     is 3 March, and the tile would say "in March" about February. */
  const lastMonthName = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).toLocaleDateString(undefined, { month: 'long' })

  return (
    <div className="glass rounded-[22px] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="label-caps">This month · Actions logged</div>
        <div className="label-caps">
          {counts ? `${counts.total} in total` : ''}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {MONTH_TILES.map((tile) => (
          <MonthTileCard
            key={tile.key}
            tile={tile}
            count={counts?.[tile.key]}
            target={targets === undefined ? undefined : targets[tile.key]}
            daysLeft={daysLeft}
            lastMonthName={lastMonthName}
          />
        ))}
      </div>
    </div>
  )
}

function MonthTileCard({
  tile,
  count,
  target,
  daysLeft,
  lastMonthName,
}: {
  tile: MonthTile
  count: { now: number; prev: number } | undefined
  /** undefined while loading, null when no target is set. */
  target: number | null | undefined
  daysLeft: number
  lastMonthName: string
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div
      style={tile.area ? areaVars(tile.area) : undefined}
      className="flex flex-col rounded-[16px] border border-lift/[0.06] bg-lift/[0.02] p-4"
    >
      <div className={`label-caps ${tile.area ? 'text-(--area)' : ''}`}>
        {tile.label}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[30px] leading-none font-light text-foreground">
          {count ? count.now : '—'}
        </span>
        {typeof target === 'number' && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Change the monthly target"
            className="-mx-1 rounded-[5px] px-1 text-[15px] font-light text-ink-400 transition-colors hover:bg-lift/10"
          >
            of {target}
          </button>
        ) : null}
        <span className="text-[12.5px] text-ink-500">{tile.noun}</span>
      </div>

      {typeof target === 'number' && count ? (
        <TargetBar count={count.now} target={target} area={tile.area} />
      ) : null}

      <div className="mt-1.5 flex items-baseline justify-between gap-2 font-mono text-[11px]">
        {editing ? (
          <TargetInput
            tile={tile.key}
            current={typeof target === 'number' ? target : undefined}
            onClose={() => setEditing(false)}
          />
        ) : typeof target === 'number' ? (
          <span className="text-ink-500">
            {count ? targetLine(count.now, target, daysLeft) : ''}
          </span>
        ) : (
          <>
            {/* Last month, flat — no arrow, no percentage change, no verdict
                about whether the difference is good (§1). */}
            <span className="text-ink-700">
              {count ? `${count.prev} in ${lastMonthName}` : ''}
            </span>
            {target === null ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-ink-700 transition-colors hover:text-ink-300"
              >
                + target
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/* A bar only because a goal gives it a denominator (§1). Full at the target
   and no further: past it, the words say so. The same colour either side of
   the target — the tile's area is what it is, not how well it went. */
function TargetBar({
  count,
  target,
  area,
}: {
  count: number
  target: number
  area: Area | undefined
}) {
  return (
    <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-lift/10">
      <div
        className={`h-full rounded-full ${area ? 'bg-(--area)' : 'bg-ink-300'}`}
        style={{ width: `${Math.min(count / target, 1) * 100}%` }}
      />
    </div>
  )
}

/* Enter or leaving the field saves; Escape cancels; saved empty, it clears
   the target. Closes exactly once — Enter blurs the field on its way out, and
   that blur must not save a second time. A refused value surfaces through the
   shell's write-failure notice, which shows a ConvexError's sentence. */
function TargetInput({
  tile,
  current,
  onClose,
}: {
  tile: Tile
  current: number | undefined
  onClose: () => void
}) {
  const setTarget = useMutation(api.goals.setTileTarget)
  const clearTarget = useMutation(api.goals.clearTileTarget)
  const [draft, setDraft] = useState(
    current === undefined ? '' : String(current),
  )
  const closed = useRef(false)

  function finish(commit: boolean) {
    if (closed.current) return
    closed.current = true

    if (commit) {
      const trimmed = draft.trim()
      if (trimmed.length === 0) {
        if (current !== undefined) void clearTarget({ tile })
      } else {
        const value = Number(trimmed)
        if (value !== current) void setTarget({ tile, targetValue: value })
      }
    }
    onClose()
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      inputMode="numeric"
      placeholder="a month"
      title="Empty clears the target"
      aria-label={`Monthly target for ${tile}`}
      className="w-24 rounded-[6px] border border-lav-500/50 bg-sink/20 px-2 py-0.5 font-mono text-[12px] text-foreground outline-none"
    />
  )
}
```

(`Number('abc')` is `NaN` and `Number('2.5')` is not whole: both reach `setTileTarget`, which refuses with its sentence. That is deliberate — the server owns the rule, the notice shows it.)

- [ ] **Step 6: Goals page names the period**

In `src/routes/_app/goals.tsx`, inside `Target`, change the measurable branch to:

```tsx
if (goal.targetValue !== undefined && goal.unit) {
  return (
    <div className="font-mono text-[12px] text-ink-300">
      target {goal.targetValue} {goal.unit}
      {goal.tile ? ' a month' : ''}
    </div>
  )
}
```

- [ ] **Step 7: Verify in the browser** (`http://localhost:3000/dashboard`)

Use the **Style** tile (least likely to hold a real target) and note Artem's real tiles are untouched.

1. Every tile label except Projects is in its area colour; Projects is grey. Each tile without a target shows `N in August` and `+ target` on the right.
2. Style → `+ target` → type `3` → Enter. The tile shows `0 of 3 pieces bought or altered`, a thin empty bar, and `3 to go · 16 days left` (on 15 Sep).
3. Click `of 3` → `5` → click elsewhere. It reads `of 5`; `5 to go · …`.
4. Click `of 5` → type `2.5` → Enter. The write-failure notice says "A monthly target is a whole number above zero." and the tile still says `of 5`.
5. `/goals` lists "Pieces bought or altered each month" with `target 5 pieces a month` and `0 projects`. Note its `_id` with the recipe in Global Constraints.
6. Light theme (Settings → Appearance → Light): the labels and the bar are visible; set Appearance back to what it was.
7. Back on Today, `of 5` → clear the field → Enter. The tile returns to `N in August` and `+ target`; `/goals` no longer lists it.
8. Remove the dropped goal with `goals:remove` and the `_id` from step 5. The Style tile and `/goals` are as they were before step 2.

- [ ] **Step 8: Commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/month.ts src/lib/month.test.ts src/lib/tiles.ts src/lib/tiles.test.ts src/components/dashboard/ActionsLogged.tsx src/routes/_app/goals.tsx
git commit -m "Month tiles carry a target, set on the tile, in calm words

A tile with a monthly target reads 5 of 9, a bar with a real denominator,
and 4 to go · 16 days left — never red, and the bar is the tile's area
colour whether behind or past it. Without a target it is the count and last
month, as before, with + target beside it. Labels wear their area, Projects
stays grey because it counts every area.

Last month is now named from the first of the month: 31 March minus a month
was 3 March, and the tile said March about February.

<attribution line>"
```

---

### Task 4: Languages reads the tile's target; targets leave state

**Files:**

- Modify: `src/components/dashboard/StateStrip.tsx` (header comment, the Languages cell)
- Modify: `convex/aggregate.ts` (`STATE_KEYS`, `currentState`, the comment block above them)
- Modify: `convex/aggregate.test.ts` (the `sessions_target` test)

**Interfaces:**

- Consumes: `api.aggregate.tileTargets` (Task 2).
- Produces: `api.aggregate.currentState({})` returns exactly `{ cefr_level, weight, net_worth }`.

- [ ] **Step 1: Change the test first**

In `convex/aggregate.test.ts`, replace the test `'a target is a state value like any other'` with:

```ts
test('targets are not state: they live on goals now (R2)', async () => {
  const state = await as(ME).query(api.aggregate.currentState, {})
  /* sessions_target moved to the Languages tile's goal; skills_* went
       with the Career cell on 15 Sep. A key nothing reads is a key that
       drifts. */
  expect(Object.keys(state).sort()).toEqual([
    'cefr_level',
    'net_worth',
    'weight',
  ])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run convex/aggregate.test.ts -t "targets are not state"`
Expected: FAIL — six keys, not three.

- [ ] **Step 3: Trim `currentState`**

In `convex/aggregate.ts`, replace the comment block that starts `Source 2 — the latest stateSnapshots row for a key.` through the end of `currentState` so that it reads:

```ts
/* ---------------------------------------------------------------------------
   Source 2 — the latest stateSnapshots row for a key.

   The keys the §3 strip reads, fixed here for the same reason the tiles are:
   a strip driven by "whatever keys exist" would change shape as a side-effect
   of logging a weight.

   Targets are not here. Until R2 "2 of 4 sessions" read a `sessions_target`
   state row; a target is a goal's targetValue now (tileTargets, just above),
   set on its tile, so there is one place a target lives. Old rows stay in
   the table and are simply not read.
   ------------------------------------------------------------------------ */

export const STATE_KEYS = ['cefr_level', 'weight', 'net_worth'] as const

const stateValue = v.union(
  v.object({
    value: v.optional(v.number()),
    textValue: v.optional(v.string()),
    unit: v.optional(v.string()),
    recordedAt: v.number(),
  }),
  v.null(),
)

export const currentState = query({
  args: {},
  /* A fixed shape, for the same reason monthCounts has one: a strip driven by
     "whatever keys exist" would change shape as a side-effect of logging a
     weight. Explicitly null when never recorded — a record type would tell
     TypeScript every key is always present, which is how a missing value
     becomes an invisible bug. */
  returns: v.object({
    cefr_level: stateValue,
    weight: stateValue,
    net_worth: stateValue,
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    async function latest(key: (typeof STATE_KEYS)[number]) {
      /* Latest row wins. Descending on [ownerId, key, recordedAt] means one
         document read per key, not a scan of every weigh-in ever logged. */
      const row = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ownerId).eq('key', key),
        )
        .order('desc')
        .first()

      return row === null
        ? null
        : {
            value: row.value,
            textValue: row.textValue,
            unit: row.unit,
            recordedAt: row.recordedAt,
          }
    }

    return {
      cefr_level: await latest('cefr_level'),
      weight: await latest('weight'),
      net_worth: await latest('net_worth'),
    }
  },
})
```

- [ ] **Step 4: The Languages cell**

In `src/components/dashboard/StateStrip.tsx`:

Replace the first two paragraphs of the header comment (lines 8–18 on master)

```
/* PLAN.md §3 item 3. Four cells, each labelled with its source — Business and
   Career went on 15 Sep: projects were already counted on Projects, and
   Career had nothing to count. Every number here comes from currentState() or
   monthCounts(); this component reads them and renders them, and computes
   none of them.

   Each cell has up to two editable slots, because §3's strip contains two
   kinds of number: the state itself ("B1", "75.4 kg") and, on Languages, the
   target it is counted against ("2 of 4 sessions"). A target
   is a stateSnapshots row like any other — source 2 twice, not a fourth
   source — so it is recorded the same way, by clicking it.
```

with

```
/* PLAN.md §3 item 3. Four cells, each labelled with its source — Business and
   Career went on 15 Sep: projects were already counted on Projects, and
   Career had nothing to count. Every number here comes from currentState(),
   monthCounts() or tileTargets(); this component reads them and renders
   them, and computes none of them.

   The big value is state ("B1", "75.4 kg") and is recorded by clicking it.
   Languages' quieter half is "2 of 4 sessions": the month's count against
   the target set on the Languages month tile — a goal's targetValue, the
   same number the tile reads (R2). It is set there, not here, so there is
   one place to change it.
```

The third paragraph ("Nothing is seeded, so these editors…") stays.

Add the query after `counts`:

```ts
const targets = useQuery(api.aggregate.tileTargets, {})
```

Replace the Languages cell's `trail`:

```ts
      trail: {
        text: ofTarget(
          counts?.portuguese.now,
          targets?.portuguese ?? undefined,
          'sessions',
        ),
      },
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm exec vitest run convex/aggregate.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. Typecheck fails if anything else still reads `sessions_target` or `skills_*` — `grep -rn "sessions_target\|skills_" src convex --include='*.ts' --include='*.tsx' | grep -v _generated` should print only the comment in `aggregate.ts` and the test.

- [ ] **Step 6: Verify in the browser**

On `/dashboard`, CURRENT STATE → Languages reads `B1` and `N sessions` (no "of 4": Artem's old target was a state row, and re-entering it on the tile is his step — decided 15 Sep). To check the wiring: note the goal recipe in Global Constraints, set the Languages month tile's target to 4 → the cell reads `N of 4 sessions` too, and clicking the cell's trail does nothing. Then clear the tile's target and remove the dropped goal by its `_id`, so Languages is back to `N sessions`.

- [ ] **Step 7: Commit**

```bash
git add convex/aggregate.ts convex/aggregate.test.ts src/components/dashboard/StateStrip.tsx
git commit -m "Languages reads the tile's target; targets leave state

Two places held a target for the same count: a sessions_target state row
behind the Languages cell and, since the last commit, a goal behind the
Languages tile. The cell now reads the goal, so a target is set once, on
the tile. currentState() returns the three keys the strip shows — the
skills keys went with the Career cell.

<attribution line>"
```

---

### Task 5: THIS WEEK at a glance

**Files:**

- Create: `src/lib/week-glance.ts`, `src/lib/week-glance.test.ts`
- Modify: `src/lib/format.ts:37` (`function clock` → `export function clock`)
- Modify: `convex/aggregate.test.ts` (one test in the `weekCounts` describe)
- Create: `src/components/dashboard/WeekGlance.tsx`
- Modify: `src/routes/_app/dashboard.tsx` (rewrite)

**Interfaces:**

- Consumes: `startOfWeek`, `addDays` from `@/lib/weeks`; `buildTimeline`, `TimelineItem` from `@/lib/timeline`; `api.events.listInRange({from,to})`, `api.tasks.listScheduledInRange({from,to})`, `api.aggregate.weekCounts({starts,end})`; `MONTH_TILES` (Task 3); `YearBar` (Task 1).
- Produces: `type GlanceDay = { start: number; end: number }`; `weekDays(date: Date): Array<GlanceDay>`; `itemsByDay(items: Array<TimelineItem>, days: Array<GlanceDay>): Array<Array<TimelineItem>>`; `clock(d: Date): string` exported; `<WeekGlance today={number} />`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/week-glance.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import type { TimelineItem } from './timeline'
import { itemsByDay, weekDays } from './week-glance'

const item = (id: string, at: Date): TimelineItem => ({
  id,
  source: 'event',
  title: id,
  startsAt: at.getTime(),
})

describe('the seven days of THIS WEEK', () => {
  test('Monday to Sunday of the week the day is in', () => {
    const days = weekDays(new Date(2026, 8, 16, 15)) // a Wednesday
    expect(days).toHaveLength(7)
    expect(days[0].start).toBe(new Date(2026, 8, 14).getTime())
    expect(days[6].start).toBe(new Date(2026, 8, 20).getTime())
    expect(days[6].end).toBe(new Date(2026, 8, 21).getTime())
  })

  test('a Sunday belongs to the week that began six days before', () => {
    expect(weekDays(new Date(2026, 8, 20, 22))[0].start).toBe(
      new Date(2026, 8, 14).getTime(),
    )
  })

  test('each day ends where the next begins', () => {
    const days = weekDays(new Date(2026, 8, 16))
    for (let i = 0; i < 6; i++) expect(days[i].end).toBe(days[i + 1].start)
  })

  test('the Sunday the clocks change is 23 hours, and still one day', () => {
    const days = weekDays(new Date(2027, 2, 24)) // the week of 28 Mar 2027
    expect(days[6].end - days[6].start).toBe(23 * 3_600_000)
    expect(days[6].end).toBe(new Date(2027, 2, 29).getTime())
  })
})

describe('the timeline split by day', () => {
  const days = weekDays(new Date(2026, 8, 16))

  test('an item belongs to the day it starts in', () => {
    const late = item('late', new Date(2026, 8, 20, 23, 30))
    const next = item('next', new Date(2026, 8, 21, 0, 0))
    const byDay = itemsByDay([late, next], days)
    expect(byDay[6].map((i) => i.id)).toEqual(['late'])
    expect(byDay.flat().map((i) => i.id)).toEqual(['late'])
  })

  test('seven lists, in the order the items came', () => {
    const a = item('a', new Date(2026, 8, 15, 8))
    const b = item('b', new Date(2026, 8, 15, 18))
    const c = item('c', new Date(2026, 8, 16, 18))
    const byDay = itemsByDay([a, b, c], days)
    expect(byDay).toHaveLength(7)
    expect(byDay[1].map((i) => i.id)).toEqual(['a', 'b'])
    expect(byDay[2].map((i) => i.id)).toEqual(['c'])
    expect(byDay[0]).toEqual([])
  })
})
```

In `convex/aggregate.test.ts`, inside `describe('weekCounts is the same six tiles, over weeks …')`, add:

```ts
test('the same boundaries work for days — THIS WEEK on Today', async () => {
  const t = as(ME)
  const DAY = (d: number) => new Date(2026, 8, d).getTime()
  const log = (kind: 'workout' | 'session', when: Date) =>
    t.mutation(api.logs.create, {
      kind,
      area: kind === 'workout' ? 'body' : 'portuguese',
      occurredAt: when.getTime(),
    })

  await log('workout', new Date(2026, 8, 15, 7))
  await log('session', new Date(2026, 8, 15, 23, 30))
  await log('workout', new Date(2026, 8, 16, 0, 10))

  const days = await t.query(api.aggregate.weekCounts, {
    starts: [DAY(14), DAY(15), DAY(16)],
    end: DAY(17),
  })
  expect(days.map((d) => d.body)).toEqual([0, 1, 1])
  expect(days.map((d) => d.portuguese)).toEqual([0, 1, 0])
})
```

- [ ] **Step 2: Run them**

Run: `pnpm exec vitest run src/lib/week-glance.test.ts convex/aggregate.test.ts`
Expected: `week-glance.test.ts` FAILS (module not found); the new `weekCounts` test PASSES already — it pins that the existing query is correct for days, which is what lets Today reuse it instead of adding a sixth aggregation.

- [ ] **Step 3: Implement `week-glance.ts`**

Create `src/lib/week-glance.ts`:

```ts
import type { TimelineItem } from './timeline'
import { addDays, startOfWeek } from './weeks'

/* THIS WEEK on Today (PLAN.md §3 item 5): the seven days, as local-midnight
   bounds. Stepped by calendar day through weeks.ts, never by 24 hours, so
   the Sunday a clock changes on is 23 hours long and still one day. */

export type GlanceDay = { start: number; end: number }

export function weekDays(date: Date): Array<GlanceDay> {
  const monday = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => ({
    start: addDays(monday, i).getTime(),
    end: addDays(monday, i + 1).getTime(),
  }))
}

/** The week's timeline split into its days. An item belongs to the day it
    starts in; the order within a day is the order given. */
export function itemsByDay(
  items: Array<TimelineItem>,
  days: Array<GlanceDay>,
): Array<Array<TimelineItem>> {
  return days.map((day) =>
    items.filter((i) => i.startsAt >= day.start && i.startsAt < day.end),
  )
}
```

In `src/lib/format.ts`, change `function clock(d: Date): string {` to `export function clock(d: Date): string {`.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/lib/week-glance.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: The component**

Create `src/components/dashboard/WeekGlance.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import { areaVars } from '@/lib/areas'
import { clock } from '@/lib/format'
import { useArrived } from '@/lib/loading'
import { MONTH_TILES } from '@/lib/tiles'
import { buildTimeline } from '@/lib/timeline'
import type { TimelineItem } from '@/lib/timeline'
import { itemsByDay, weekDays } from '@/lib/week-glance'

type DayCounts = FunctionReturnType<typeof api.aggregate.weekCounts>[number]

/* A day column shows this many booked items; the rest are one tap away on
   Calendar. Enough for a morning, few enough to read at a glance. */
const SHOWN = 3

/* PLAN.md §3 item 5: the seven days at a glance — what is booked, what was
   logged. It reads; the weekly review is still where a week is closed.

   Booked is the TimelineItem mapper again (§3b.3), over the week instead of
   the day: events and scheduled tasks, never the backlog (§3c.3). Logged is
   weekCounts() with day boundaries — the six tiles THIS MONTH counts, one dot
   per tile that has any that day, in the tile's colour, with the count beside
   it when there is more than one. A dot is a kind, not a grade (§3d.3).
   Today's column wears the lavender edge: today is the live thing.

   While loading, the seven day headers are drawn — they are calendar facts —
   and nothing inside them: shape, never values (§3d.2). */
export function WeekGlance({ today }: { today: number }) {
  const days = weekDays(new Date(today))
  const range = { from: days[0].start, to: days[6].end }

  const events = useQuery(api.events.listInRange, range)
  const tasks = useQuery(api.tasks.listScheduledInRange, range)
  const counts = useQuery(api.aggregate.weekCounts, {
    starts: days.map((d) => d.start),
    end: range.to,
  })

  const loaded =
    events !== undefined && tasks !== undefined && counts !== undefined
  const arrived = useArrived(loaded ? true : undefined)
  const booked =
    events && tasks
      ? itemsByDay(
          buildTimeline(tasks, events, { start: range.from, end: range.to }),
          days,
        )
      : []

  return (
    <div className="glass rounded-[22px] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="label-caps">This week</div>
        <div className="label-caps">
          {rangeLabel(days[0].start, days[6].start)}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-7">
        {days.map((day, i) => {
          const isToday = today >= day.start && today < day.end
          return (
            <div
              key={day.start}
              className={`flex gap-3 rounded-[14px] border p-2.5 lg:min-h-[124px] lg:flex-col lg:gap-2 ${
                isToday
                  ? 'border-lav-500/50 bg-lav-900/20'
                  : 'border-lift/[0.06] bg-lift/[0.02]'
              }`}
            >
              <div
                className={`label-caps w-14 shrink-0 lg:w-auto ${isToday ? 'text-lav-300' : ''}`}
              >
                {dayLabel(day.start)}
              </div>

              <div className={`flex min-w-0 flex-1 flex-col gap-2 ${arrived}`}>
                {loaded ? (
                  <>
                    <Booked items={booked[i]} />
                    <Logged counts={counts[i]} />
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Booked({ items }: { items: Array<TimelineItem> }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {items.slice(0, SHOWN).map((item) => (
        <div
          key={item.id}
          style={item.area ? areaVars(item.area) : undefined}
          className="flex min-w-0 gap-1.5"
        >
          {/* The rule is the item's area; unfiled stays grey — not a kind. */}
          <span
            aria-hidden
            className={`w-[2px] shrink-0 self-stretch rounded-full ${item.area ? 'bg-(--area)/70' : 'bg-lift/15'}`}
          />
          <span className="min-w-0 truncate text-[11.5px] leading-snug text-ink-300">
            <span className="mr-1 font-mono text-[10px] text-ink-600">
              {clock(new Date(item.startsAt))}
            </span>
            {item.title}
          </span>
        </div>
      ))}
      {items.length > SHOWN ? (
        <Link
          to="/calendar"
          className="font-mono text-[10px] text-ink-600 transition-colors hover:text-ink-300"
        >
          more on Calendar
        </Link>
      ) : null}
    </div>
  )
}

function Logged({ counts }: { counts: DayCounts }) {
  const logged = MONTH_TILES.filter((tile) => counts[tile.key] > 0)
  if (logged.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1 lg:mt-auto">
      {logged.map((tile) => (
        <span
          key={tile.key}
          title={`${counts[tile.key]} ${tile.noun}`}
          style={tile.area ? areaVars(tile.area) : undefined}
          className="flex items-center gap-1 font-mono text-[10px] text-ink-500"
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${tile.area ? 'bg-(--area)' : 'bg-ink-400'}`}
          />
          {counts[tile.key] > 1 ? counts[tile.key] : null}
        </span>
      ))}
    </div>
  )
}

/** "TUE 15" */
function dayLabel(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`
}

/** "SEP 14 — 20", or "SEP 28 — OCT 4" across a month. */
function rangeLabel(firstMs: number, lastMs: number): string {
  const first = new Date(firstMs)
  const last = new Date(lastMs)
  const month = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
  return first.getMonth() === last.getMonth()
    ? `${month(first)} ${first.getDate()} — ${last.getDate()}`
    : `${month(first)} ${first.getDate()} — ${month(last)} ${last.getDate()}`
}
```

- [ ] **Step 6: Rewrite `dashboard.tsx`**

Replace the whole file with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useUser } from '@clerk/tanstack-react-start'

import { api } from '../../../convex/_generated/api'
import { ActionsLogged } from '@/components/dashboard/ActionsLogged'
import { PrincipleLine } from '@/components/dashboard/PrincipleLine'
import { QuestList } from '@/components/dashboard/QuestList'
import { StateStrip } from '@/components/dashboard/StateStrip'
import { TodayCard } from '@/components/dashboard/TodayCard'
import { WeekGlance } from '@/components/dashboard/WeekGlance'
import { YearBar } from '@/components/dashboard/YearBar'
import { localToday } from '@/lib/today'
import { useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/dashboard')({
  component: Today,
})

/* Today — PLAN.md §3: greeting, LEVEL with its year, focus and a principle;
   TODAY beside TODAY'S THREE; CURRENT STATE; THIS MONTH; THIS WEEK.

   Every number on it comes from convex/aggregate.ts. This file composes them
   and computes none. Two kinds of bar, each with a real denominator: the year
   of LEVEL (a calendar fact) and a month tile's target (a goal's
   targetValue, §1). */
function Today() {
  const { user } = useUser()
  const now = new Date()
  const today = localToday(now)

  /* Rows, not occurrences: a series that began in March is one row that the
     mapper expands into whatever falls inside today (§3b.6). */
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const events = useQuery(api.events.listInRange, {
    from: dayStart.getTime(),
    to: dayEnd.getTime(),
  })

  /* Held at the source, so TODAY and the three leave their skeletons
     together rather than one card at a time. */
  const quests = useHeld(useQuery(api.tasks.listToday, { today }))
  const projects = useQuery(api.projects.listLive, {})

  const focus = projects?.find((p) => p.status === 'focus')
  const firstName = user?.firstName ?? user?.username ?? 'you'

  return (
    /* Mobile order (§3): greeting → the three → TODAY → this month → this
       week → state. One source of markup, reordered: a phone-shaped copy of
       this screen is a second version of the same page, and they drift. */
    <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2">
      <div className="order-1 flex flex-col gap-2 lg:col-span-2">
        <h1 className="text-[34px] leading-tight font-light text-foreground">
          {greeting(now)}, {firstName.toUpperCase()}.
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* LEVEL is my age, from the birthday in lib/year.ts. It is a joke,
              and it stays honest by being one: it goes up on 14 December and
              never because of what I did this week. */}
          <YearBar date={now} />
          <span className="text-ink-800">·</span>
          {focus ? (
            <>
              <span className="label-caps text-lav-400">Current focus</span>
              <span className="label-caps text-foreground">{focus.title}</span>
            </>
          ) : (
            <span className="label-caps">No project in focus</span>
          )}
        </div>
        <PrincipleLine date={now} />
      </div>

      <div className="order-3 lg:order-2">
        <TodayCard tasks={quests} events={events ?? []} date={now} />
      </div>

      <div className="order-2 lg:order-3">
        <QuestList tasks={quests} today={today} />
      </div>

      <div className="order-6 lg:order-4 lg:col-span-2">
        <StateStrip today={now.getTime()} />
      </div>

      <div className="order-4 lg:order-5 lg:col-span-2">
        <ActionsLogged today={now.getTime()} />
      </div>

      <div className="order-5 lg:order-6 lg:col-span-2">
        <WeekGlance today={now.getTime()} />
      </div>
    </div>
  )
}

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
```

- [ ] **Step 7: Verify in the browser**

`pnpm typecheck && pnpm lint`, then `/dashboard`:

1. Desktop (≥1024 wide): THIS WEEK is the last card, full width, seven equal columns MON–SUN with `SEP 14 — 20` on the right. Today's column has the lavender edge and label; no other column does.
2. A timed event or scheduled task this week appears in its day as `08:00 Title` with a coloured rule (grey when unfiled). Days with logs show dots in tile colours (Projects' dot grey); a day with 2+ of one tile shows the number. Hover a dot: the title says e.g. `2 workouts done`.
3. Cross-check one day's non-Projects dot against the Log modal's recent list (⌘L) — the count must match that day's rows of that kind. (Projects dots count ticked tasks, which the recent list hides on purpose.)
4. Phone width (pane Viewport → Mobile, or `resize_window` 375×812): the days stack as rows, label on the left; order is greeting → three → TODAY → THIS MONTH → THIS WEEK → CURRENT STATE.
5. Light theme: the lavender edge, rules and dots are all visible.
6. Console: no errors from the new queries (`read_console_messages` with `onlyErrors`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/week-glance.ts src/lib/week-glance.test.ts src/lib/format.ts convex/aggregate.test.ts src/components/dashboard/WeekGlance.tsx src/routes/_app/dashboard.tsx
git commit -m "THIS WEEK on Today: what is booked, what was logged

Seven columns, today edged in lavender. Booked is the timeline mapper over
the week — events and scheduled tasks, never the backlog. Logged is
weekCounts() with day boundaries rather than a new aggregation: a test pins
that the existing query buckets days correctly. One dot per tile, in the
tile's colour, with the count beside it. On a phone the days stack.

<attribution line>"
```

---

### Task 6: Colour by kind on the TODAY card

**Files:**

- Modify: `src/components/dashboard/TodayCard.tsx` (the row)

**Interfaces:**

- Consumes: `areaVars` from `@/lib/areas`.

- [ ] **Step 1: The row gets its area's rule**

In `src/components/dashboard/TodayCard.tsx`, add `import { areaVars } from '@/lib/areas'` and replace the row:

```tsx
            <div
              key={item.id}
              className="flex items-baseline gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0"
            >
```

with:

```tsx
            <div
              key={item.id}
              style={item.area ? areaVars(item.area) : undefined}
              className="flex items-baseline gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0"
            >
              {/* The same rule THIS WEEK draws: the item's area, grey when
                  unfiled. What it is, not how it went (§3d.3). */}
              <span
                aria-hidden
                className={`w-[2px] shrink-0 self-stretch rounded-full ${item.area ? 'bg-(--area)/70' : 'bg-lift/15'}`}
              />
```

Also update the header comment's last sentence to mention it:

```tsx
/* PLAN.md §3 item 2. Events and scheduled tasks, merged only here, through the
   TimelineItem mapper (§3b.3). Each row carries a rule in its area's colour,
   as THIS WEEK's items do.
```

(keep the rest of that comment as it is).

- [ ] **Step 2: Verify in the browser**

`pnpm typecheck && pnpm lint`. On `/dashboard`, the TODAY card's "Code solo leveling" row (or any row) has a 2px rule on its left in its area colour, or grey if unfiled; the time, title and minutes stay aligned on one baseline. Measure: `getComputedStyle(document.querySelector('main [aria-hidden].self-stretch')).height` is the row's content height, not `0px`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/TodayCard.tsx
git commit -m "TODAY's rows wear their area, as THIS WEEK's do

A timeline row said what time and what, but not what kind — the one thing
colour is free to say (§3d.3). A 2px rule in the item's area colour, grey
when unfiled, the same mark the week glance uses.

<attribution line>"
```

---

### Task 7: Close the slice

- [ ] **Step 1: The full check**

```bash
pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build
```

Expected: all pass. `pnpm check` is Prettier; run `pnpm exec prettier --write <file>` on any file it names.

- [ ] **Step 2: Walk Today, dark and light, desktop and phone**

- Greeting: `LEVEL 32`, the bar, `N DAYS TO 33`.
- THIS MONTH: labels coloured by area, Projects grey; every tile without a target shows `N in <last month>` and `+ target`. No red anywhere on the page: `[...document.querySelectorAll('main *')].filter((e) => /red|destructive/.test(e.getAttribute('class') ?? ''))` is empty.
- CURRENT STATE: Languages `B1 · N sessions`.
- THIS WEEK: seven columns (rows on a phone), today in lavender.
- TODAY: rows with area rules.
- `/reviews`: unchanged (it reads `weekCounts` with weeks; its tiles still render).

- [ ] **Step 3: Done-when** (`PLAN.md` §4 R2): "A morning with a gym target shows `5 of 9 · 12 days left`, in calm colour." Demonstrate it on the Body tile with a temporary target: note the goal `_id`, set a target above this month's workout count, read the tile (`N of T workouts done`, a bar in the body colour, `… to go · … days left`, nothing red), screenshot it for the PR, then clear it and remove the goal. If any item fails, fix it in this slice.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin rethink-r2
gh pr create --base master --title "R2: Today, rebuilt — year bar, monthly targets, this week, colour by kind" --body "<summary of the six commits and what was checked in the browser; end with the attribution line the session reminder gives>"
```

Then tell Artem: his Languages cell no longer shows "of 4" until he sets `+ target` → 4 on the Languages tile (the old target was a state row, which is no longer read); any other monthly target is set the same way; and R3's plan is written only after R2 is merged.
