# R1 — Prune and Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar match `PLAN.md` §3's table (three groups, ten entries plus Settings), merge the Quests page into Today, remove the chains card and the dead state cells, show one principle a day on Today, and rename "chain" → "project", Money → Finances, Portuguese → Languages — with no new features.

**Architecture:** Everything here is UI and copy. No schema change (the `area` enum keeps `money` and `portuguese`; only labels and routes change — the `languages` area arrives in R6). Convex changes are limited to error-message wording and one search target. The data rules in `CLAUDE.md` are untouched: three a day stays, enforced in `tasks.pickForToday`.

**Tech Stack:** TanStack Start (file routes under `src/routes/_app/`, regenerated with `pnpm generate-routes`), Convex, Tailwind v4 with Nocturne tokens, vitest (`edge-runtime` environment — **no DOM, so no component tests**; test `src/lib/*` and `convex/*`, verify components by hand in the browser).

**Spec:** `PLAN.md` §3 (the map) and §4 row R1 (done-when). Read `CLAUDE.md` first; it wins over habit.

## Global Constraints

- Every number on screen comes from `convex/aggregate.ts` (`CLAUDE.md` "Reality over gamification"). This slice adds no numbers.
- Three quests a day, enforced in `tasks.pickForToday` (`TODAY_FULL`). Do not touch it.
- No backlog count on Today (`PLAN.md` §3c.3).
- Colours, radii, spacing only from tokens; surfaces mix `lift`/`sink`, never `white`/`black` (`src/lib/theme-tokens.test.ts` enforces this).
- `useQuery` comes from `convex-helpers/react/cache/hooks` (eslint enforces), `useMutation` from `convex/react`.
- Loading: a page that opens without data shows a skeleton via `useHeld` and fades content in via `useArrived` (`src/lib/loading.ts`). Keep the existing pattern when moving code.
- Every commit message explains why, and ends with the attribution line the session reminder gives.
- Close: `pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build` all pass.
- Artem runs `pnpm dev` on this working tree. Never `git stash` or `git checkout -- <file>` while working; copy files to scratch if you need to compare.

---

## File map

| action | path                                                                                              | responsibility                                                        |
| ------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| modify | `src/lib/nav.ts`                                                                                  | the one definition of the sidebar and mobile nav                      |
| create | `src/lib/nav.test.ts`                                                                             | pins the sidebar to §3's table                                        |
| modify | `src/lib/palette.test.ts`                                                                         | Search's page list is derived from `navGroups`; its examples move     |
| delete | `src/routes/_app/{quests,principles,knowledge,career,social,style}.tsx`                           | pages §3 removed                                                      |
| rename | `src/routes/_app/money.tsx` → `finances.tsx`, `portuguese.tsx` → `languages.tsx`                  | placeholders keep their spot under new names                          |
| modify | `src/routeTree.gen.ts`                                                                            | regenerated, never edited                                             |
| modify | `convex/search.ts`                                                                                | a principle hit goes to Today now                                     |
| create | `src/lib/principle-of-day.ts` (+ test)                                                            | which principle today shows                                           |
| create | `src/components/dashboard/PrincipleLine.tsx`                                                      | renders it                                                            |
| create | `src/components/dashboard/QuestRow.tsx`                                                           | one of today's three: tick, area, time, drop (moved from quests.tsx)  |
| create | `src/components/dashboard/QuestFollowUp.tsx`                                                      | "log it as a workout?" after a tick (moved from quests.tsx)           |
| modify | `src/components/dashboard/QuestList.tsx`                                                          | owns the add field and the follow-up; uses the two above              |
| modify | `src/routes/_app/dashboard.tsx`                                                                   | Today: greeting + principle, TODAY beside TODAY'S THREE, state, month |
| modify | `src/components/dashboard/StateStrip.tsx`                                                         | four cells: Business and Career removed                               |
| delete | `src/components/dashboard/ChainsCard.tsx`                                                         | gone                                                                  |
| rename | `src/components/chains/ChainCard.tsx` → `src/components/projects/ProjectCard.tsx`                 | the word goes                                                         |
| modify | `src/routes/_app/{projects.index,projects.$id,goals}.tsx`, `convex/{projects,goals}.ts` (+ tests) | "chain" → "project" in copy and error strings                         |

---

### Task 1: The sidebar is §3's table

**Files:**

- Modify: `src/lib/nav.ts`
- Create: `src/lib/nav.test.ts`
- Modify: `src/lib/palette.test.ts:12-28`
- Delete: `src/routes/_app/quests.tsx`, `principles.tsx`, `knowledge.tsx`, `career.tsx`, `social.tsx`, `style.tsx` — **not yet**: `quests.tsx` and `principles.tsx` are deleted in Tasks 2 and 3 after their code has moved. Delete the other four here.
- Rename: `src/routes/_app/money.tsx` → `finances.tsx`; `src/routes/_app/portuguese.tsx` → `languages.tsx`
- Modify: `convex/search.ts:169`

**Interfaces:**

- Produces: `navGroups` with headings `NOW | BUILD | TRACK` and routes in this exact order: `/dashboard /calendar /reviews /projects /goals /backlog /notes /finances /body /languages`; `mobileNav` labels `Today Calendar Projects Notes More`. `SideNav.tsx` and `palette.ts` read these and need no change.

- [ ] **Step 1: Write the failing test**

Create `src/lib/nav.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { mobileNav, navGroups } from './nav'

/* PLAN.md §3 (15 Sep): three groups, ten entries, Settings below them. A
   section that is not used is the thing the rethink exists to remove, so the
   list is pinned here rather than left to drift. */
describe('the sidebar is PLAN.md §3’s table', () => {
  test('three groups, ten entries, in this order', () => {
    expect(navGroups.map((g) => g.heading)).toEqual(['NOW', 'BUILD', 'TRACK'])
    expect(navGroups.flatMap((g) => g.items.map((i) => i.to))).toEqual([
      '/dashboard',
      '/calendar',
      '/reviews',
      '/projects',
      '/goals',
      '/backlog',
      '/notes',
      '/finances',
      '/body',
      '/languages',
    ])
  })

  test('the dashboard is called Today', () => {
    expect(navGroups[0].items[0].label).toBe('Today')
  })

  test('nothing removed on 15 Sep is listed', () => {
    const all = navGroups.flatMap((g) => g.items.map((i) => i.to))
    for (const gone of [
      '/quests',
      '/knowledge',
      '/principles',
      '/career',
      '/social',
      '/style',
      '/money',
      '/portuguese',
    ]) {
      expect(all).not.toContain(gone)
    }
  })

  test('mobile: five, Today first, More last', () => {
    expect(mobileNav.map((i) => i.label)).toEqual([
      'Today',
      'Calendar',
      'Projects',
      'Notes',
      'More',
    ])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run src/lib/nav.test.ts`
Expected: FAIL — headings are `NOW, PLAN, TRACK, KNOW`.

- [ ] **Step 3: Rewrite `src/lib/nav.ts`**

Replace the whole file with:

```ts
import {
  Activity,
  CalendarDays,
  Compass,
  Euro,
  Inbox,
  Languages,
  Layers,
  LayoutDashboard,
  MoreHorizontal,
  Notebook,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Area } from './capture-parser'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  /** The area whose colour the item wears. Only where the page *is* an area
      — the TRACK pages, and Notes, which is knowledge — because colour says
      what a thing is (§3d), and Today is not any one area. */
  area?: Area
}

export type NavGroup = {
  /* Rendered in mono caps — the label voice from PLAN.md §3. */
  heading: string
  items: Array<NavItem>
}

/**
 * The one definition of the sidebar — PLAN.md §3, rethought 15 Sep: fewer
 * places, each one deep. NOW is the day and the week that closes it. BUILD is
 * what the day is chosen from: the projects, the goals above them, the backlog
 * beneath, and the notes that feed them. TRACK is the three areas with numbers
 * of their own. Settings sits below the groups (SideNav.tsx).
 *
 * Languages still wears the `portuguese` colour and Finances the `money` one:
 * the area enum is renamed in R6, with the migration; only the label and the
 * route changed here.
 */
export const navGroups: Array<NavGroup> = [
  {
    heading: 'NOW',
    items: [
      { to: '/dashboard', label: 'Today', icon: LayoutDashboard },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/reviews', label: 'Review', icon: Compass },
    ],
  },
  {
    heading: 'BUILD',
    items: [
      { to: '/projects', label: 'Projects', icon: Layers },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/backlog', label: 'Backlog', icon: Inbox },
      { to: '/notes', label: 'Notes', icon: Notebook, area: 'knowledge' },
    ],
  },
  {
    heading: 'TRACK',
    items: [
      { to: '/finances', label: 'Finances', icon: Euro, area: 'money' },
      { to: '/body', label: 'Body', icon: Activity, area: 'body' },
      {
        to: '/languages',
        label: 'Languages',
        icon: Languages,
        area: 'portuguese',
      },
    ],
  },
]

/** Bottom nav on mobile (PLAN.md §3): five destinations, thumb-reachable. */
export const mobileNav: Array<NavItem> = [
  { to: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/projects', label: 'Projects', icon: Layers },
  { to: '/notes', label: 'Notes', icon: Notebook },
  { to: '/settings', label: 'More', icon: MoreHorizontal },
]
```

- [ ] **Step 4: Move the routes**

```bash
git rm -q src/routes/_app/knowledge.tsx src/routes/_app/career.tsx src/routes/_app/social.tsx src/routes/_app/style.tsx
git mv src/routes/_app/money.tsx src/routes/_app/finances.tsx
git mv src/routes/_app/portuguese.tsx src/routes/_app/languages.tsx
```

Replace the contents of `src/routes/_app/finances.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

/* Money until 15 Sep. Investments, balances and spending arrive in R6. */
export const Route = createFileRoute('/_app/finances')({
  component: () => <Placeholder title="Finances" phase="R6" />,
})
```

and `src/routes/_app/languages.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

/* Portuguese until 15 Sep. Portuguese · English · German arrive in R6, with
   the `languages` area and its migration. */
export const Route = createFileRoute('/_app/languages')({
  component: () => <Placeholder title="Languages" phase="R6" />,
})
```

Also update the two remaining placeholders' phase label so no page says "Phase 7+" any more: in `src/routes/_app/body.tsx` change `phase="Phase 7+"` to `phase="R6"`.

Then regenerate the route tree:

```bash
pnpm generate-routes
```

- [ ] **Step 5: Search's page examples**

In `src/lib/palette.test.ts` change the three examples that named removed pages:

```ts
it('matches a page by its label, without a slash', () => {
  const { pages } = matchPalette('languages')
  expect(pages.map((p) => p.target)).toEqual([
    { kind: 'page', to: '/languages' },
  ])
})

it('is case-insensitive and matches inside the label', () => {
  expect(matchPalette('FINANCES').pages).toHaveLength(1)
  expect(matchPalette('ack').pages.map((p) => p.label)).toEqual(['Backlog'])
})

it('narrows to the route when the query starts with a slash', () => {
  const { commands, pages } = matchPalette('/fin')
  expect(commands).toHaveLength(0)
  expect(pages.map((p) => p.slash)).toEqual(['/finances'])
})
```

- [ ] **Step 6: A principle found in Search goes to Today**

In `convex/search.ts`, the principle hit's `to: '/principles'` becomes `to: '/dashboard'` (the Principles page goes in Task 2; the six lines are still searchable).

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm exec vitest run src/lib && pnpm typecheck`
Expected: PASS. Typecheck will fail only if something still links to a removed route — `grep -rn "'/quests'\|'/principles'\|'/money'\|'/portuguese'" src` must return only `quests.tsx` and `principles.tsx` themselves (deleted in Tasks 2–3) and `QuestList.tsx:41` (rewritten in Task 3). Fix any other hit by pointing it at the new route.

- [ ] **Step 8: Commit**

```bash
git add -A src convex
git commit -m "The sidebar is PLAN.md §3's table: three groups, ten entries

Rethought 15 Sep: fewer places, each one deep. NOW / BUILD / TRACK, with
Knowledge, Career, Social and Style gone, Money renamed Finances and
Portuguese renamed Languages (labels and routes only — the area enum moves
in R6). Review is in the sidebar at last, and the mobile tab that opened a
weekly review under the name Month is gone. nav.test.ts pins the list.

<attribution line>"
```

---

### Task 2: A principle a day on Today

**Files:**

- Create: `src/lib/principle-of-day.ts`, `src/lib/principle-of-day.test.ts`
- Create: `src/components/dashboard/PrincipleLine.tsx`
- Modify: `src/routes/_app/dashboard.tsx` (greeting block)
- Delete: `src/routes/_app/principles.tsx`

**Interfaces:**

- Produces: `principleIndex(date: Date, count: number): number` — `-1` when `count` is 0; `<PrincipleLine date={Date} />`.
- Consumes: `api.principles.list` (already exists; returns the six rows ordered by `sortOrder`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/principle-of-day.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { principleIndex } from './principle-of-day'

describe('one principle a day', () => {
  test('the same one all day', () => {
    const morning = new Date(2026, 8, 15, 7, 0)
    const night = new Date(2026, 8, 15, 23, 59)
    expect(principleIndex(morning, 6)).toBe(principleIndex(night, 6))
  })

  test('a different one tomorrow', () => {
    const today = new Date(2026, 8, 15, 12, 0)
    const tomorrow = new Date(2026, 8, 16, 12, 0)
    expect(principleIndex(today, 6)).not.toBe(principleIndex(tomorrow, 6))
  })

  test('always one of the six', () => {
    for (let d = 1; d <= 31; d++) {
      const i = principleIndex(new Date(2026, 9, d, 9, 0), 6)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(6)
    }
  })

  test('nothing seeded means no principle', () => {
    expect(principleIndex(new Date(), 0)).toBe(-1)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run src/lib/principle-of-day.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/principle-of-day.ts`:

```ts
/* Which of the six principles Today shows (PLAN.md §3). Chosen by the local
   date, so it is the same line all day and a different one tomorrow — the
   weekly review already picks one per week the same way. A principle that
   changes when you refresh is decoration. */
export function principleIndex(date: Date, count: number): number {
  if (count <= 0) return -1
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = Math.floor(local.getTime() / 86_400_000)
  return ((day % count) + count) % count
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/lib/principle-of-day.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: The component**

Create `src/components/dashboard/PrincipleLine.tsx`:

```tsx
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { principleIndex } from '@/lib/principle-of-day'

/* One of the six lines, under the greeting. Read-only, like the page it
   replaced (§3b.5): they are seeded once and never edited from a screen.
   Renders nothing while loading or when nothing is seeded — a missing line
   is not worth a skeleton, and a fresh deployment says nothing rather than
   "no principles yet" on the morning screen. */
export function PrincipleLine({ date }: { date: Date }) {
  const principles = useQuery(api.principles.list, {})
  if (!principles || principles.length === 0) return null
  const line = principles[principleIndex(date, principles.length)]
  return <p className="text-[15px] font-light text-ink-300">{line.text}</p>
}
```

- [ ] **Step 6: Mount it and delete the page**

In `src/routes/_app/dashboard.tsx`, import it and add it as the last child of the greeting block (the `order-1` div), after the focus line:

```tsx
import { PrincipleLine } from '@/components/dashboard/PrincipleLine'
// …inside the order-1 div, after the focus <div>:
;<PrincipleLine date={now} />
```

Then:

```bash
git rm -q src/routes/_app/principles.tsx
pnpm generate-routes
```

- [ ] **Step 7: Verify in the browser**

Run `pnpm typecheck`, then open `http://localhost:3000/dashboard`. Under "LEVEL 32 · CURRENT FOCUS …" one principle in caps appears. Reload: the same one. `/principles` shows the 404 card inside the shell.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "One principle a day on Today, and no Principles page

The six lines never changed, and a page of them was a page never opened.
One line under the greeting, chosen by the date the way the weekly review
picks its own. Search still finds them; a hit goes to Today.

<attribution line>"
```

---

### Task 3: Today's three absorb the Quests page

The Quests page had four things Today's card lacked: an add field that also takes a slot, a drop button, a time field, and the follow-up that writes the workout/session log. Move them; delete the page. The "Logged today" list on Quests is dropped on purpose (decision 15 Sep): Log's Recent list already shows and deletes the day's rows, and the month tiles count them. If editing a log's area is missed, it returns in R2.

**Files:**

- Create: `src/components/dashboard/QuestRow.tsx`, `src/components/dashboard/QuestFollowUp.tsx`
- Modify: `src/components/dashboard/QuestList.tsx` (rewrite)
- Modify: `src/routes/_app/dashboard.tsx` (drop its own `FollowUp` and `justDone`)
- Delete: `src/routes/_app/quests.tsx`

**Interfaces:**

- Produces: `QuestList({ tasks, today })` — `tasks: Array<Doc<'tasks'>> | undefined`, `today: string` (ISO date from `localToday`). Owns the pending follow-up. `QuestRow({ task, onCompleted })` where `onCompleted(pending: PendingEvidence | null)`. `QuestFollowUp({ pending, onDone })`. `PendingEvidence = { title: string; kind: 'workout' | 'session'; area: Area }`.
- Consumes: `api.tasks.{create,pickForToday,complete,dropFromToday,setArea,setSchedule}`, `api.logs.create`, `useSave`/`SaveGlyph`/`SaveLabel` from `@/components/Saving`, `AreaBadge`.

- [ ] **Step 1: `QuestRow.tsx`** — the row and its time field, moved verbatim from `quests.tsx` (`QuestRow`, `ScheduleField`, `evidenceFor`, `PendingEvidence`), with the type exported:

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import type { Area } from '@/lib/capture-parser'

/* §3b.1: ticking the box is intent. The follow-up is the only path from a
   completed task to a row of evidence, and it is one explicit tap. Only body
   and portuguese have a countable action behind them today. */
export type PendingEvidence = {
  title: string
  kind: 'workout' | 'session'
  area: Area
}

export function evidenceFor(task: Doc<'tasks'>): PendingEvidence | null {
  if (task.area === 'body') {
    return { title: task.title, kind: 'workout', area: 'body' }
  }
  if (task.area === 'portuguese') {
    return { title: task.title, kind: 'session', area: 'portuguese' }
  }
  return null
}

export function QuestRow({
  task,
  onCompleted,
}: {
  task: Doc<'tasks'>
  onCompleted: (pending: PendingEvidence | null) => void
}) {
  const complete = useMutation(api.tasks.complete)
  const drop = useMutation(api.tasks.dropFromToday)
  const setArea = useMutation(api.tasks.setArea)
  const setSchedule = useMutation(api.tasks.setSchedule)

  return (
    <div className="flex items-center gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0">
      <button
        type="button"
        aria-label={`Complete ${task.title}`}
        onClick={async () => {
          const pending = evidenceFor(task)
          await complete({ taskId: task._id })
          onCompleted(pending)
        }}
        className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-lift/15 text-transparent transition-colors hover:border-lav-500 hover:text-lav-300"
      >
        <Check className="size-3" />
      </button>

      <span className="flex-1 text-[13px] text-foreground">{task.title}</span>

      <AreaBadge
        area={task.area}
        onChange={(area: Area) => void setArea({ taskId: task._id, area })}
      />

      <ScheduleField
        task={task}
        onSet={(scheduledAt, durationMin) =>
          void setSchedule({ taskId: task._id, scheduledAt, durationMin })
        }
      />

      <button
        type="button"
        aria-label={`Drop ${task.title}`}
        onClick={() => void drop({ taskId: task._id })}
        className="text-ink-700 transition-colors hover:text-ink-400"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/* A time is what puts a quest on the TODAY timeline (§3b.3) — nothing else
   in the app sets scheduledAt. Undated stays the normal case. */
function ScheduleField({
  task,
  onSet,
}: {
  task: Doc<'tasks'>
  onSet: (scheduledAt: number | null, durationMin?: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState(
    task.scheduledAt
      ? new Date(task.scheduledAt).toTimeString().slice(0, 5)
      : '',
  )
  const [minutes, setMinutes] = useState(
    task.durationMin ? String(task.durationMin) : '',
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] text-ink-700 transition-colors hover:text-ink-300"
        title="Give this a time"
      >
        {task.scheduledAt
          ? `${new Date(task.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${task.durationMin ? ` · ${task.durationMin} min` : ''}`
          : 'add a time'}
      </button>
    )
  }

  function save() {
    if (time.length === 0) {
      onSet(null)
      setOpen(false)
      return
    }
    const [h, m] = time.split(':').map(Number)
    const when = new Date()
    when.setHours(h, m, 0, 0)
    const length = Number(minutes)
    onSet(
      when.getTime(),
      Number.isFinite(length) && length > 0 ? length : undefined,
    )
    setOpen(false)
  }

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label={`Time for ${task.title}`}
        className="rounded-[5px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none"
      />
      <input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        placeholder="min"
        inputMode="numeric"
        aria-label={`Length for ${task.title}`}
        className="w-12 rounded-[5px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground outline-none"
      />
      <button
        type="button"
        onClick={save}
        className="rounded-[5px] border border-lav-500/60 px-1.5 py-0.5 text-[11px] text-lav-300"
      >
        Set
      </button>
    </span>
  )
}
```

- [ ] **Step 2: `QuestFollowUp.tsx`** — moved from `quests.tsx` (`FollowUp`), unchanged in behaviour:

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { SaveLabel, useSave } from '@/components/Saving'
import type { PendingEvidence } from './QuestRow'

/* Intent and evidence stay apart in both directions (§3b.1). This writes the
   second row only when it is tapped, never as a consequence of the tick. The
   row goes when the tick has been seen, not when the write lands. */
export function QuestFollowUp({
  pending,
  onDone,
}: {
  pending: PendingEvidence
  onDone: () => void
}) {
  const createLog = useMutation(api.logs.create)
  const [minutes, setMinutes] = useState('')
  const logging = useSave()

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-lift/[0.07] pt-3 text-[12.5px]">
      <span className="text-ink-400">{pending.title}</span>
      <span className="text-ink-600">
        &mdash; done. Log it as a {pending.kind}?
      </span>
      <input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        placeholder="min"
        inputMode="numeric"
        className="w-12 rounded-[5px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground outline-none"
      />
      <button
        type="button"
        disabled={logging.busy}
        onClick={() => {
          const value = Number(minutes.replace(',', '.'))
          void logging.run(() =>
            createLog({
              kind: pending.kind,
              area: pending.area,
              occurredAt: Date.now(),
              value: Number.isFinite(value) && value > 0 ? value : undefined,
              unit: 'min',
            }),
          )
        }}
        className="rounded-[5px] border border-lav-500/60 px-2 py-0.5 text-[11.5px] text-lav-300 transition-colors hover:bg-lav-900/60"
      >
        <SaveLabel
          status={logging.status}
          onSettled={() => {
            logging.settle()
            onDone()
          }}
        >
          Yes
        </SaveLabel>
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
      >
        No
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite `QuestList.tsx`** — the card now owns the add field (from `quests.tsx`'s `add()`) and the follow-up:

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { SaveGlyph, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { useArrived } from '@/lib/loading'
import { QuestFollowUp } from './QuestFollowUp'
import { QuestRow } from './QuestRow'
import type { PendingEvidence } from './QuestRow'

const TODAY_LIMIT = 3

/* PLAN.md §3 item 2 and §3c.1. Three slots, and when they are full the "add"
   affordance is replaced by a sentence rather than disabled and left there.
   The Quests page lived here until 15 Sep; this card is it now.

   No backlog count anywhere on this screen (§3c.3). */
export function QuestList({
  tasks,
  today,
}: {
  tasks: Array<Doc<'tasks'>> | undefined
  today: string
}) {
  const arrived = useArrived(tasks)
  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const [title, setTitle] = useState('')
  const adding = useSave()

  /* Completing a task removes it from this list, so the §3b.1 follow-up
     cannot live inside the row it belongs to — the row is already gone. It
     sits under the list and survives until it is answered or waved off. */
  const [pending, setPending] = useState<PendingEvidence | null>(null)

  const full = (tasks?.length ?? 0) >= TODAY_LIMIT

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || adding.status === 'saving') return
    await adding.run(async () => {
      const id = await createTask({ title: trimmed })
      /* Created here means "I intend to do it today" — so it takes a slot
         immediately. Created anywhere else, it waits in the backlog. */
      await pickForToday({ taskId: id, today })
    })
    setTitle('')
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Today&rsquo;s three</div>
        <div className="label-caps">
          {tasks ? `${tasks.length} of ${TODAY_LIMIT}` : ''}
        </div>
      </div>

      {tasks === undefined ? (
        <SkeletonRows rows={3} />
      ) : tasks.length === 0 ? (
        <p className={`text-[13px] text-ink-500 ${arrived}`}>
          Nothing picked yet. Three is the whole day.
        </p>
      ) : (
        <div className={`flex flex-col ${arrived}`}>
          {tasks.map((task) => (
            <QuestRow key={task._id} task={task} onCompleted={setPending} />
          ))}
        </div>
      )}

      {pending ? (
        <QuestFollowUp pending={pending} onDone={() => setPending(null)} />
      ) : null}

      {full ? (
        <p className="text-[13px] text-ink-400">
          Today is full. Finish one or drop one.
        </p>
      ) : (
        <div className="flex items-center gap-2 border-t border-lift/[0.07] pt-3">
          <SaveGlyph
            status={adding.status}
            onSettled={adding.settle}
            idle={<Plus className="size-3.5" />}
            className="text-ink-600"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
            placeholder="What are you actually doing today?"
            className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Dashboard hands over** — in `src/routes/_app/dashboard.tsx` remove the `justDone` state, the `FollowUp` function, the `Doc` import if now unused, and render `<QuestList tasks={quests} today={today} />`. (The full dashboard file is rewritten in Task 4; do the minimum here so typecheck passes.)

- [ ] **Step 5: Delete the page and regenerate**

```bash
git rm -q src/routes/_app/quests.tsx
pnpm generate-routes
pnpm typecheck && pnpm lint
```

Expected: both pass. If lint flags `TODAY_LIMIT` unused anywhere, it lived in `quests.tsx` only — nothing else imports it.

- [ ] **Step 6: Verify in the browser** (`http://localhost:3000/dashboard`)
  1. Type a task in "What are you actually doing today?" and press Enter → the + becomes a spinner then a tick, the row appears, "1 of 3".
  2. Tap "add a time", set 09:00 / 30, Set → the row shows `09:00 AM · 30 min` and the TODAY card lists it.
  3. Set its area to Body, tick it → "— done. Log it as a workout?" appears; Yes → the tick draws, the prompt goes.
  4. Add three tasks → the field is replaced by "Today is full. Finish one or drop one."; drop one → the field returns.
  5. Delete the test rows (drop them, then delete from Backlog).
  6. `/quests` shows the 404 card.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "Today's three live on Today; the Quests page is gone

The page held four things the dashboard card lacked — add-and-take-a-slot,
drop, a time field, and the follow-up that writes the workout or session
row — so the card gets them and the page goes. QuestRow and QuestFollowUp
are moved, not rewritten. The three-a-day limit is untouched (§3c.1).
\"Logged today\" is dropped on purpose: Log's Recent list shows and deletes
the day's rows.

<attribution line>"
```

---

### Task 4: Today without the chains card or the dead cells

**Files:**

- Modify: `src/routes/_app/dashboard.tsx` (rewrite)
- Modify: `src/components/dashboard/StateStrip.tsx:40-144` (drop Business and Career cells, the `entityCounts` query, and the `target` helper)
- Delete: `src/components/dashboard/ChainsCard.tsx`

- [ ] **Step 1: Rewrite `dashboard.tsx`**

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
import { localToday } from '@/lib/today'
import { useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/dashboard')({
  component: Today,
})

/* Today — PLAN.md §3 (15 Sep): greeting, focus and a principle; TODAY beside
   TODAY'S THREE; CURRENT STATE; THIS MONTH. The chains card and the Business
   and Career cells are gone: projects were counted twice, and Career had
   nothing to count.

   Every number on it comes from convex/aggregate.ts. This file composes them
   and computes none, and there is no bar anywhere yet — R2 adds the year bar
   (a calendar fact) and targets on the tiles (goals.targetValue, §1). */
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
    /* Mobile order (§3): greeting → the three → TODAY → this month → state.
       One source of markup, reordered: a phone-shaped copy of this screen is
       a second version of the same page, and they drift. */
    <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2">
      <div className="order-1 flex flex-col gap-2 lg:col-span-2">
        <h1 className="text-[34px] leading-tight font-light text-foreground">
          {greeting(now)}, {firstName.toUpperCase()}.
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* LEVEL 32 is my age. It is a joke, and it stays honest by being
              one: it is not derived from anything and it never goes up
              because of what I did this week. */}
          <span className="label-caps">Level 32</span>
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

      <div className="order-5 lg:order-4 lg:col-span-2">
        <StateStrip today={now.getTime()} />
      </div>

      <div className="order-4 lg:order-5 lg:col-span-2">
        <ActionsLogged today={now.getTime()} />
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

- [ ] **Step 2: Trim `StateStrip.tsx`**
  - Delete the two objects labelled `'Business'` and `'Career'` from `cells`.
  - Delete `const entities = useQuery(api.aggregate.entityCounts, {})`.
  - Delete the `target()` helper at the bottom of the file if nothing else calls it (`grep -n "target(" src/components/dashboard/StateStrip.tsx` — keep `ofTarget`, which Portuguese uses).
  - Change the header comment's "Six cells" to "Four cells" and the grid to `sm:grid-cols-2 lg:grid-cols-4`.
  - Rename the `'Portuguese'` cell label to `'Languages'` and `'Money'` to `'Finances'` (labels only; keys and areas unchanged).

- [ ] **Step 3: Delete the card**

```bash
git rm -q src/components/dashboard/ChainsCard.tsx
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Verify in the browser** — Today shows, top to bottom on desktop: greeting with principle; TODAY | TODAY'S THREE; CURRENT STATE with four cells (Languages, Body, Finances, Social); THIS MONTH. No "Chains" card anywhere. At phone width (Viewport menu → Mobile) the three come before TODAY.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Today: no chains card, four state cells, the three beside the day

Projects were counted twice on the morning screen (the Chains card and the
Business cell) and Career had nothing to count. Both go. TODAY sits beside
TODAY'S THREE, and on a phone the three come first — the order PLAN.md §3
gives for 7am.

<attribution line>"
```

---

### Task 5: "Chain" → "project", everywhere a person reads it

**Files:**

- Rename: `src/components/chains/ChainCard.tsx` → `src/components/projects/ProjectCard.tsx` (export `ProjectCard`, type `ProjectCounts`)
- Modify: `src/routes/_app/projects.index.tsx`, `src/routes/_app/projects.$id.tsx`, `src/routes/_app/goals.tsx`
- Modify: `convex/projects.ts`, `convex/goals.ts`, and any test asserting the old strings

- [ ] **Step 1: Rename the component**

```bash
mkdir -p src/components/projects
git mv src/components/chains/ChainCard.tsx src/components/projects/ProjectCard.tsx
rmdir src/components/chains
```

Inside it: `export type ChainCounts` → `export type ProjectCounts`; `export function ChainCard` → `export function ProjectCard`; the header comment's "chain(s)" → "project(s)"; the empty line `Nothing open. This chain is waiting on you to decide what is next.` → `Nothing open. This project is waiting on you to decide what is next.`

- [ ] **Step 2: Copy on the three pages**

`src/routes/_app/projects.index.tsx`:

- import `ProjectCard` from `@/components/projects/ProjectCard`; every `<ChainCard` → `<ProjectCard`; the local variable `chains` → `projects` (and `arrived`, `focus`, `rest` read from it).
- "No chains yet. A chain is a goal with work hanging off it — start one above." → "No projects yet. A project is work under a goal — start one above."
- "Nothing in focus. Pick the one chain that matters this week." → "Nothing in focus. Pick the one project that matters this week."
- "A chain needs both a goal and a first project." → "A project needs a goal above it and a title."
- Both "New chain" strings → "New project".

`src/routes/_app/projects.$id.tsx`:

- "No such chain." → "No such project."; "Complete the chain" → "Complete the project"; "Nothing open. Either this chain is done or…" → "…this project is done or…"; placeholder "Another link in the chain" → "Another task for this project"; the back link text "Chains" → "Projects"; header comment likewise.

`src/routes/_app/goals.tsx`:

- variable `chains` → `projects`; "They are created with their first chain, on the Projects page." → "They are created with their first project, on the Projects page."; the count line `chains` → `projects` (use the existing `plural`-style wording: `1 project` / `2 projects` — the file currently prints `{n} chains`; print `{n} {n === 1 ? 'project' : 'projects'}`).

- [ ] **Step 3: Server-side words**

`convex/projects.ts`: `'A chain needs a title'` → `'A project needs a title'`; `'Use setFocus, which demotes the chain already in focus'` → `'…the project already in focus'`; comments likewise.
`convex/goals.ts`: `` `Delete its chains first: …` `` → `` `Delete its projects first: …` ``.

Then find any test pinned to the old words and update it:

```bash
grep -rn "chain" convex/*.test.ts src/lib/*.test.ts
```

`src/lib/convex-errors.test.ts` uses `'This goal still has a chain: Oreum'` as an arbitrary sentence — change it to `'This goal still has a project: Oreum'` for consistency.

- [ ] **Step 4: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. Then `grep -rn -i "chain" src convex --include='*.ts' --include='*.tsx' | grep -v "_generated"` should show only comments explaining the rename (acceptable) and `PLAN.md` history — no user-facing string.

- [ ] **Step 5: Commit**

```bash
git add -A src convex
git commit -m "The word is project, not chain

\"Chain\" (goal → project → tasks) explained less than it confused, and only
the word goes: the schema, the one-focus rule and the goal above every
project are unchanged. ProjectCard replaces ChainCard; pages and server
error strings say project.

<attribution line>"
```

---

### Task 6: Close the slice

- [ ] **Step 1: The full check**

```bash
pnpm typecheck && pnpm lint && pnpm check && pnpm test && pnpm build
```

Expected: all pass. `pnpm check` is prettier; run `pnpm format` if it complains.

- [ ] **Step 2: Walk every sidebar entry in the browser**, dark and light (Settings → Appearance): Today, Calendar, Review, Projects, Goals, Backlog, Notes, Finances, Body, Languages, Settings. Each opens inside the shell; the three placeholders say R6; nothing says "chain", "Quests", "Money" or "Portuguese" as a page name. Search (⌘K): type `fin` → Finances; type a principle's words → a hit that opens Today.

- [ ] **Step 3: Done-when** (`PLAN.md` §4 R1): the sidebar is §3's table; nothing on Today is a placeholder or a duplicate; all checks pass. If any item fails, fix it in this slice — do not carry it to R2.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin rethink-r1
gh pr create --base master --title "R1: prune and rename — the sidebar is PLAN.md §3's table" --body "<summary of the five commits; end with the attribution line the session reminder gives>"
```

Then tell Artem what to verify by hand (Step 2's list) and that R2's plan is written only after R1 is merged.
