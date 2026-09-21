# R6 — Areas Become Data You Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the set of areas something Artem edits in the app — add one, rename one, recolour one, reorder them, retire one — so that filing a goal under a word he invented needs no deploy.

**Architecture:** An `areas` table whose rows carry a permanent `slug`, an editable `label`, a `hue`, an `order` and an optional `retiredAt`. Every table that carries `area` keeps carrying **the slug, as a string** — no row is rewritten, `logs.by_owner_area_time` is untouched, and the capture verbs keep naming their area statically in code. Colour stops being ten declarations in `tokens.css` and becomes one number per row: a theme declares `--area-l` and `--area-c`, and a `<style>` element rendered by the shell declares `--area-<slug>: oklch(var(--area-l) var(--area-c) <hue>)` for every area. `areaVars(area)` keeps its exact signature, so all twenty-odd call sites never learn that areas became data.

**Tech Stack:** TanStack Start (one new route segment: an Areas section inside `/settings`), Convex (`convex-test` + vitest), Tailwind v4 with Nocturne tokens. **No DOM in tests** — test `src/lib/*` and `convex/*`, verify components in the browser. No new dependency.

**Spec:** `PLAN.md` §2 (the data model), §3d (design), §4 row R6 and the three notes beneath it ("R6 is not a rename", "A money target needs a fifth source", "R6 was split on 21 Sep"). Read `CLAUDE.md` first; it wins over habit.

**Status (21 Sep):** `master` at `b4b6fd4`. R3 shipped; #51 and #52 merged. This branch has already committed the generated `api.d.ts` and corrected three stale spots in `PLAN.md`. R6 is the current row; R6b, R4, R5 and R7 follow.

**Decisions taken with Artem on 21 Sep (do not re-open):**

1. **A slug is an area's identity; its name is data.** An `areas` row has a permanent `slug` (`body`) and an editable `label` (`Body`, or `Gym & Health`). Every table keeps `area` as that slug. The alternative — `Id<'areas'>` — was measured and rejected: it backfills every row in six tables, rebuilds `logs.by_owner_area_time`, and puts a database read inside the sub-three-second capture path, because the seventeen built-in verbs could no longer name their area statically.
2. **A theme owns lightness and chroma; an area owns its hue.** One `--area-l` and `--area-c` per theme keeps the rule that no area is louder than another (§3d), while the set stays open-ended. The 265–305° gap round the lavender accent becomes a check in `convex/areas.ts` and a test, rather than a convention someone remembers.
3. **A capture verb's area stays in code.** `gym` files under the `body` slug however that area is named. See decision 5 for what happens when that slug is retired.
4. **R6 is areas-as-data only.** Finances, Body and Languages moved to their own row, R6b. Nothing in R6 touches those three pages beyond the colour their nav items wear.
5. **Retiring: one guard and one mechanism, because measuring changed the answer.** The decision as first written was "retiring an area a capture verb needs is refused, and says which verbs". Measured against the parser, nine of the ten areas are named by a verb — so a flat refusal would have made retiring a feature that never works. Instead:
   - **Guard:** an area counted by one of the six THIS MONTH tiles (`portuguese`, `body`, `money`, `style`, `social`) cannot be retired at all. The six tiles are a fixed shape (§3 item 4) and retiring one of these would silently zero a tile.
   - **Mechanism:** any other area that a verb names (`business`, `career`, `knowledge`, `life`) retires only with a `replacedBy` slug naming a live area. Its verbs follow the redirect — one indirection, resolved in `src/lib/areas.ts` at the moment a capture is written, not a settings screen listing seventeen verbs.
6. **The ten existing areas become ten rows, and that is not seeding.** `CLAUDE.md` forbids fixture data — rows invented to make a screen look populated. These ten already exist: they are in the schema's union today, and they are on rows Artem wrote. Turning a hard-coded list into rows that say the same thing is a migration. The test for the difference: delete the ten rows and the app is _wrong_ (his existing logs lose their names and colours), where deleting a fixture would only make a screen emptier.

## Global Constraints

- Every number on screen comes from `convex/aggregate.ts` (`CLAUDE.md` "Reality over gamification"). R6 adds **no number to any screen**. An area's row count is not shown anywhere: "47 things filed under life" is exactly the number that makes people close the app, and it has no tile.
- **`monthCounts()` is not touched, and its six-tile shape is not derived from the areas list.** Nine areas, six tiles, and now ten areas, still six tiles. Its `RULES` map keeps naming slugs literally. A task that edits `aggregate.ts` has gone wrong.
- Colour says what a thing is, never whether it is good (§3d.3). An area's hue is a kind. No hue is assigned by a rank, a count or a recency.
- Colours, radii and spacing only from tokens; surfaces mix `lift`/`sink`, never `white`/`black` (`src/lib/theme-tokens.test.ts` enforces this).
- `useQuery` comes from `convex-helpers/react/cache/hooks` (eslint enforces), `useMutation` from `convex/react`.
- Every public Convex function opens with `requireUser(ctx)` and reads through an owner-leading index — never `.filter()` over a table scan.
- Owner-isolation tests use **one** backend: `const t = convexTest(schema, modules)` then `t.withIdentity(...)` twice. Two `convexTest()` calls are two databases and prove nothing.
- Nothing is seeded, and nothing is left behind. Areas created while checking in the browser are deleted before the task's commit.
- Close every task with `pnpm typecheck && pnpm lint && pnpm test`, then commit. Never `git checkout` a file under `convex/_generated/` — `convex dev` rewrites it; commit it instead.

## File Structure

**Create**

| File                                  | Responsibility                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/areas.ts`                     | The table's whole API: `list`, `ensure`, `create`, `rename`, `setHue`, `reorder`, `retire`, `restore`. Slug minting and every guard live here. |
| `convex/areas.test.ts`                | convex-test coverage: owner isolation, slug collision, the tile guard, the `replacedBy` requirement, idempotent `ensure`.                      |
| `src/lib/area-slug.ts`                | Pure: `slugify()`, `nextHue()`, `resolveSlug()`. No React, no Convex — so both the client and `convex/areas.ts` import it.                     |
| `src/lib/area-slug.test.ts`           | Tests for those three.                                                                                                                         |
| `src/components/shell/AreaStyles.tsx` | Renders the one `<style>` element that declares `--area-<slug>` for every area.                                                                |
| `src/components/settings/Areas.tsx`   | The editor: the list, add, rename, recolour, reorder, retire, restore.                                                                         |

**Modify**

| File                                                                                                                                                         | Change                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`                                                                                                                                           | Add the `areas` table. `areaValidator` (the union) becomes `areaSlug = v.string()`; the union's ten literals move to `src/lib/area-slug.ts` as `BUILTIN_AREAS`. |
| `convex/projects.ts`, `convex/tasks.ts`, `convex/goals.ts`, `convex/events.ts`, `convex/logs.ts`, `convex/state.ts`                                          | Every mutation taking an `area` argument validates it against a live area row before writing.                                                                   |
| `src/styles/tokens.css`                                                                                                                                      | The ten `--area-*` declarations (both themes) are deleted; `--area-l` / `--area-c` are declared once per theme in their place.                                  |
| `src/lib/areas.ts`                                                                                                                                           | `AREAS` (the hard-coded ten) becomes `useAreas()`; gains `areaLabel()`. `areaVars()` is **unchanged**.                                                          |
| `src/lib/nav.ts`                                                                                                                                             | TRACK items keep their slugs; the doc comment stops promising an R6 enum rename.                                                                                |
| `src/lib/capture-parser.ts`                                                                                                                                  | `Area` widens to `string`; `Verb.area` narrows to `BuiltinArea`; `searchVerbs` tier 1 matches an area's label.                                                  |
| `src/components/AreaBadge.tsx`                                                                                                                               | Reads the live list; shows the label, stores the slug.                                                                                                          |
| `src/components/calendar/EventDialog.tsx`                                                                                                                    | Its private nine-item `AREAS` array is deleted (it is already stale — it is missing `projects`).                                                                |
| `src/components/goals/NewGoal.tsx`, `src/components/backlog/ListControls.tsx`, `src/routes/_app/projects.index.tsx`, `src/components/shell/QuickCapture.tsx` | The four other pickers read the live list.                                                                                                                      |
| `src/routes/_app.tsx`                                                                                                                                        | Mounts `<AreaStyles />`.                                                                                                                                        |
| `src/routes/_app/settings.tsx`                                                                                                                               | Mounts `<Areas />`.                                                                                                                                             |
| `src/lib/tiles.ts`                                                                                                                                           | The comment promising "keys stay the area names until R6 migrates the enum" is corrected — the keys are permanent.                                              |

---

### Task 1: The `areas` table, and the ten that already exist

**Files:**

- Modify: `convex/schema.ts`
- Create: `src/lib/area-slug.ts`
- Create: `src/lib/area-slug.test.ts`
- Create: `convex/areas.ts`
- Create: `convex/areas.test.ts`

**Interfaces:**

- Consumes: `requireUser(ctx)` from `convex/auth.ts`.
- Produces:
  - `BUILTIN_AREAS: ReadonlyArray<{ slug: string; label: string; hue: number }>` and `type BuiltinArea` from `src/lib/area-slug.ts`
  - `slugify(label: string): string | null`
  - `api.areas.list({ includeRetired?: boolean }) => Array<Doc<'areas'>>`
  - `api.areas.ensure({}) => null`

- [ ] **Step 1: Write the failing test for `slugify`**

Create `src/lib/area-slug.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { BUILTIN_AREAS, slugify } from './area-slug'

describe('a label becomes a slug that is safe in a CSS custom property', () => {
  test('lowercases, and joins words with a hyphen', () => {
    expect(slugify('Gym & Health')).toBe('gym-health')
    expect(slugify('English')).toBe('english')
    expect(slugify('  Side  Projects ')).toBe('side-projects')
  })

  test('keeps letters outside ASCII out of the slug', () => {
    // The slug is interpolated into `--area-<slug>` and must stay an ident.
    expect(slugify('Português')).toBe('portugu-s')
  })

  test('refuses a label that leaves nothing, or starts with a digit', () => {
    expect(slugify('!!!')).toBeNull()
    expect(slugify('   ')).toBeNull()
    expect(slugify('2026 goals')).toBeNull()
  })

  test('the ten built-ins are the ten the schema used to name', () => {
    expect(BUILTIN_AREAS.map((a) => a.slug)).toEqual([
      'projects',
      'business',
      'portuguese',
      'body',
      'money',
      'social',
      'career',
      'style',
      'knowledge',
      'life',
    ])
  })

  test('every built-in slug survives slugify unchanged', () => {
    for (const area of BUILTIN_AREAS) {
      expect(slugify(area.slug), area.slug).toBe(area.slug)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/area-slug.test.ts`
Expected: FAIL — `Failed to resolve import "./area-slug"`.

- [ ] **Step 3: Write `src/lib/area-slug.ts`**

```ts
/* An area's identity, and the two pure things that make one.

   The slug is permanent and the label is not (PLAN.md §4, R6 decision 1).
   That split exists because the slug is written into six tables, indexed by
   `logs.by_owner_area_time`, and named literally by seventeen capture verbs
   and by monthCounts' tile rules — so renaming an area must not be able to
   touch it. What you read on screen is the label; what is stored is this. */

export const BUILTIN_AREAS = [
  /* The ten, in the order every picker lists them, with the hues they were
     given in tokens.css. `projects` leads because it is the one most tasks
     want. Its 352° sits 22° from style and 23° from social rather than the
     ~35° the other nine keep — the honest cost of a tenth area on a wheel
     with a gap in it, and half the argument for this row existing. */
  { slug: 'projects', label: 'Projects', hue: 352 },
  { slug: 'business', label: 'Business', hue: 50 },
  { slug: 'portuguese', label: 'Portuguese', hue: 190 },
  { slug: 'body', label: 'Body', hue: 155 },
  { slug: 'money', label: 'Money', hue: 88 },
  { slug: 'social', label: 'Social', hue: 15 },
  { slug: 'career', label: 'Career', hue: 250 },
  { slug: 'style', label: 'Style', hue: 330 },
  { slug: 'knowledge', label: 'Knowledge', hue: 225 },
  { slug: 'life', label: 'Life', hue: 122 },
] as const

/** The ten the code may still name literally — capture verbs, tile rules,
    nav items. Anything Artem invents is a plain `string`. */
export type BuiltinArea = (typeof BUILTIN_AREAS)[number]['slug']

/**
 * A label as a slug, or null when the label cannot make one.
 *
 * The result is interpolated straight into `--area-<slug>` in a `<style>`
 * element (AreaStyles.tsx), so it is restricted to `[a-z0-9-]` starting with
 * a letter: that is a valid CSS ident, and it is also why nothing a person
 * types can close the element or inject a declaration.
 */
export function slugify(label: string): string | null {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length === 0 || !/^[a-z]/.test(slug)) return null
  return slug
}

/**
 * The hue for a new area: the middle of the widest gap between the hues
 * already taken, with 265–305° treated as taken because the lavender accent
 * lives there and no area may be mistaken for it (§3d, tokens.css item 5).
 *
 * Assigned once, at creation, and stored — never recomputed. Recomputing
 * would re-colour every existing area each time one is added, and an area's
 * colour is the thing you recognise it by before you have read it.
 */
export function nextHue(taken: ReadonlyArray<number>): number {
  const ACCENT_FROM = 265
  const ACCENT_TO = 305
  const points = [...taken, ACCENT_FROM, ACCENT_TO].sort((a, b) => a - b)
  let best = 0
  let width = -1
  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = i + 1 < points.length ? points[i + 1] : points[0] + 360
    /* The accent's own span is not a gap to put an area in. */
    if (from === ACCENT_FROM && to === ACCENT_TO) continue
    if (to - from > width) {
      width = to - from
      best = Math.round((from + to) / 2) % 360
    }
  }
  return best
}

/**
 * Where a slug's rows should be filed *now*: itself, unless it was retired
 * with a replacement, in which case that one (one hop, because `retire`
 * refuses to point at a retired area — see convex/areas.ts).
 */
export function resolveSlug(
  slug: string,
  areas: ReadonlyArray<{ slug: string; replacedBy?: string }>,
): string {
  const row = areas.find((a) => a.slug === slug)
  return row?.replacedBy ?? slug
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run src/lib/area-slug.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the failing tests for `nextHue` and `resolveSlug`**

Append to `src/lib/area-slug.test.ts`:

```ts
import { nextHue, resolveSlug } from './area-slug'

describe('a new area lands in the widest gap, and never on the accent', () => {
  test('never returns a hue inside the accent gap', () => {
    const taken: Array<number> = []
    for (let i = 0; i < 12; i++) {
      const hue = nextHue(taken)
      expect(hue, `pick ${i}`).not.toBeGreaterThanOrEqual(265)
      taken.push(hue)
    }
  })

  test('splits the widest gap among the ten built-ins', () => {
    const taken = BUILTIN_AREAS.map((a) => a.hue)
    // The built-ins' widest gap is 190 → 225 (portuguese → knowledge)? No:
    // 122 → 155 is 33, 155 → 190 is 35, 190 → 225 is 35, 225 → 250 is 25,
    // 250 → 265 is the accent's edge, 305 → 330 is 25, 352 → 375(15) is 23,
    // 15 → 50 is 35, 50 → 88 is 38, 88 → 122 is 34. The widest is 50 → 88.
    expect(nextHue(taken)).toBe(69)
  })

  test('the same hue is never handed out twice in a row', () => {
    const taken = BUILTIN_AREAS.map((a) => a.hue)
    const first = nextHue(taken)
    const second = nextHue([...taken, first])
    expect(second).not.toBe(first)
  })
})

describe('a retired area sends its verbs somewhere', () => {
  const areas = [
    { slug: 'life' },
    { slug: 'knowledge', replacedBy: 'life' },
    { slug: 'body' },
  ]

  test('a live slug resolves to itself', () => {
    expect(resolveSlug('body', areas)).toBe('body')
  })

  test('a retired slug resolves to its replacement', () => {
    expect(resolveSlug('knowledge', areas)).toBe('life')
  })

  test('a slug with no row at all resolves to itself', () => {
    expect(resolveSlug('invented', areas)).toBe('invented')
  })
})
```

- [ ] **Step 6: Run them**

Run: `pnpm vitest run src/lib/area-slug.test.ts`
Expected: PASS. If `splits the widest gap` fails, read the number the
implementation produced, redo the arithmetic in the comment by hand, and fix
whichever of the two is actually wrong — do not edit the expectation to match
the output.

- [ ] **Step 7: Add the `areas` table to `convex/schema.ts`**

Above the `goals` table, and beside the existing `areaValidator`:

```ts
/* R6, 21 Sep. The set of areas used to be the union above — so adding
   "English" meant a deploy, which is how Artem found a goal with nowhere to
   go. It is rows now. What is *stored* on a goal, a task, a log, an event, a
   project or a state snapshot is still the slug string, which is why none of
   those tables changed shape and why `by_owner_area_time` never had to be
   rebuilt: only the list of legal slugs moved out of the schema. */
areas: defineTable({
  ownerId: v.string(),
  /** Permanent. Written into six tables; named literally by the capture
      verbs and by monthCounts' tile rules. Renaming never touches it. */
  slug: v.string(),
  /** What you read. This is the one an editor changes. */
  label: v.string(),
  /** 0–359. The theme owns lightness and chroma (tokens.css item 5), so this
      number is the whole of an area's colour. */
  hue: v.number(),
  order: v.number(),
  /** Retired: gone from every picker, still painting the rows that carry it
      — a log is evidence and does not stop having happened. */
  retiredAt: v.optional(v.number()),
  /** Where this area's capture verbs file now. Required when retiring an
      area a verb names; always a live slug. */
  replacedBy: v.optional(v.string()),
})
  .index('by_owner_order', ['ownerId', 'order'])
  .index('by_owner_slug', ['ownerId', 'slug']),
```

Leave `areaValidator` exactly as it is for now — Task 3 replaces it, and
replacing it here would break every other Convex file in one step.

- [ ] **Step 8: Write the failing test for `list` and `ensure`**

Create `convex/areas.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('the ten the schema used to name become ten rows', () => {
  test('ensure creates them in order', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const areas = await t.query(api.areas.list, {})
    expect(areas.map((a) => a.slug)).toEqual([
      'projects',
      'business',
      'portuguese',
      'body',
      'money',
      'social',
      'career',
      'style',
      'knowledge',
      'life',
    ])
    expect(areas.map((a) => a.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  test('ensure twice is ensure once', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.ensure, {})
    expect((await t.query(api.areas.list, {})).length).toBe(10)
  })

  test('ensure does not undo a rename', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.rename, { slug: 'body', label: 'Gym & Health' })
    await t.mutation(api.areas.ensure, {})
    const body = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'body',
    )
    expect(body?.label).toBe('Gym & Health')
  })

  test('my areas are mine', async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.areas.rename, { slug: 'life', label: 'Admin' })
    expect(await theirs.query(api.areas.list, {})).toEqual([])
  })

  test('a signed-out caller reads nothing and writes nothing', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.areas.list, {})).rejects.toThrow('Not signed in')
    await expect(t.mutation(api.areas.ensure, {})).rejects.toThrow(
      'Not signed in',
    )
  })
})
```

- [ ] **Step 9: Run it and watch it fail**

Run: `pnpm vitest run convex/areas.test.ts`
Expected: FAIL — `api.areas` does not exist.

- [ ] **Step 10: Write `convex/areas.ts` — `list` and `ensure` only**

```ts
import { v } from 'convex/values'

import { BUILTIN_AREAS } from '../src/lib/area-slug'
import type { Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireUser } from './auth'

/**
 * R6 (PLAN.md §4). The set of areas, as rows he edits.
 *
 * Everything here is scoped by `ownerId` through `by_owner_order` or
 * `by_owner_slug` — never a `.filter()`. There is one user today and the
 * schema does not know that.
 */

async function ownedAreas(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
): Promise<Array<Doc<'areas'>>> {
  return await ctx.db
    .query('areas')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
    .collect()
}

async function bySlug(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  slug: string,
): Promise<Doc<'areas'> | null> {
  return await ctx.db
    .query('areas')
    .withIndex('by_owner_slug', (q) =>
      q.eq('ownerId', ownerId).eq('slug', slug),
    )
    .unique()
}

/**
 * Every area, in his order. Retired ones are left out unless asked for: a
 * picker must not offer one, and the settings editor must still show it.
 */
export const list = query({
  args: { includeRetired: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const areas = await ownedAreas(ctx, ownerId)
    const visible = args.includeRetired
      ? areas
      : areas.filter((a) => a.retiredAt === undefined)
    return visible.sort((a, b) => a.order - b.order)
  },
})

/**
 * The ten the schema used to name, as rows — once.
 *
 * This is a migration, not a seed (`CLAUDE.md` "Nothing is seeded"). The ten
 * are not invented to fill a screen: they are already the union in
 * `schema.ts` and already on Artem's rows, and without them his existing logs
 * would lose their names and their colours. Deleting a fixture makes a screen
 * emptier; deleting these makes the app wrong.
 *
 * Idempotent, and it never touches a row that exists — so a renamed, re-hued
 * or retired area survives it. Called by the settings page on mount, which is
 * enough: an owner who has never opened settings has never edited an area,
 * and the built-ins are also the client's fallback list until then.
 */
export const ensure = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const existing = new Set(
      (await ownedAreas(ctx, ownerId)).map((a) => a.slug),
    )
    let order = 0
    for (const area of BUILTIN_AREAS) {
      if (!existing.has(area.slug)) {
        await ctx.db.insert('areas', {
          ownerId,
          slug: area.slug,
          label: area.label,
          hue: area.hue,
          order,
        })
      }
      order++
    }
    return null
  },
})
```

- [ ] **Step 11: Add `rename`, so the test that renames can run**

Append to `convex/areas.ts`:

```ts
/** The label, and only the label. The slug is what six tables hold. */
export const rename = mutation({
  args: { slug: v.string(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) throw new Error('NO_SUCH_AREA')
    const label = args.label.trim()
    if (label.length === 0) throw new Error('AREA_NEEDS_A_NAME')
    await ctx.db.patch(area._id, { label })
    return null
  },
})
```

- [ ] **Step 12: Run the tests**

Run: `pnpm vitest run convex/areas.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 13: Close the task**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green, and `convex/_generated/api.d.ts` now lists `areas`.

- [ ] **Step 14: Commit**

```bash
git add convex/schema.ts convex/areas.ts convex/areas.test.ts \
        src/lib/area-slug.ts src/lib/area-slug.test.ts \
        convex/_generated/api.d.ts
git commit -m "Areas get a table, and the ten become rows"
```

---

### Task 2: Adding, recolouring, reordering, retiring

**Files:**

- Modify: `convex/areas.ts`
- Modify: `convex/areas.test.ts`

**Interfaces:**

- Consumes: `list`, `ensure`, `rename`, `ownedAreas`, `bySlug` (Task 1); `slugify`, `nextHue` from `src/lib/area-slug.ts`.
- Produces:
  - `api.areas.create({ label }) => string` — the new slug
  - `api.areas.setHue({ slug, hue }) => null`
  - `api.areas.reorder({ slugs }) => null`
  - `api.areas.retire({ slug, replacedBy? }) => null`
  - `api.areas.restore({ slug }) => null`
  - Thrown codes: `NO_SUCH_AREA`, `AREA_NEEDS_A_NAME`, `AREA_EXISTS`, `AREA_ON_A_TILE`, `AREA_NEEDS_A_REPLACEMENT`, `LAST_AREA`

- [ ] **Step 1: Write the failing tests**

Append to `convex/areas.test.ts`:

```ts
describe('inventing an area', () => {
  test('a word he invented becomes an area he can file under', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const slug = await t.mutation(api.areas.create, { label: 'English' })
    expect(slug).toBe('english')

    const areas = await t.query(api.areas.list, {})
    const english = areas.find((a) => a.slug === 'english')
    expect(english?.label).toBe('English')
    expect(english?.order).toBe(10)

    /* The done-when: a goal filed under it, with no deploy. */
    const goalId = await t.mutation(api.goals.create, {
      title: 'C1 English',
      area: 'english',
    })
    const goal = await t.query(api.goals.get, { goalId })
    expect(goal?.area).toBe('english')
  })

  test('a new area lands outside the accent gap', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    const english = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'english',
    )!
    expect(english.hue).toBeLessThan(265)
  })

  test('a label that collides is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.create, { label: 'Body' }),
    ).rejects.toThrow('AREA_EXISTS')
  })

  test('a label that makes no slug is refused', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.areas.create, { label: '!!!' }),
    ).rejects.toThrow('AREA_NEEDS_A_NAME')
  })
})

describe('retiring (PLAN.md §4, R6 decision 5)', () => {
  test('an area a tile counts cannot be retired', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    for (const slug of ['portuguese', 'body', 'money', 'style', 'social']) {
      await expect(
        t.mutation(api.areas.retire, { slug }),
        slug,
      ).rejects.toThrow('AREA_ON_A_TILE')
    }
  })

  test('an area a verb names needs somewhere for those verbs to go', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.retire, { slug: 'knowledge' }),
    ).rejects.toThrow('AREA_NEEDS_A_REPLACEMENT')

    await t.mutation(api.areas.retire, {
      slug: 'knowledge',
      replacedBy: 'life',
    })
    const live = await t.query(api.areas.list, {})
    expect(live.map((a) => a.slug)).not.toContain('knowledge')

    const all = await t.query(api.areas.list, { includeRetired: true })
    const knowledge = all.find((a) => a.slug === 'knowledge')!
    expect(knowledge.replacedBy).toBe('life')
    expect(knowledge.retiredAt).toBeTypeOf('number')
  })

  test('a replacement must itself be live', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.retire, {
      slug: 'knowledge',
      replacedBy: 'life',
    })
    await expect(
      t.mutation(api.areas.retire, {
        slug: 'career',
        replacedBy: 'knowledge',
      }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })

  test('an invented area retires with no replacement needed', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.retire, { slug: 'english' })
    expect(
      (await t.query(api.areas.list, {})).map((a) => a.slug),
    ).not.toContain('english')
  })

  test('a retired area comes back', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.retire, { slug: 'english' })
    await t.mutation(api.areas.restore, { slug: 'english' })
    const english = (await t.query(api.areas.list, {})).find(
      (a) => a.slug === 'english',
    )!
    expect(english.retiredAt).toBeUndefined()
    expect(english.replacedBy).toBeUndefined()
  })

  test('the last live area cannot be retired', async () => {
    const t = as(ME)
    await t.mutation(api.areas.create, { label: 'Only' })
    await expect(
      t.mutation(api.areas.retire, { slug: 'only' }),
    ).rejects.toThrow('LAST_AREA')
  })
})

describe('order and colour', () => {
  test('reorder rewrites every order in one write', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const reversed = (await t.query(api.areas.list, {}))
      .map((a) => a.slug)
      .reverse()
    await t.mutation(api.areas.reorder, { slugs: reversed })
    expect((await t.query(api.areas.list, {})).map((a) => a.slug)).toEqual(
      reversed,
    )
  })

  test('a hue inside the accent gap is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.setHue, { slug: 'body', hue: 280 }),
    ).rejects.toThrow('HUE_IS_THE_ACCENT')
  })

  test('a hue outside 0–359 is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.setHue, { slug: 'body', hue: 400 }),
    ).rejects.toThrow('BAD_HUE')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run convex/areas.test.ts`
Expected: FAIL — `api.areas.create` does not exist.

- [ ] **Step 3: Write the rest of `convex/areas.ts`**

Append:

```ts
/* The five slugs one of the six THIS MONTH tiles counts (aggregate.ts RULES,
   PLAN.md §3 item 4). The tiles are a fixed shape and are deliberately not
   derived from the areas list — so retiring one of these would not shrink the
   dashboard, it would silently zero a tile. Refused rather than warned. */
const ON_A_TILE = new Set(['portuguese', 'body', 'money', 'style', 'social'])

/* The slugs a built-in capture verb names (capture-parser.ts). A verb's area
   stays in code (R6 decision 3), so retiring one of these has to say where
   those verbs file instead. `projects` is the only built-in with no verb.
   `business` is here because projectVerbs() files time on a project there. */
const NAMED_BY_A_VERB = new Set([
  'business',
  'career',
  'knowledge',
  'life',
  ...ON_A_TILE,
])

/** A word he invented, as an area. Returns the slug it was given. */
export const create = mutation({
  args: { label: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const label = args.label.trim()
    const slug = slugify(label)
    if (slug === null) throw new Error('AREA_NEEDS_A_NAME')
    if ((await bySlug(ctx, ownerId, slug)) !== null) {
      throw new Error('AREA_EXISTS')
    }
    const areas = await ownedAreas(ctx, ownerId)
    await ctx.db.insert('areas', {
      ownerId,
      slug,
      label,
      hue: nextHue(areas.map((a) => a.hue)),
      order: areas.length,
    })
    return slug
  },
})

export const setHue = mutation({
  args: { slug: v.string(), hue: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) throw new Error('NO_SUCH_AREA')
    if (!Number.isInteger(args.hue) || args.hue < 0 || args.hue > 359) {
      throw new Error('BAD_HUE')
    }
    /* §3d: the accent means live and focus, and no area may be mistaken for
       it. The gap was a convention nobody could enforce while the hues lived
       in a stylesheet; now it is a refusal. */
    if (args.hue >= 265 && args.hue <= 305) throw new Error('HUE_IS_THE_ACCENT')
    await ctx.db.patch(area._id, { hue: args.hue })
    return null
  },
})

/** His order, as the whole list. Every slug he owns, once. */
export const reorder = mutation({
  args: { slugs: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const areas = await ownedAreas(ctx, ownerId)
    const mine = new Set(areas.map((a) => a.slug))
    if (
      args.slugs.length !== areas.length ||
      new Set(args.slugs).size !== args.slugs.length ||
      args.slugs.some((slug) => !mine.has(slug))
    ) {
      throw new Error('NOT_THE_WHOLE_LIST')
    }
    for (const [order, slug] of args.slugs.entries()) {
      const area = areas.find((a) => a.slug === slug)!
      if (area.order !== order) await ctx.db.patch(area._id, { order })
    }
    return null
  },
})

/**
 * Gone from every picker; still painting the rows that carry it. A log is
 * evidence of something that happened and does not stop having happened
 * because he stopped tracking the area (`CLAUDE.md`, "Intent is not
 * evidence" — the same reason logs are append-only).
 */
export const retire = mutation({
  args: { slug: v.string(), replacedBy: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null || area.retiredAt !== undefined) {
      throw new Error('NO_SUCH_AREA')
    }
    if (ON_A_TILE.has(args.slug)) throw new Error('AREA_ON_A_TILE')

    const live = (await ownedAreas(ctx, ownerId)).filter(
      (a) => a.retiredAt === undefined,
    )
    if (live.length <= 1) throw new Error('LAST_AREA')

    let replacedBy: string | undefined
    if (NAMED_BY_A_VERB.has(args.slug)) {
      if (args.replacedBy === undefined) {
        throw new Error('AREA_NEEDS_A_REPLACEMENT')
      }
      const target = await bySlug(ctx, ownerId, args.replacedBy)
      /* Live, and not this one: a redirect to a retired area would need a
         second hop, and resolveSlug() deliberately takes only one. */
      if (
        target === null ||
        target.retiredAt !== undefined ||
        target.slug === args.slug
      ) {
        throw new Error('NO_SUCH_AREA')
      }
      replacedBy = target.slug
    }

    await ctx.db.patch(area._id, { retiredAt: Date.now(), replacedBy })
    return null
  },
})

export const restore = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await bySlug(ctx, ownerId, args.slug)
    if (area === null) throw new Error('NO_SUCH_AREA')
    await ctx.db.patch(area._id, {
      retiredAt: undefined,
      replacedBy: undefined,
    })
    return null
  },
})
```

Add to the imports at the top of the file:

```ts
import { BUILTIN_AREAS, nextHue, slugify } from '../src/lib/area-slug'
```

This is the same cross-directory import Task 1 Step 10 introduced; if it gave
trouble there, the fallback below was already taken and this line reads
`'./areaSlug'` instead.

**The fallback, in full.** `convex/tsconfig.json` has `"include": ["./**/*"]`,
which does not name `src/` — TypeScript still follows the import and
typechecks it, and Convex's bundler follows imports outside `convex/` too, so
this is expected to work as written. Verify it rather than assuming: the first
`pnpm typecheck` after Task 1 Step 10 is the answer. If either refuses: move
the file to `convex/areaSlug.ts` unchanged
and make `src/lib/area-slug.ts` a one-line re-export (`export * from
'../../convex/areaSlug'`). The client already imports from `convex/` for
`_generated/api`, so nothing else in the plan changes — every path in it that
says `@/lib/area-slug` keeps resolving.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run convex/areas.test.ts`
Expected: PASS. Two of the new tests call `api.goals.create` with
`area: 'english'` and will still fail at the validator — the union has not
widened yet. **Skip those two with `test.skip` and a `// Task 3` comment**,
and unskip them in Task 3 Step 6. Every other test must pass now.

- [ ] **Step 5: Close and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add convex/areas.ts convex/areas.test.ts convex/_generated/api.d.ts
git commit -m "An area can be invented, recoloured, reordered and retired"
```

---

### Task 3: `area` stops being an enum

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/goals.ts`, `convex/projects.ts`, `convex/tasks.ts`, `convex/events.ts`, `convex/logs.ts`, `convex/state.ts`
- Modify: `convex/areas.ts`
- Modify: `convex/areas.test.ts`
- Modify: `src/lib/capture-parser.ts`

**Interfaces:**

- Consumes: `bySlug` (Task 1), `BuiltinArea` (Task 1).
- Produces:
  - `areaSlug = v.string()` exported from `convex/schema.ts` (replaces `areaValidator`)
  - `requireLiveArea(ctx, ownerId, slug): Promise<string>` exported from `convex/areas.ts`
  - `type Area = string` from `src/lib/capture-parser.ts` (unchanged name, widened)

- [ ] **Step 1: Write the failing test**

Append to `convex/areas.test.ts`:

```ts
describe('what may be written into an area field', () => {
  test('a slug with no area row is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.goals.create, { title: 'Nope', area: 'nonsense' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })

  test("another owner's area is not an area I can file under", async () => {
    const { mine, theirs } = twoOwners()
    await theirs.mutation(api.areas.ensure, {})
    await theirs.mutation(api.areas.create, { label: 'Secret' })
    await mine.mutation(api.areas.ensure, {})
    await expect(
      mine.mutation(api.goals.create, { title: 'Nope', area: 'secret' }),
    ).rejects.toThrow('NO_SUCH_AREA')
  })

  test('a retired area can still be written — it is where things already are', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.retire, { slug: 'english' })
    /* Refusing here would mean a task already filed under `english` could not
       be edited and saved again. A picker will not offer it; the field takes
       it. */
    const goalId = await t.mutation(api.goals.create, {
      title: 'Old',
      area: 'english',
    })
    expect((await t.query(api.goals.get, { goalId }))?.area).toBe('english')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run convex/areas.test.ts -t 'what may be written'`
Expected: FAIL — the union validator rejects `'nonsense'` with a validator
error, not `NO_SUCH_AREA`.

- [ ] **Step 3: Replace the union in `convex/schema.ts`**

Delete the `areaValidator` union block (the ten `v.literal(...)` lines and
their comment) and put this in its place:

```ts
/* An area is a slug now, not a member of a fixed set (R6, 21 Sep). Artem hit
   the wall twice in one day — a goal with nowhere to go but the wrong area,
   then a task on SoloLeveling badged `business` when it is a pet project —
   and a fixed enum cannot be made to fit by choosing more carefully.

   `v.string()` at the schema, which is what lets a word he invented be
   written here at all; the guard moved to `requireLiveArea()` in areas.ts,
   which every mutation taking an area calls. The schema no longer knows the
   legal values because the legal values are rows. What it does still
   guarantee is that no row's area was rewritten by this change: the slug on
   every existing goal, task, log, event, project and state snapshot is
   exactly the string it already was, and `by_owner_area_time` was never
   rebuilt.

   The ten built-in slugs live in `src/lib/area-slug.ts` as BUILTIN_AREAS —
   still named literally by the capture verbs and monthCounts' tile rules,
   which is why they had to stay a typed list somewhere. */
export const areaSlug = v.string()
```

Then, in the same file, replace `const area = areaValidator` with
`const area = areaSlug`. No table's field changes: `area`, `v.optional(area)`
and the `by_owner_area_time` index all stay exactly as written.

- [ ] **Step 4: Add `requireLiveArea` to `convex/areas.ts`**

```ts
/**
 * The guard the schema used to be. Returns the slug when it names an area
 * this owner has — live **or retired**: a picker will not offer a retired
 * area, but a task already filed under one must still be editable and
 * saveable. Throws `NO_SUCH_AREA` otherwise.
 *
 * Another owner's area is not an area you have, which is the whole reason
 * this reads through `by_owner_slug` rather than checking a global list.
 */
export async function requireLiveArea(
  ctx: MutationCtx,
  ownerId: string,
  slug: string,
): Promise<string> {
  if ((await bySlug(ctx, ownerId, slug)) === null) {
    throw new Error('NO_SUCH_AREA')
  }
  return slug
}
```

- [ ] **Step 5: Call it from every mutation that writes an area**

Find them: `rg "areaValidator|area: v\.optional\(area|args\.area" convex/`.
In each, after `requireUser(ctx)` and before the write:

```ts
if (args.area !== undefined) {
  await requireLiveArea(ctx, ownerId, args.area)
}
```

For a required area (`goals.create`, `logs.create`, `state.set`) drop the
`if`. Change each function's `area` arg from `areaValidator` to `areaSlug`.
`convex/aggregate.ts` line 430 takes `area` as a **filter**, not a write —
change its validator to `v.optional(areaSlug)` and add no guard: filtering by
a slug that names nothing correctly returns nothing.

- [ ] **Step 6: Unskip the two tests from Task 2**

Remove the `test.skip` and the `// Task 3` comments added in Task 2 Step 4.

- [ ] **Step 7: Widen `Area` in the capture parser**

In `src/lib/capture-parser.ts`:

```ts
/* `Doc<'tasks'>['area']` is `string | undefined` since R6 — the schema no
   longer holds the list, because the list is rows. Kept as a named type so
   every consumer still reads `Area` and the widening is visible in one line
   rather than twenty. */
export type Area = NonNullable<Doc<'tasks'>['area']>
```

Then change `Verb`'s and `VerbInfo`'s `area` field, and `projectVerbs`'
literal, from `Area` to `BuiltinArea`, importing it from `./area-slug`. This
is the line that keeps the compiler checking the seventeen verbs while the
field itself is open: a typo in a verb's area is still a type error.

- [ ] **Step 8: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. The compiler will point at any `Area` that was relying on
the union — an exhaustive `switch`, a `Record<Area, …>`. There should be none;
if there is one, it is a place that assumed a fixed set and is exactly what
this row exists to find. Fix it by reading the list, not by re-narrowing.

- [ ] **Step 9: Commit**

```bash
git add convex/ src/lib/capture-parser.ts
git commit -m "An area field takes a slug, and areas.ts is the guard"
```

---

### Task 4: A theme owns lightness and chroma; an area owns its hue

**Files:**

- Modify: `src/styles/tokens.css`
- Create: `src/components/shell/AreaStyles.tsx`
- Modify: `src/routes/_app.tsx`
- Modify: `src/lib/styles.test.ts`

**Interfaces:**

- Consumes: `api.areas.list` (Task 1), `BUILTIN_AREAS` (Task 1).
- Produces: `<AreaStyles />`, and the guarantee that `--area-<slug>` resolves
  for every area — which is what keeps `areaVars()` unchanged.

- [ ] **Step 1: Write the failing stylesheet test**

Append to `src/lib/styles.test.ts`:

```ts
describe('an area colour is a hue on a lightness the theme owns (R6)', () => {
  const tokens = readFileSync(
    new URL('../styles/tokens.css', import.meta.url),
    'utf8',
  )

  test('no area declares its own oklch any more', () => {
    /* The ten moved into rows. A `--area-body: oklch(...)` left behind here
       would win in one theme and lose in the other, depending on where the
       generated block lands — which is exactly the bug to keep out. */
    expect(tokens).not.toMatch(/--area-[a-z-]+\s*:\s*oklch/)
  })

  test('both themes declare a lightness and a chroma for areas', () => {
    expect(tokens.match(/--area-l\s*:/g)).toHaveLength(2)
    expect(tokens.match(/--area-c\s*:/g)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/styles.test.ts`
Expected: FAIL — `--area-social: oklch(...)` is still there, twice over.

- [ ] **Step 3: Rewrite item 5 in `src/styles/tokens.css`**

Replace the ten `--area-*` declarations in the dark block with:

```css
/* 5. Area colours. §3d: colour says what a thing is — freely — and never
        whether it is good. An area is a kind, so it gets a colour.

        The ten hues used to be ten declarations here, which is what made the
        set closed: adding "English" meant editing a stylesheet and shipping
        it. Since R6 (21 Sep) an area is a row and its hue is a number on that
        row, and this file keeps only the two values that must be the same for
        every area — so no area is louder than another, and body is not more
        important than style because its green happens to be brighter.

        `--area-<slug>: oklch(var(--area-l) var(--area-c) <hue>)` is written by
        AreaStyles.tsx, one declaration per row. The gap at 265–305° where the
        lavender accent lives is now enforced by areas.setHue, which refuses a
        hue inside it, rather than by whoever is editing this file. */
--area-l: 0.8;
--area-c: 0.1;
```

And the ten in the `:root[data-theme='light']` block with:

```css
--area-l: 0.55;
--area-c: 0.11;
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/styles.test.ts`
Expected: PASS. The app is now colourless on every badge — Step 5 fixes that.

- [ ] **Step 5: Write `src/components/shell/AreaStyles.tsx`**

```tsx
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { BUILTIN_AREAS } from '@/lib/area-slug'

/**
 * The one place an area's hue becomes a colour.
 *
 * `areaVars(area)` hands an element `--area: var(--area-<slug>)`, and has done
 * since before areas were data — so every badge, card, tile and nav item in
 * the app already reads a custom property by slug. This element is what makes
 * those properties exist, which is why R6 changed twenty-odd call sites by
 * changing none of them.
 *
 * The built-ins render immediately and the query overwrites them when it
 * arrives: the app's pages do not render on the server (see _app.tsx), so
 * without this floor every badge would be grey for the length of a socket
 * round trip on a cold load. A renamed or re-hued built-in is corrected in
 * the same paint as the rest.
 *
 * Interpolation is safe by construction, not by escaping: a slug is
 * `[a-z0-9-]` starting with a letter (slugify), and a hue is an integer
 * 0–359 (areas.setHue). Neither can close the element.
 */
export function AreaStyles() {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  const rows = [
    ...BUILTIN_AREAS.map((a) => ({ slug: a.slug, hue: a.hue })),
    ...(areas ?? []).map((a) => ({ slug: a.slug, hue: a.hue })),
  ]
  const css = rows
    .map(
      ({ slug, hue }) =>
        `--area-${slug}:oklch(var(--area-l) var(--area-c) ${hue});`,
    )
    .join('')
  return <style>{`:root{${css}}`}</style>
}
```

Note `includeRetired: true`: a retired area must keep painting the rows that
still carry it. It is gone from the pickers, not from the past.

- [ ] **Step 6: Mount it in `src/routes/_app.tsx`**

Import it beside the other shell components and render it as the first child
of the shell, next to `<Ambient />`.

- [ ] **Step 7: Check it in the browser**

Start the dev server (`preview_start`, never `pnpm dev` in Bash), open
`/dashboard`, and confirm with `javascript_tool`:

```js
getComputedStyle(document.documentElement).getPropertyValue('--area-body')
```

Expected: `oklch(0.8 0.1 155)` in dark, `oklch(0.55 0.11 155)` after switching
to Light in Settings. Then look at Today and Backlog: every badge is the
colour it was this morning. **Measure rather than glance** — compare against
`git stash` if anything looks off by a shade.

- [ ] **Step 8: Close and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/styles/tokens.css src/components/shell/AreaStyles.tsx \
        src/routes/_app.tsx src/lib/styles.test.ts
git commit -m "A theme owns lightness and chroma, an area owns its hue"
```

---

### Task 5: `src/lib/areas.ts` starts reading the rows

**Files:**

- Modify: `src/lib/areas.ts`
- Modify: `src/components/AreaBadge.tsx`

**Interfaces:**

- Consumes: `api.areas.list`, `BUILTIN_AREAS`, `resolveSlug`.
- Produces:
  - `useAreas(): Array<{ slug: string; label: string; hue: number }>` — live, ordered, retired ones left out, built-ins until the query lands
  - `useAreaLabel(): (slug: string | undefined) => string`
  - `areaVars(area: string): CSSProperties` — **signature unchanged**

- [ ] **Step 1: Rewrite `src/lib/areas.ts`**

```tsx
import { useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../convex/_generated/api'
import { BUILTIN_AREAS } from './area-slug'

export type AreaRow = { slug: string; label: string; hue: number }

const BUILTIN_ROWS: Array<AreaRow> = BUILTIN_AREAS.map((a) => ({ ...a }))

/**
 * The areas, in his order, as every picker lists them.
 *
 * This was a hard-coded array of ten until R6. The built-ins are returned
 * while the query is in flight rather than an empty list, because an empty
 * list is a picker with nothing in it — and the ten are what the rows say
 * anyway, until he has edited one.
 */
export function useAreas(): Array<AreaRow> {
  const areas = useQuery(api.areas.list, {})
  if (areas === undefined) return BUILTIN_ROWS
  return areas.map((a) => ({ slug: a.slug, label: a.label, hue: a.hue }))
}

/**
 * A slug as the word he reads. Falls back to the slug itself for an area that
 * was retired (it is not in the live list, but rows still carry it) or one
 * this client has not loaded yet — a slug is a real word, so showing it is
 * always better than showing nothing.
 */
export function useAreaLabel(): (slug: string | undefined) => string {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  return useCallback(
    (slug: string | undefined) => {
      if (slug === undefined) return 'unfiled'
      return (
        areas?.find((a) => a.slug === slug)?.label ??
        BUILTIN_ROWS.find((a) => a.slug === slug)?.label ??
        slug
      )
    },
    [areas],
  )
}

/* An area's colour, handed to an element as a custom property so one static
   set of classes — `bg-(--area)/14 text-(--area)` — can paint any of them.
   Assembling `bg-area-${area}` from a string would compile to nothing:
   Tailwind generates the classes it can read in source, and it cannot read a
   template literal.

   Unchanged by R6, deliberately. The twenty-odd call sites hand it a slug and
   get back `--area`, exactly as before; what changed is only who declares
   `--area-<slug>` (AreaStyles.tsx, from a row) and how many there can be. */
export function areaVars(area: string): CSSProperties {
  return { '--area': `var(--area-${area})` } as CSSProperties
}
```

The old `AREAS` export is gone. The compiler will name every file that
imported it — Task 6 is that list.

- [ ] **Step 2: Rewrite `src/components/AreaBadge.tsx`**

Keep the whole comment block at the top; it is still true. Change three
things:

```tsx
import { useAreaLabel, useAreas, areaVars } from '@/lib/areas'

export function AreaBadge({
  area,
  onChange,
}: {
  area: string | undefined
  onChange?: (next: string) => void
}) {
  const areas = useAreas()
  const labelFor = useAreaLabel()
  const label = labelFor(area)
  // …tone is unchanged…
```

and in the `<select>`:

```tsx
{
  areas.map((a) => (
    <option key={a.slug} value={a.slug}>
      {a.label}
    </option>
  ))
}
```

Delete the `export { AREAS }` line at the top of the file.

`aria-label={`Area — currently ${label}`}` now reads the label, which is the
right thing for a screen reader: it should say what is on screen.

- [ ] **Step 3: Check it in the browser**

Open `/backlog`. Every badge reads its label. Change one with the select and
watch it land. Then, in Settings → your Convex dashboard or via
`javascript_tool`, rename `body` and confirm the badge follows without a
reload — this is the Convex reactivity the stack is chosen for.

- [ ] **Step 4: Commit**

```bash
pnpm typecheck 2>&1 | head -40   # expect errors only in the five files Task 6 fixes
git add src/lib/areas.ts src/components/AreaBadge.tsx
git commit -m "The badge reads the rows, and shows the name not the slug"
```

Note: `pnpm typecheck` does **not** pass at this commit — five pickers still
import the deleted `AREAS`. That is the one place in this plan where a commit
is red, and it is deliberate: splitting it the other way would put a
twenty-file mechanical change in the same commit as the design.

---

### Task 6: The other five pickers, and the nav

**Files:**

- Modify: `src/components/goals/NewGoal.tsx`
- Modify: `src/components/backlog/ListControls.tsx`
- Modify: `src/components/calendar/EventDialog.tsx`
- Modify: `src/routes/_app/projects.index.tsx`
- Modify: `src/components/shell/QuickCapture.tsx`
- Modify: `src/lib/nav.ts`
- Modify: `src/lib/nav.test.ts`
- Modify: `src/lib/tiles.ts`

**Interfaces:**

- Consumes: `useAreas()`, `useAreaLabel()`, `areaVars()` (Task 5).
- Produces: nothing new. Every one of these is the same edit.

- [ ] **Step 1: Replace each `AREAS` import with `useAreas()`**

In all five, the shape is identical:

```tsx
// before
import { AREAS } from '@/components/AreaBadge'
…
{AREAS.map((a) => ( <option key={a} value={a}>{a}</option> ))}

// after
import { useAreas } from '@/lib/areas'
…
const areas = useAreas()
…
{areas.map((a) => ( <option key={a.slug} value={a.slug}>{a.label}</option> ))}
```

`EventDialog.tsx` is the one with a difference: it holds its **own** nine-item
`AREAS` array at line 17, which has been missing `projects` since 20 Sep — an
event could not be filed under it. Delete the array and use the hook; that
stale list is a small live bug this row happens to fix.

`projects.index.tsx` renders a chip per area with `areaVars(a)` — pass
`a.slug` there and render `a.label`.

`QuickCapture.tsx` line ~1390 is the area override picker. It passes the
chosen value straight to a mutation, so it needs `a.slug` as the value and
`a.label` as the text. Leave every `areaVars('knowledge')` in that file alone:
those are a verb's area named in code, which is decision 3.

- [ ] **Step 2: Correct the promise in `src/lib/nav.ts`**

The TRACK items keep `area: 'money'`, `'body'`, `'portuguese'` — those are
slugs, and slugs are permanent. Only the doc comment is wrong:

```ts
/**
 * …
 * Languages wears the `portuguese` colour and Finances the `money` one. Those
 * are slugs, not labels: since R6 (21 Sep) renaming an area changes what you
 * read and never what is stored, so these two keep working however the areas
 * are named — and a slug being permanent is why they can be written here at
 * all. The R6b row builds the pages themselves.
 */
```

`src/lib/nav.test.ts` asserts against the nav shape; run it and fix any
assertion that named an enum member rather than a slug.

- [ ] **Step 3: Correct the comment in `src/lib/tiles.ts`**

```ts
/* PLAN.md §3 item 4: the six tiles, in monthCounts' order. Labels say
   Languages and Finances since 15 Sep. The keys are permanent — R6 (21 Sep)
   made areas data, and the way it did that was by keeping the slug as the
   stored identity, so there is no enum left to migrate and these keys never
   move. The first tile was "Projects" until 16 Sep… */
```

Also change `export type Tile` and `MonthTile.area` to read `string` where
they read `Area` — or leave them, since `Area` is now `string`. Prefer leaving
them: `Area` still says what the field means.

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green — this is the commit that closes Task 5's red one.

- [ ] **Step 5: Check every picker in the browser**

Open each of: `/goals` (New goal), `/backlog` (the filter), `/calendar` (new
event), `/projects` (the Kind chips), and ⌘K (the area override). Each lists
ten areas by label. Invent one from the Convex dashboard and confirm it
appears in all five without a reload.

- [ ] **Step 6: Commit**

```bash
git add src/components src/routes src/lib
git commit -m "Every picker reads the areas, and the calendar stops missing one"
```

---

### Task 7: Settings → Areas

This is the task the done-when lands on.

**Files:**

- Create: `src/components/settings/Areas.tsx`
- Modify: `src/routes/_app/settings.tsx`

**Interfaces:**

- Consumes: `api.areas.*` (Tasks 1–2), `useAreas()`, `areaVars()` (Task 5).
- Produces: nothing other modules import.

- [ ] **Step 1: Read the page you are adding to**

Read `src/routes/_app/settings.tsx` end to end — in particular `Appearance()`
and `Segmented()`, which set the section rhythm this must match. Read
`src/components/goals/NewGoal.tsx` too, for the form idiom.

**Take the utility classes from those two files, not from this plan.** The
code below is written in the house idiom as it stands today — `glass`,
`label-caps`, `text-foreground`, `text-ink-300`, `border-lift/[0.07]`, inputs
with `outline-none` and no focus ring (#35 removed it deliberately) — but a
class in a plan is a class nobody compiled. Where one here disagrees with the
neighbouring component, the neighbour wins. Every colour, radius and space
still comes from a token (§3d).

- [ ] **Step 2: Teach `convex-errors.ts` the new codes**

Add to `CODES` in `src/lib/convex-errors.ts`, beside `TODAY_FULL`:

```ts
const CODES: Record<string, string> = {
  TODAY_FULL: 'Today is full. Finish one or drop one.',
  /* R6. Each of these is a guard in convex/areas.ts, in the words the
     settings page would use. The last three are backstops: the interface is
     built so they cannot normally be reached (the retire control asks for a
     replacement, and the hue slider will not stop on the accent), and they
     are here so that a path nobody thought of still says something true. */
  AREA_ON_A_TILE:
    'That area is one of the six THIS MONTH tiles. Retiring it would empty a tile on Today, so it stays.',
  AREA_EXISTS: 'There is already an area with that name.',
  AREA_NEEDS_A_NAME: "That name doesn't make a usable one — try letters.",
  LAST_AREA: "That's the only area left.",
  NO_SUCH_AREA: 'That area is gone.',
  AREA_NEEDS_A_REPLACEMENT: 'Say where that area’s quick-capture words go.',
  HUE_IS_THE_ACCENT:
    'That colour is the one reserved for live and focus. Pick another.',
  BAD_HUE: 'A hue is a number from 0 to 359.',
  NOT_THE_WHOLE_LIST: 'That reorder did not match your areas.',
}
```

- [ ] **Step 3: Write `src/components/settings/Areas.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMutation } from 'convex/react'
import { ChevronDown, ChevronUp, Plus, RotateCcw } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { failureMessage } from '@/lib/convex-errors'
import { areaVars } from '@/lib/areas'

/* The hues the accent owns (§3d, tokens.css item 5). The slider draws them as
   a dead band rather than silently snapping out of them: a control that moves
   where you did not put it is worse than one that will not move there. */
const ACCENT_FROM = 265
const ACCENT_TO = 305

/**
 * R6 (PLAN.md §4). The set of areas, as a thing he edits.
 *
 * Every write here is a mutation on convex/areas.ts and every refusal it can
 * throw is a sentence in convex-errors.ts. Nothing on this page is a number:
 * an area has no count, no share and no bar, because it has no tile and no
 * denominator — "47 things filed under life" is the number that makes people
 * close the app.
 */
export function Areas() {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  const ensure = useMutation(api.areas.ensure)
  const create = useMutation(api.areas.create)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  /* Opening this page is what turns the ten built-ins into rows — the one
     call site of ensure(). The ref is because StrictMode mounts twice in dev
     and ensure, while idempotent, should not be asked twice for nothing. */
  const ensured = useRef(false)
  useEffect(() => {
    if (ensured.current) return
    ensured.current = true
    void ensure({})
  }, [ensure])

  const live = (areas ?? []).filter((a) => a.retiredAt === undefined)
  const retired = (areas ?? []).filter((a) => a.retiredAt !== undefined)

  async function run(work: () => Promise<unknown>) {
    setError(null)
    try {
      await work()
    } catch (reason) {
      setError(failureMessage(reason))
    }
  }

  return (
    <section className="glass motion-arrive rounded-xl p-4">
      <h2 className="label-caps text-ink-500">Areas</h2>
      <p className="text-ink-400 mt-1 text-sm">
        What a thing is. Rename one and every badge follows; the word stored on
        your rows never changes.
      </p>

      <ul className="mt-4 space-y-1">
        {live.map((area, i) => (
          <AreaRow
            key={area._id}
            area={area}
            live={live}
            first={i === 0}
            last={i === live.length - 1}
            onError={setError}
          />
        ))}
      </ul>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const label = adding.trim()
          if (label.length === 0) return
          void run(async () => {
            await create({ label })
            setAdding('')
          })
        }}
      >
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="A new area — English, Music, Admin"
          className="bg-lift/5 flex-1 rounded-md px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
        <button
          type="submit"
          className={
            'label-caps motion-press bg-lift/10 hover:bg-lift/15 rounded-md px-3'
          }
        >
          <Plus className="size-3.5" aria-hidden />
          <span className="sr-only">Add area</span>
        </button>
      </form>

      {error !== null ? (
        <p className="motion-arrive text-state-danger mt-3 text-sm">{error}</p>
      ) : null}

      {retired.length > 0 ? (
        <>
          <h3 className="label-caps text-ink-500 mt-6">Retired</h3>
          <ul className="mt-2 space-y-1 opacity-60">
            {retired.map((area) => (
              <RetiredRow key={area._id} area={area} onError={setError} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 4: Write the two rows**

In the same file:

```tsx
function AreaRow({
  area,
  live,
  first,
  last,
  onError,
}: {
  area: Doc<'areas'>
  live: Array<Doc<'areas'>>
  first: boolean
  last: boolean
  onError: (message: string | null) => void
}) {
  const rename = useMutation(api.areas.rename)
  const setHue = useMutation(api.areas.setHue)
  const reorder = useMutation(api.areas.reorder)
  const retire = useMutation(api.areas.retire)
  const [label, setLabel] = useState(area.label)
  /* The slider is local while it is being dragged and written once on
     release: onChange fires per pixel, and a mutation per pixel is a write
     storm for a value nobody reads until you let go. */
  const [hue, setHue_] = useState(area.hue)
  const [retiring, setRetiring] = useState(false)

  async function run(work: () => Promise<unknown>) {
    onError(null)
    try {
      await work()
    } catch (reason) {
      onError(failureMessage(reason))
    }
  }

  function move(by: number) {
    const slugs = live.map((a) => a.slug)
    const at = slugs.indexOf(area.slug)
    const to = at + by
    ;[slugs[at], slugs[to]] = [slugs[to], slugs[at]]
    void run(() => reorder({ slugs }))
  }

  return (
    <li
      style={areaVars(area.slug)}
      className="bg-lift/5 flex items-center gap-3 rounded-lg px-3 py-2"
    >
      <span className="bg-(--area) size-3 shrink-0 rounded-full" aria-hidden />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label.trim() === area.label) return
          void run(() => rename({ slug: area.slug, label }))
        }}
        aria-label={`Name of the ${area.label} area`}
        className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
      />
      <input
        type="range"
        min={0}
        max={359}
        value={hue}
        aria-label={`Colour of the ${area.label} area`}
        onChange={(e) => setHue_(Number(e.target.value))}
        onPointerUp={() => {
          if (hue === area.hue) return
          /* The accent's band is not a colour an area may have. Snap back
             rather than send a hue the mutation will refuse. */
          if (hue >= ACCENT_FROM && hue <= ACCENT_TO) {
            setHue_(area.hue)
            onError(
              'That colour is the one reserved for live and focus. Pick another.',
            )
            return
          }
          void run(() => setHue({ slug: area.slug, hue }))
        }}
        className="w-24 accent-(--area)"
      />
      <button
        type="button"
        disabled={first}
        onClick={() => move(-1)}
        className="motion-press text-ink-500 disabled:opacity-30"
      >
        <ChevronUp className="size-4" aria-hidden />
        <span className="sr-only">Move {area.label} up</span>
      </button>
      <button
        type="button"
        disabled={last}
        onClick={() => move(1)}
        className="motion-press text-ink-500 disabled:opacity-30"
      >
        <ChevronDown className="size-4" aria-hidden />
        <span className="sr-only">Move {area.label} down</span>
      </button>
      {retiring ? (
        <ReplacementPicker
          area={area}
          live={live}
          onCancel={() => setRetiring(false)}
          onPick={(replacedBy) =>
            void run(async () => {
              await retire({ slug: area.slug, replacedBy })
              setRetiring(false)
            })
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => setRetiring(true)}
          className={'label-caps motion-press text-ink-500 hover:text-ink-300'}
        >
          Retire
        </button>
      )}
    </li>
  )
}

function RetiredRow({
  area,
  onError,
}: {
  area: Doc<'areas'>
  onError: (message: string | null) => void
}) {
  const restore = useMutation(api.areas.restore)
  return (
    <li
      style={areaVars(area.slug)}
      className="bg-lift/5 flex items-center gap-3 rounded-lg px-3 py-2"
    >
      <span className="bg-(--area) size-3 shrink-0 rounded-full" aria-hidden />
      <span className="flex-1 text-sm">{area.label}</span>
      {area.replacedBy !== undefined ? (
        <span className="label-caps text-ink-500">→ {area.replacedBy}</span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          onError(null)
          void restore({ slug: area.slug }).catch((reason: unknown) =>
            onError(failureMessage(reason)),
          )
        }}
        className={'label-caps motion-press text-ink-500 hover:text-ink-300'}
      >
        <RotateCcw className="mr-1 inline size-3" aria-hidden />
        Restore
      </button>
    </li>
  )
}
```

- [ ] **Step 5: Write the replacement picker, so `AREA_NEEDS_A_REPLACEMENT` never reaches the screen**

The error is the backstop; the interface asks the question first. Still in the
same file:

```tsx
/* The slugs a built-in capture verb names. Kept in step with NAMED_BY_A_VERB
   in convex/areas.ts — this copy decides whether to *ask*, that one decides
   whether to *allow*, and the mutation is the one that is authoritative. */
const NAMED_BY_A_VERB = new Set([
  'business',
  'career',
  'knowledge',
  'life',
  'portuguese',
  'body',
  'money',
  'style',
  'social',
])

function ReplacementPicker({
  area,
  live,
  onCancel,
  onPick,
}: {
  area: Doc<'areas'>
  live: Array<Doc<'areas'>>
  onCancel: () => void
  onPick: (replacedBy: string | undefined) => void
}) {
  const needed = NAMED_BY_A_VERB.has(area.slug)
  const others = live.filter((a) => a.slug !== area.slug)

  if (!needed) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-ink-400 text-xs">Retire it?</span>
        <button
          type="button"
          onClick={() => onPick(undefined)}
          className={'label-caps motion-press text-state-danger'}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={'label-caps motion-press text-ink-500'}
        >
          No
        </button>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-ink-400 text-xs">
        And file its capture words under
      </span>
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value !== '') onPick(e.target.value)
        }}
        aria-label={`Where ${area.label}'s quick-capture words go`}
        className="bg-lift/10 rounded px-2 py-1 text-xs"
      >
        <option value="" disabled>
          choose…
        </option>
        {others.map((a) => (
          <option key={a.slug} value={a.slug}>
            {a.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onCancel}
        className={'label-caps motion-press text-ink-500'}
      >
        Cancel
      </button>
    </span>
  )
}
```

Note what happens to one of the five tile areas here: the picker asks, the
mutation refuses with `AREA_ON_A_TILE`, and the sentence explains why. That is
the right order — a control that is simply missing teaches nothing.

- [ ] **Step 6: Check the two things the code above leaves to your judgement**

**Motion.** A write that lands should be seen to land (`CLAUDE.md`, 20 Sep).
The code above puts `motion-arrive` on the section and `motion-press` on every
button. Add one more: the row of a newly created area should arrive rather
than appear. Use a utility that exists — `motion-arrive`, `motion-edge`,
`motion-pop`, `motion-draw`, `motion-building`, `motion-pulse`, `motion-leave`,
`motion-press`, `motion-fade`, `motion-breathe` — and invent no tenth.

**No count, anywhere.** A retired row shows its label, its colour and where its
capture words now file ("→ life"). It must not show how many rows still carry
it. "Still on 340 rows" is a number with no tile and no denominator, and it is
the kind of number `CLAUDE.md` exists to keep off the screen. If you find
yourself wanting it to justify the retire, that is the wrong instinct: he knows
what he stopped doing.

There is no empty state to build — `ensure` runs on mount, so there are always
at least the ten.

- [ ] **Step 7: Mount it in `settings.tsx`**

Below `Appearance()`, as its own section. Import `{ Areas }` from
`@/components/settings/Areas`.

- [ ] **Step 8: Drive the done-when in the browser, end to end**

1. Open `/settings`. Ten areas, in order, each its own colour.
2. Add one: type `English`, confirm. It appears with a hue outside 265–305°.
3. Open `/goals` → New goal. `English` is in the list.
4. File a goal under it. The goal shows an `English` badge in its own colour.
5. No deploy happened. **That is the done-when.**
6. Rename `Body` to `Gym & Health`. Every badge on Today and Backlog follows,
   live, no reload.
7. Retire `Knowledge`, filing `note` under `Life`. Confirm it leaves the five
   pickers and that an existing note's badge still reads Knowledge in its
   colour.
8. Try to retire `Body`. Read the refusal.
9. **Delete the English goal and the English area before committing.** Restore
   `Knowledge` and rename `Gym & Health` back to `Body` unless Artem says to
   keep them — they are his rows to choose, not the plan's.

- [ ] **Step 9: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/components/settings/Areas.tsx src/routes/_app/settings.tsx src/lib/convex-errors.ts
git commit -m "Areas are edited in Settings: add, rename, recolour, reorder, retire"
```

---

### Task 8: The capture path, and the last things that still say nine

**Files:**

- Modify: `src/lib/capture-parser.ts`
- Modify: `src/lib/capture-parser.test.ts`
- Modify: `src/components/shell/QuickCapture.tsx`
- Modify: `src/styles/tokens.css` (the comment only)
- Modify: `PLAN.md`

**Interfaces:**

- Consumes: `resolveSlug` (Task 1), `useAreas()` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test for search by label**

Append to `src/lib/capture-parser.test.ts`:

```ts
describe('the / list finds a verb by what its area is called (R6)', () => {
  test('a verb is found by its area label, not only its slug', () => {
    const labels = { body: 'Gym & Health' }
    const found = searchVerbs('gym', [], labels).map((c) => c.word)
    expect(found).toContain('gym')
  })

  test('with no labels given, the slug still matches as it always did', () => {
    expect(searchVerbs('body').map((c) => c.word)).toContain('gym')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/capture-parser.test.ts -t 'R6'`
Expected: FAIL — `searchVerbs` takes two arguments.

- [ ] **Step 3: Teach `searchVerbs` the labels**

The third parameter is a plain record, not a hook or a query, so this file
stays pure and free of React:

```ts
export function searchVerbs(
  query: string,
  extra: Array<Verb> = [],
  /* Slug → label. Passed by the palette, which already holds the areas. A
     verb's area is a slug in code (R6 decision 3), so without this, typing
     the word he renamed an area to would find nothing — and the word he
     renamed it to is the word he thinks in. */
  labels: Record<string, string> = {},
): Array<VerbChoice> {
  const q = query.trim().toLowerCase()
  const tier = (verb: Verb): number => {
    if (q.length === 0) return 0
    if (verb.words.some((w) => w.startsWith(q))) return 0
    const label = (labels[verb.area] ?? verb.area).toLowerCase()
    if (
      verb.area.startsWith(q) ||
      label.startsWith(q) ||
      verb.keywords.some((k) => k.startsWith(q))
    ) {
      return 1
    }
    if (verb.hint.toLowerCase().includes(q)) return 2
    return -1
  }
  // …the sort below is unchanged…
}
```

- [ ] **Step 4: Pass the labels, and resolve a retired verb area, in QuickCapture**

Where `searchVerbs` is called, build the record from `useAreas()`. And where a
parsed log's area is written, put it through `resolveSlug` against
`useQuery(api.areas.list, { includeRetired: true })`, so that a verb pointed at
a retired area files under its replacement:

```tsx
const log = { ...result.log, area: resolveSlug(result.log.area, allAreas) }
```

The badge in the modal shows the resolved area, so he sees where it is going
before Enter. Nothing lands under a name that is no longer his.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/lib/capture-parser.test.ts`
Expected: PASS, including every test that was there before — the third
parameter defaults, so no existing call changed.

- [ ] **Step 6: Check the daily loop is still under three seconds**

⌘K, type `gym`, Enter. Then `spend 48 groceries`, Enter. Nothing may block on
a query: `useAreas()` returns the built-ins synchronously and the areas list is
already in the palette's cache. If there is a visible wait, that is a defect
in this task, not a cost of the row — `CLAUDE.md`: when a feature would slow
the daily loop to make a rarer screen better, the daily loop wins.

- [ ] **Step 7: Correct the last comment in `tokens.css`**

The item 5 comment written in Task 4 still refers to "the last real room on
the wheel" in the paragraph above it, which was the argument for R6 and is now
spent. Replace that paragraph: the crowding at 352° is why this row exists, and
it is resolved — a hue is editable, and the gap is enforced by `setHue`.

- [ ] **Step 8: Close R6 in `PLAN.md`**

In §4, mark R6 shipped in the same voice the R1–R3 rows use, naming the PR.
Add a line beneath the three decisions recording what measuring changed:
retiring by refusal would have been a dead feature, because nine of the ten
areas are named by a capture verb, so `replacedBy` exists.

- [ ] **Step 9: Close the branch**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "Capture finds a verb by the name you gave its area"
```

Then open the PR against `master` (never onto another branch — every PR bases
on `master`; a stacked child once merged into a dead one). Use
`superpowers:finishing-a-development-branch`.

---

## What this row does not do

Named here so a reviewer does not read them as gaps:

- **`monthCounts()` is untouched.** Six tiles, a fixed shape, still not derived
  from the areas list. Ten areas or thirty, six tiles.
- **No number is added to any screen.** An area has no count, no share, no
  bar. There is no denominator here, so there is no ring.
- **The TRACK pages are R6b.** Finances, Body and Languages keep the colour
  their nav items wear and nothing else changes on them.
- **A money target still has no fifth source** (§4, 20 Sep). Unchanged.
- **Capture verbs are not editable.** Decision 3. A verb's area is a slug in
  code; `replacedBy` is the one indirection.
- **No project derives from a goal.** That bind was cut on 21 Sep and is not
  coming back in any form, including "an area a project inherits".

## Verify by hand, at the end

Open `/settings`, invent an area called `English`, then file a goal under it
from `/goals`. If the badge is that area's own colour and no deploy happened,
R6 is done.
