# R6b-b — Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Languages a real page with a tab per language Artem has marked as one — so inventing "English" in Settings gives it its own tab, its classes, its practice, its level and what is booked next, with no deploy.

**Architecture:** An area becomes a language because a new `areas.track` flag says so — chosen over deriving it from session logs (which needs an exclusion list for `work`, i.e. the hardcoded list back through the side door) and over a `languages` table (whose only non-config field, the current level, cannot live there: a level is state over time and belongs in `stateSnapshots`). CEFR keys become `cefr_level:<slug>` so two languages stop overwriting each other, which leaves `by_owner_key_time` untouched. Almost everything the page renders already exists: `DayStrip`, `categoryDays`, `logs.listForArea`, `stateHistory` and the section frame all shipped with Body in R6b-a.

**Tech Stack:** TanStack Start, Convex (`convex-test` + vitest), Tailwind v4 with Nocturne tokens. **No DOM tests** — `src/lib/*` and `convex/*` are tested, components are verified in the browser. **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-09-21-r6b-body-and-languages-design.md`, §8 and §9. Read it, and read `CLAUDE.md` first — it wins over habit.

**Status (22 Sep):** `master` at `7e6aafb` (R6b-a merged as #54). This is the second and final PR of R6b. After it, `PLAN.md` §4's remaining rows are R4, R5 and R7.

**What R6b-a already built that this row reuses — do not rebuild any of it:**

| Thing                                                                     | Where                                 | Use it for                                      |
| ------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `DayStrip`                                                                | `src/components/track/DayStrip.tsx`   | the per-tab consistency strip                   |
| `dayStartsBack`, `dayBlocks`, `blockLabels`, `STRIP_WEEKS`, `RECENT_DAYS` | `src/lib/day-strip.ts`                | the strip's geometry                            |
| `aggregate.categoryDays`                                                  | `convex/aggregate.ts`                 | classes and practice per day, per language area |
| `aggregate.stateHistory`                                                  | `convex/aggregate.ts`                 | the level over time, if a tab shows it          |
| `logs.listForArea`                                                        | `convex/logs.ts`                      | the recent-sessions list                        |
| the section frame and empty-state voice                                   | `src/components/body/Consistency.tsx` | every section on this page                      |
| the truncation notice                                                     | all three Body sections               | say it the same way, in the same words          |

## Global Constraints

- **Every number on screen comes from `convex/aggregate.ts`.** Components read numbers; they never compute them. A component counting an array it was handed is computing one.
- **`monthCounts()` is not touched, and its six-tile shape is not derived from the areas list.** Nine areas, six tiles, and now any number of areas, still six tiles. `git diff master -- convex/aggregate.ts | grep -c TILE_KINDS` must print `0`. The Languages tile keeps counting `{kind:'session', area:'portuguese'}` — a second language does **not** join that tile, and making it do so is a `PLAN.md` §3 change, not this row's business.
- **A slug is permanent; a label is data.** Renaming an area changes what you read, never what is stored (R6 decision 1). Tabs are keyed by slug.
- **A capture verb's area stays in code** (R6 decision 3). `pt` and `practice` file under `portuguese`; the area chip moves a line to another language. Do not make a verb's area dynamic.
- **No streaks.** Offered to Artem and declined.
- A CEFR level is words, not a scale — nothing divides by it, and it gets no bar.
- Colours, radii and spacing only from Nocturne tokens; surfaces mix `lift`/`sink`, never `white`/`black` (`src/lib/theme-tokens.test.ts` enforces this).
- `useQuery` from `convex-helpers/react/cache/hooks` (eslint enforces), `useMutation` from `convex/react`.
- Every public Convex function opens with `requireUser(ctx)` and reads **through an owner-leading index** — never `.filter()` over a table scan.
- Owner-isolation tests use **one** backend: `const t = convexTest(schema, modules)` then `t.withIdentity(...)` twice.
- **A read that can truncate says so.** Three instances of this bug were found on R6b-a. Any new query that `.take()`s gets its own named bound and a `complete` flag, reads newest-first so a capped read drops the oldest, and its section surfaces `complete: false` in the same words the Body sections use.
- Nothing is seeded. Rows created while checking in the browser are deleted before the task's commit — and **nothing of Artem's is deleted**, the dev deployment holds his real data.
- Empty states are the deliverable. This page has more of them than any other: no language marked, a language with no sessions, no level recorded, no class booked.
- **Close every task with `pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build`.** All five. R6b-a's CI failed because the plan's close step omitted `check` (Prettier) and `build`, and eleven files went in unformatted.
- Commit with a real prose message; this repo does not use `feat:`/`fix:` prefixes.

## File Structure

**Create**

| File                                         | Responsibility                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/components/languages/LanguageTabs.tsx`  | The tab bar: one per area flagged as a language, in `areas.order`, plus the no-language-marked empty state. |
| `src/components/languages/LanguagePanel.tsx` | One language's panel: classes, practice, next, level, strip, recent.                                        |
| `src/components/languages/LevelEditor.tsx`   | Record a CEFR level for one language — writes `cefr_level:<slug>`.                                          |
| `convex/areas.track.test.ts`                 | Coverage for the flag: set, unset, owner isolation, refusing an unknown slug.                               |

**Modify**

| File                                      | Change                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`                        | `areas` gains `track: v.optional(v.literal('language'))`.                                                                              |
| `convex/areas.ts`                         | New `setTrack` mutation. `list` returns the flag.                                                                                      |
| `convex/state.ts`                         | New `migrateCefrKeys` internal mutation; `record` unchanged (`key` is already `v.string()`).                                           |
| `convex/state.test.ts` (create if absent) | The migration: rewrites, idempotent, owner-scoped.                                                                                     |
| `convex/aggregate.ts`                     | `kindCount` gains an optional `category` argument (spec §6). New `languageLevels` query — the latest `cefr_level:<slug>` per language. |
| `convex/aggregate.test.ts`                | Coverage for both.                                                                                                                     |
| `src/components/settings/Areas.tsx`       | The "language" tick per row.                                                                                                           |
| `src/routes/_app/languages.tsx`           | Stops being a `Placeholder`.                                                                                                           |
| `src/components/dashboard/StateStrip.tsx` | The Languages cell names its language and writes the per-language key.                                                                 |
| `PLAN.md`                                 | §3's Languages row; §4's R6b row closed.                                                                                               |

---

### Task 1: An area can say it is a language

**Files:**

- Modify: `convex/schema.ts`, `convex/areas.ts`
- Test: `convex/areas.track.test.ts` (create)

**Interfaces:**

- Produces: `areas` rows carry `track?: 'language'`. `api.areas.setTrack({ slug, track })` where `track` is `'language'` or `null` to clear. `api.areas.list` returns the field.

**Why a flag and not a derived list:** deriving "this area is a language" from its session logs needs an exclusion for `work` (which also writes `session`, filed under `career`), and that exclusion is the hardcoded list R6 spent a row removing. It also gives a language you have just started no screen to arrive at, which is the empty state `CLAUDE.md` says to build.

- [ ] **Step 1: Write the failing tests**

Create `convex/areas.track.test.ts`:

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

describe('an area can be marked as a language', () => {
  test('the flag is set and read back', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.setTrack, {
      slug: 'portuguese',
      track: 'language',
    })
    const areas = await t.query(api.areas.list, {})
    const portuguese = areas.find((a) => a.slug === 'portuguese')
    expect(portuguese?.track).toBe('language')
  })

  test('an area you invented can be one too', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const slug = await t.mutation(api.areas.create, { label: 'English' })
    await t.mutation(api.areas.setTrack, { slug, track: 'language' })
    const areas = await t.query(api.areas.list, {})
    expect(areas.find((a) => a.slug === slug)?.track).toBe('language')
  })

  test('the flag comes off again', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.areas.setTrack, {
      slug: 'portuguese',
      track: 'language',
    })
    await t.mutation(api.areas.setTrack, { slug: 'portuguese', track: null })
    const areas = await t.query(api.areas.list, {})
    expect(areas.find((a) => a.slug === 'portuguese')?.track).toBeUndefined()
  })

  test('a slug with no row is refused', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await expect(
      t.mutation(api.areas.setTrack, { slug: 'klingon', track: 'language' }),
    ).rejects.toThrow()
  })

  test('you cannot flag another owner’s area', async () => {
    /* ONE backend, two identities. Two convexTest() calls are two databases
       and would pass whatever the mutation did. */
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    const theirs = backend.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    await mine.mutation(api.areas.ensure, {})
    await theirs.mutation(api.areas.ensure, {})

    await theirs.mutation(api.areas.setTrack, {
      slug: 'portuguese',
      track: 'language',
    })
    const myAreas = await mine.query(api.areas.list, {})
    expect(myAreas.find((a) => a.slug === 'portuguese')?.track).toBeUndefined()
  })
})
```

Check `convex/areas.ts`'s existing signatures before running: if `create` returns something other than the new slug, or `ensure` takes arguments, adapt these calls to what is actually there and say so in your report.

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm test convex/areas.track.test.ts
```

Expected: FAIL — `api.areas.setTrack` does not exist.

- [ ] **Step 3: Add the field**

In `convex/schema.ts`, in the `areas` table, after `replacedBy`:

```ts
    /* Which TRACK page claims this area (R6b-b). Named generally and valued
       narrowly: Body claiming areas the same way later is one more literal
       here, not a second field. An area is a language because this says so —
       deriving it from session logs would need an exclusion for `work`, which
       is the hardcoded list R6 spent a row removing. */
    track: v.optional(v.literal('language')),
```

- [ ] **Step 4: Write the mutation**

In `convex/areas.ts`, following the shape of the existing `setHue`:

```ts
/**
 * Mark an area as a language, or stop. `null` clears the flag.
 *
 * The slug is looked up through by_owner_slug, so another owner's area is
 * simply not found — there is no path from here to a row you do not own.
 */
export const setTrack = mutation({
  args: {
    slug: v.string(),
    track: v.union(v.literal('language'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const area = await ctx.db
      .query('areas')
      .withIndex('by_owner_slug', (q) =>
        q.eq('ownerId', ownerId).eq('slug', args.slug),
      )
      .unique()
    if (area === null) throw new Error('NO_SUCH_AREA')

    await ctx.db.patch(area._id, {
      track: args.track === null ? undefined : args.track,
    })
    return null
  },
})
```

If `areas.ts` already has a helper that resolves a slug to a row for the owner, use it rather than repeating the query.

- [ ] **Step 5: Run them and watch them pass**

```bash
pnpm test convex/areas.track.test.ts
```

Expected: PASS. `areas.list` returns whole documents, so the field appears without changing its validator — if `list` has an explicit `returns` object rather than `schema.doc('areas')`, add `track` to it.

- [ ] **Step 6: Close the task**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/areas.ts convex/areas.track.test.ts convex/_generated
git commit -m "$(cat <<'EOF'
An area can say it is a language

One optional field on the areas row, and the mutation that sets it. This is
what makes the Languages page a tab per language you marked rather than a
fixed Portuguese/English/German three.

A flag rather than a derivation: working it out from session logs needs an
exclusion for `work`, which also writes a session, and that exclusion is the
hardcoded list R6 was spent removing.
EOF
)"
```

---

### Task 2: The tick in Settings

**Files:**

- Modify: `src/components/settings/Areas.tsx`

**Interfaces:**

- Consumes: `api.areas.setTrack` and the `track` field from `api.areas.list` (Task 1).

- [ ] **Step 1: Read the editor first**

`src/components/settings/Areas.tsx` is ~426 lines and already handles add, rename, recolour, reorder, retire, restore and delete. Read it fully before adding anything, and put the tick where it belongs in that layout rather than at the end because that is where the file ends.

- [ ] **Step 2: Add the control**

One control per live area row, labelled so its effect is plain — the words `language` and what it does, for example a small toggle reading `LANGUAGE` in the label voice, pressed when set. Requirements:

- It writes `api.areas.setTrack` with `'language'` or `null`.
- It does not appear on a retired area — a retired area is gone from the pickers and gets no page.
- It uses the file's existing token classes and motion utilities; no new colour.
- The mutation call matches how the file's other mutations are called (look for its existing save/failure handling and use the same).

Add a one-line explanation beneath the list, in the file's voice, saying that a language gets its own tab on the Languages page.

- [ ] **Step 3: Verify in the browser**

Start the dev server with `mcp__Claude_Browser__preview_start` (there is a `.claude/launch.json`); never run a dev server through Bash. Run `npx convex dev --once` first if the deployment is behind.

1. Open `/settings`. Tick `Portuguese` as a language. Confirm it sticks across a reload.
2. Create an area `English`, tick it, confirm both are ticked.
3. Untick `English`. Confirm it clears.
4. Confirm a retired area shows no tick control.
5. **Delete the `English` area you created.** Leave `Portuguese` ticked — it is wanted, and Task 6 needs it.

- [ ] **Step 4: Close the task**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/Areas.tsx
git commit -m "$(cat <<'EOF'
Ticking an area as a language

The whole of "add a language" is: invent the area, tick the box. There is no
language editor, because an area is already the thing being edited.
EOF
)"
```

---

### Task 3: A level per language

**Files:**

- Modify: `convex/state.ts`
- Test: `convex/state.test.ts` (create if absent)

**Interfaces:**

- Produces: `internal.state.migrateCefrKeys` — rewrites `stateSnapshots` rows keyed `cefr_level` to `cefr_level:portuguese`. Idempotent, owner-scoped.
- The key convention from here on is `cefr_level:<slug>`.

**Why a composite key and not a new index:** the key is already `v.string()` and `by_owner_key_time` already leads with the owner and the key, so `cefr_level:portuguese` is a range read exactly as `cefr_level` was. Adding an index on `area` would rebuild an index to express something the key can say for free.

**Why any migration at all:** Artem has recorded a level already. Leaving those rows on the bare key would show Portuguese as blank on day one of this page, with his real answer invisible one key away.

- [ ] **Step 1: Write the failing tests**

Create `convex/state.test.ts` (or append if it exists), following the conventions in `convex/logs.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

describe('cefr keys become per-language', () => {
  test('an old bare key is rewritten to Portuguese', async () => {
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level',
      textValue: 'B1',
      recordedAt: Date.now(),
    })

    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows.map((r) => r.key)).toEqual(['cefr_level:portuguese'])
    expect(rows[0].textValue).toBe('B1')
  })

  test('running it twice changes nothing the second time', async () => {
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level',
      textValue: 'B1',
      recordedAt: Date.now(),
    })

    await backend.mutation(internal.state.migrateCefrKeys, {})
    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('cefr_level:portuguese')
  })

  test('a key that is not cefr_level is left alone', async () => {
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    await mine.mutation(api.areas.ensure, {})
    await mine.mutation(api.state.record, {
      area: 'body',
      key: 'weight',
      value: 75.4,
      unit: 'kg',
      recordedAt: Date.now(),
    })

    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows[0].key).toBe('weight')
  })

  test('every owner’s rows are migrated, each under their own', async () => {
    const backend = convexTest(schema, modules)
    for (const who of [ME, SOMEONE_ELSE]) {
      const t = backend.withIdentity({ tokenIdentifier: who })
      await t.mutation(api.areas.ensure, {})
      await t.mutation(api.state.record, {
        area: 'portuguese',
        key: 'cefr_level',
        textValue: 'B1',
        recordedAt: Date.now(),
      })
    }

    await backend.mutation(internal.state.migrateCefrKeys, {})

    const rows = await backend.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.key))).toEqual(
      new Set(['cefr_level:portuguese']),
    )
    expect(new Set(rows.map((r) => r.ownerId)).size).toBe(2)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm test convex/state.test.ts
```

Expected: FAIL — `internal.state.migrateCefrKeys` does not exist.

- [ ] **Step 3: Write the migration**

In `convex/state.ts`:

```ts
/**
 * `cefr_level` becomes `cefr_level:portuguese` (R6b-b).
 *
 * The key was global while there was one language. A second one would have
 * overwritten the first — "latest row wins" is what makes currentState true,
 * and with one key that truth becomes a lie the moment two languages share
 * it. The slug goes in the key rather than into a new index: the key is
 * already a string and `by_owner_key_time` already leads with owner and key,
 * so the composite reads as the same range scan.
 *
 * An internal mutation with no identity of its own — it migrates every
 * owner's rows, each under the owner they already carry. Idempotent: a row
 * already carrying a suffixed key is skipped, so running it twice is running
 * it once.
 *
 * Run once against the deployment:
 *   npx convex run state:migrateCefrKeys
 */
export const migrateCefrKeys = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    /* Every owner's rows, so this cannot be scoped by an owner index. It is
       a one-off over a table holding one row per weigh-in and level, which is
       small — and it is internal, so no client can reach it. */
    const rows = await ctx.db.query('stateSnapshots').collect()
    let moved = 0
    for (const row of rows) {
      if (row.key !== 'cefr_level') continue
      await ctx.db.patch(row._id, { key: `cefr_level:${row.area}` })
      moved += 1
    }
    return moved
  },
})
```

Keying on `row.area` rather than the literal `portuguese` means a row filed under a language he had already invented migrates to its own key rather than all of them collapsing into one. Import `internalMutation` from `./_generated/server` if it is not already imported.

- [ ] **Step 4: Run them and watch them pass**

```bash
pnpm test convex/state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run it against the dev deployment**

```bash
npx convex run state:migrateCefrKeys
```

Report the number it returns. **This writes to Artem's real data** — it renames a key on rows he wrote, which is the intent, but check before and after with `npx convex data stateSnapshots` and put both in your report.

- [ ] **Step 6: Close the task**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add convex/state.ts convex/state.test.ts convex/_generated
git commit -m "$(cat <<'EOF'
A level belongs to a language, not to the app

`cefr_level` was global while there was one language. A second would have
overwritten the first, because latest-row-wins is what makes the state strip
true. The slug goes into the key — `cefr_level:portuguese` — which leaves
by_owner_key_time exactly as it was.
EOF
)"
```

---

### Task 4: The two numbers a tab needs

**Files:**

- Modify: `convex/aggregate.ts`
- Test: `convex/aggregate.test.ts`

**Interfaces:**

- Produces: `kindCount` gains `category: v.optional(v.string())`. New `languageLevels` query:

```ts
api.aggregate.languageLevels({ slugs: Array<string> })
  => Array<{ slug: string, textValue: string | null, recordedAt: number | null }>
```

One entry per slug asked for, in the order asked, so a language with no level recorded is an explicit null rather than a missing row.

- [ ] **Step 1: Write the failing tests**

Append to `convex/aggregate.test.ts`. Remember the file installs fake timers for the whole file (`vi.setSystemTime(new Date(2026, 9, 1, 12))`) — inherit that clock, do **not** add your own.

```ts
describe('kindCount can narrow to a category', () => {
  test('classes and practice are counted apart', async () => {
    const t = as(ME)
    const start = at(9, 1)
    const end = at(9, 30)
    await t.mutation(api.logs.create, {
      kind: 'session',
      area: 'portuguese',
      occurredAt: at(9, 2),
      category: 'class',
    })
    await t.mutation(api.logs.create, {
      kind: 'session',
      area: 'portuguese',
      occurredAt: at(9, 3),
      category: 'practice',
    })
    await t.mutation(api.logs.create, {
      kind: 'session',
      area: 'portuguese',
      occurredAt: at(9, 4),
      category: 'practice',
    })

    expect(
      await t.query(api.aggregate.kindCount, {
        kind: 'session',
        area: 'portuguese',
        category: 'class',
        start,
        end,
      }),
    ).toBe(1)
    expect(
      await t.query(api.aggregate.kindCount, {
        kind: 'session',
        area: 'portuguese',
        category: 'practice',
        start,
        end,
      }),
    ).toBe(2)
    /* No category asked for is every session, as before. */
    expect(
      await t.query(api.aggregate.kindCount, {
        kind: 'session',
        area: 'portuguese',
        start,
        end,
      }),
    ).toBe(3)
  })
})

describe('languageLevels', () => {
  test('the latest level for each slug asked for', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    await t.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level:portuguese',
      textValue: 'A2',
      recordedAt: at(8, 1),
    })
    await t.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level:portuguese',
      textValue: 'B1',
      recordedAt: at(9, 1),
    })

    const levels = await t.query(api.aggregate.languageLevels, {
      slugs: ['portuguese'],
    })
    expect(levels).toEqual([
      { slug: 'portuguese', textValue: 'B1', recordedAt: at(9, 1) },
    ])
  })

  test('a language with nothing recorded is an explicit null', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const levels = await t.query(api.aggregate.languageLevels, {
      slugs: ['portuguese'],
    })
    expect(levels).toEqual([
      { slug: 'portuguese', textValue: null, recordedAt: null },
    ])
  })

  test('the order asked for is the order returned', async () => {
    const t = as(ME)
    await t.mutation(api.areas.ensure, {})
    const levels = await t.query(api.aggregate.languageLevels, {
      slugs: ['portuguese', 'body', 'money'],
    })
    expect(levels.map((l) => l.slug)).toEqual(['portuguese', 'body', 'money'])
  })

  test('another owner’s level is not yours', async () => {
    const backend = convexTest(schema, modules)
    const mine = backend.withIdentity({ tokenIdentifier: ME })
    const theirs = backend.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    await theirs.mutation(api.areas.ensure, {})
    await theirs.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level:portuguese',
      textValue: 'C1',
      recordedAt: at(9, 1),
    })

    const levels = await mine.query(api.aggregate.languageLevels, {
      slugs: ['portuguese'],
    })
    expect(levels[0].textValue).toBeNull()
  })
})
```

`at(month, day)` is the file's existing helper — check its exact signature before using it and adapt if it differs.

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm test convex/aggregate.test.ts
```

Expected: FAIL — `kindCount` rejects the unknown `category` argument, and `languageLevels` does not exist.

- [ ] **Step 3: Widen `kindCount`**

Add to its `args`, beside the existing `area`:

```ts
    /** Narrows a kind written by more than one verb within one area — a class
        and an hour alone are both sessions filed under the same language, and
        a count that mixed them would say "23 this month" about neither. */
    category: v.optional(v.string()),
```

and to the filter in its handler:

```ts
        (args.category === undefined ||
          row.meta?.category === args.category) &&
```

- [ ] **Step 4: Write `languageLevels`**

In `convex/aggregate.ts`, after `currentState`:

```ts
/**
 * The latest recorded level for each language asked for — source 2, one
 * `stateSnapshots` row per slug, read through by_owner_key_time.
 *
 * The slugs arrive as an argument rather than being discovered here, for the
 * same reason `currentState` has a fixed shape: a query whose result changes
 * shape as a side effect of creating an area is one whose consumers cannot be
 * typed. The caller knows which areas it is showing tabs for.
 *
 * A language with nothing recorded comes back as an explicit null rather than
 * being missing. An absent entry would let a component render a gap that
 * looks like a level of zero, and a level is words, not a number.
 */
export const languageLevels = query({
  args: { slugs: v.array(v.string()) },
  returns: v.array(
    v.object({
      slug: v.string(),
      textValue: v.union(v.string(), v.null()),
      recordedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const out: Array<{
      slug: string
      textValue: string | null
      recordedAt: number | null
    }> = []

    for (const slug of args.slugs) {
      /* Descending on [ownerId, key, recordedAt]: one document read per
         language, not a scan of every level ever recorded. */
      const row = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ownerId).eq('key', `cefr_level:${slug}`),
        )
        .order('desc')
        .first()

      out.push({
        slug,
        textValue: row?.textValue ?? null,
        recordedAt: row?.recordedAt ?? null,
      })
    }

    return out
  },
})
```

- [ ] **Step 5: Run them and watch them pass**

```bash
pnpm test convex/aggregate.test.ts
```

Expected: PASS, and every pre-existing `kindCount` test still passes — the new argument is optional.

- [ ] **Step 6: Confirm the tiles did not move**

```bash
git diff master -- convex/aggregate.ts | grep -c TILE_KINDS
```

Expected: `0`.

- [ ] **Step 7: Close the task**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add convex/aggregate.ts convex/aggregate.test.ts convex/_generated
git commit -m "$(cat <<'EOF'
Classes counted apart from practice, and a level per language

kindCount gains a category, so "9 classes · 14 practices" is two counts of
stored rows rather than one number standing for both.

languageLevels reads the latest cefr_level:<slug> for each language a screen
is showing. The slugs arrive as an argument: a query whose shape changed
because an area was created is one nothing can be typed against.
EOF
)"
```

---

### Task 5: The level editor

**Files:**

- Create: `src/components/languages/LevelEditor.tsx`

**Interfaces:**

- Consumes: `api.aggregate.languageLevels` (Task 4), `api.state.record`.
- Produces: `<LevelEditor slug={string} label={string} textValue={string | null} recordedAt={number | null} />`

A CEFR level is words. It gets no bar, nothing divides by it, and no colour grades it — `A2` is not worse than `B1`, it is earlier.

- [ ] **Step 1: Read the pattern it follows**

`src/components/dashboard/StateStrip.tsx` already records a level by clicking the value and typing. Read how it does it — the editor shape, how it calls `api.state.record`, what it shows when nothing is recorded (an em dash, never a zero: "zero is a claim, and absence is not"). This component is that behaviour lifted onto the Languages page for one named language.

- [ ] **Step 2: Write it**

Requirements, and no more:

- Shows the level as the big light numeral/text the design voice calls for, with when it was recorded beside it in the mono label voice.
- Nothing recorded shows an em dash and a one-line prompt to set one — not a zero, not a blank.
- Pressing it opens a text input; Enter records, Escape cancels. **No blur handler** — R6b-a's review found a blur-discard silently threw away edits; `EditableMinutes` in `src/components/projects/ProjectStats.tsx` is the pattern, and it has none.
- Writes `api.state.record` with `area: slug` and `key: 'cefr_level:' + slug`. A snapshot is append-only — recording a new level supersedes the old one, it does not edit it.
- An empty string is not recorded. A level that says nothing is not a state (`state.record` refuses it anyway; do not send it).
- Tokens only, `areaVars(slug)` for the area's colour.

- [ ] **Step 3: Close the task**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build
```

It is verified in the browser as part of Task 6, where it has a page to sit on.

- [ ] **Step 4: Commit**

```bash
git add src/components/languages/LevelEditor.tsx
git commit -m "$(cat <<'EOF'
Recording where a language actually is

A level is words, so it gets no bar and no colour that grades it — A2 is not
worse than B1, it is earlier. Nothing recorded shows an em dash: zero is a
claim and absence is not.
EOF
)"
```

---

### Task 6: The page

**Files:**

- Create: `src/components/languages/LanguageTabs.tsx`, `src/components/languages/LanguagePanel.tsx`
- Modify: `src/routes/_app/languages.tsx`

**Interfaces:**

- Consumes: `api.areas.list` (Task 1), `api.aggregate.languageLevels` and `kindCount`'s `category` (Task 4), `LevelEditor` (Task 5), and from R6b-a: `DayStrip`, `dayStartsBack`/`STRIP_WEEKS`/`RECENT_DAYS`, `api.aggregate.categoryDays`, `api.logs.listForArea`, `api.events.listInRange`.

**The page, section by section:**

- **Tabs** — one per area whose `track` is `'language'`, in `areas.order`, labelled with the area's `label` and wearing its colour via `areaVars(slug)`. The selected tab is remembered in component state only; do not add a route param unless the brief for a later row asks for one.
- **CLASSES this month** — `kindCount({ kind: 'session', area: slug, category: 'class', start, end })`.
- **PRACTICE this month** — the same with `category: 'practice'`.
- **NEXT** — upcoming `events` filed under that area, from `api.events.listInRange` over a forward window. A log is evidence that something happened, so nothing in `logs` can show next Tuesday; the calendar is the only honest source for a future thing. **If nothing is booked the strip is shown and says why**, rather than being hidden — "book a class on the calendar and it shows here".
- **LEVEL** — `<LevelEditor />`, plus the target from an active goal filed under that area carrying a `targetLabel` ("B2"), shown as words beside it. Not `targetValue`: a CEFR level is not a scale anything may be divided by.
- **The strip** — `DayStrip`, two rows: classes and practice, from `categoryDays({ area: slug, kinds: ['session'], … })`. Surface `complete: false` in the same words the Body sections use.
- **RECENT sessions** — `logs.listForArea({ area: slug, … })`, its `complete` surfaced the same way.

**Empty states, all four, each a deliverable:**

1. No area marked as a language: the page says so and links to `/settings`.
2. A language with no sessions: the strip's empty state, in `Consistency.tsx`'s voice.
3. No level recorded: the em dash and the prompt (Task 5).
4. Nothing booked: the NEXT strip says how to book one.

- [ ] **Step 1: Read the sibling page first**

Read `src/components/body/Consistency.tsx`, `WeightLine.tsx` and `RecentBody.tsx`, and `src/routes/_app/body.tsx`. This page must read as their sibling: the same section frame, the same `label-caps` headings, the same empty-state voice, the same truncation wording, the same page frame (no `<h1>`, no padding — the shell provides both; `projects.index.tsx` is the reference).

- [ ] **Step 2: Write `LanguagePanel`**

One language's panel, taking `{ slug, label }`. It owns its own queries — the panel for the tab that is not selected does not need to be mounted.

- [ ] **Step 3: Write `LanguageTabs` and wire the route**

`src/routes/_app/languages.tsx` becomes:

```tsx
import { createFileRoute } from '@tanstack/react-router'

import { LanguageTabs } from '@/components/languages/LanguageTabs'

/* Languages (R6b-b). A tab per area ticked as a language in Settings, not a
   fixed Portuguese/English/German three — which is the whole reason this page
   waited for R6 to make areas data he edits. */
export const Route = createFileRoute('/_app/languages')({
  component: LanguageTabs,
})
```

Match the page frame to `src/routes/_app/body.tsx`; if the two disagree, `body.tsx` wins.

- [ ] **Step 4: Verify in the browser**

`mcp__Claude_Browser__preview_start`; never a dev server through Bash. `npx convex dev --once` if the deployment is behind. **Artem's real data is in that deployment — delete only rows you create.**

1. With `Portuguese` the only language ticked, open `/languages`. One tab. Read every section.
2. `⌘K`, `pt`, Enter. Confirm CLASSES goes up by one and the strip's classes row fills today.
3. `⌘K`, `practice 40`, Enter. Confirm PRACTICE goes up and the strip's second row fills — **and that CLASSES did not move.**
4. Set a level through the editor. Reload; confirm it persisted. Set a second one; confirm the newer wins and the older is not shown.
5. Book an event on `/calendar` filed under `portuguese`, dated in the next few days. Confirm it appears under NEXT. Delete it and confirm the empty state returns with its wording.
6. In `/settings`, create an area `English` and tick it. Confirm a second tab appears with no deploy, showing every empty state cleanly. **This is the row's done-when.**
7. Switch to the `English` tab, `⌘K`, `practice 30` — it files under Portuguese, because a verb's area is static in code. Use the area chip to move it to English. Confirm it lands in the English tab. This is the known rough edge; confirm it behaves as described rather than breaking.
8. 375px: tabs and sections readable, strips scroll horizontally, **the page does not scroll sideways**.
9. Both themes.
10. Delete every row you created, and the `English` area. Leave `Portuguese` ticked.

- [ ] **Step 5: Close the task**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/languages src/routes/_app/languages.tsx
git commit -m "$(cat <<'EOF'
Languages is a tab per language you invented

Classes apart from practice, the level you are at, what is booked next, and
twelve weeks of days. Every number is a count of stored rows or the latest
snapshot; nothing here is derived.

NEXT reads the calendar, because a log is evidence that something happened
and nothing in logs can describe next Tuesday.
EOF
)"
```

---

### Task 7: The dashboard cell, and closing the row

**Files:**

- Modify: `src/components/dashboard/StateStrip.tsx`, `PLAN.md`

**Interfaces:**

- Consumes: `api.aggregate.languageLevels` (Task 4), `api.areas.list` (Task 1).

- [ ] **Step 1: Name the language in the cell**

`src/components/dashboard/StateStrip.tsx`'s Languages cell reads `currentState().cefr_level`, whose key no longer exists after Task 3's migration. Fix it to read the most recently recorded level across the languages and to **name which language it is** — `B1 · Portuguese · 3 days ago`. Latest row wins, exactly as it does today; it simply stops pretending there is only one language.

Requirements:

- The slugs come from the areas flagged as languages, in `areas.order`.
- The cell's editor writes `cefr_level:<slug>` for the language it is showing.
- With no language ticked, the cell shows an em dash and does not break the strip's four-cell shape.
- `currentState`'s fixed three-field shape is **not** changed — a cell that appears or vanishes as a side effect of logging something is the thing its comment warns against. Leave `cefr_level` in its return; if it is now always null, say so in your report and let the final review decide whether to remove it.
- The quieter half of the cell ("2 of 4 sessions", the Languages month tile against its target) is **unchanged**. That tile still counts `{kind:'session', area:'portuguese'}` and a second language does not join it — changing that is a `PLAN.md` §3 decision, not this row's.

- [ ] **Step 2: Update `PLAN.md`**

§3's page table, the Languages row's "later" cell:

```
R6b-b (shipped): a tab per area ticked as a language — classes apart from practice, the level, what is booked next, twelve weeks of days
```

And in §4, beneath the R6b row, after R6b-a's paragraphs:

```markdown
**R6b closed on 22 Sep.** R6b-a shipped Body (#54) and R6b-b shipped
Languages. An area is a language because a `track` flag on its row says so —
a flag rather than a derivation, because working it out from session logs
needs an exclusion for `work`, which also writes a session, and that
exclusion is the hardcoded list R6 was spent removing. CEFR keys became
`cefr_level:<slug>`, migrated in place: the key was global while there was
one language, and a second would have overwritten the first, because
latest-row-wins is what makes the state strip true.

**What Languages did not take on.** The Languages month tile still counts
sessions filed under `portuguese` only — the six tiles are a fixed shape (§3
item 4) and a second language joining one is a §3 decision, not a page's.
And `practice` still files under `portuguese` in code (R6 decision 3), so a
second language's practice needs one tap on the area chip. That was left
deliberately unsolved to be felt before anything cleverer is designed.

Finances is the only TRACK page still a placeholder, and it stays one until
the money-source question has a written answer: a sum of logged amounts is
none of the four sanctioned sources (§1), which blocks Spending, Balances and
the €100 tile target alike.
```

- [ ] **Step 3: Verify in the browser**

1. `/dashboard` — the Languages cell reads `B1 · Portuguese · <when>`.
2. Record a level from the cell; confirm it lands under `cefr_level:portuguese` (`npx convex data stateSnapshots`) and shows on `/languages` too.
3. Confirm the cell's "of target" half is unchanged.
4. Confirm the Body tile and the other cells are untouched.

- [ ] **Step 4: Close the task**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/StateStrip.tsx PLAN.md
git commit -m "$(cat <<'EOF'
The morning screen names which language it means

B1 · Portuguese · 3 days ago. Latest row wins, exactly as before — it just
stops pretending there is only one language.

R6b closes here. Finances stays a placeholder until the money-source question
has a written answer.
EOF
)"
```

---

## Verification before the PR is called done

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm check && pnpm build` — **all five** — green on the branch head. R6b-a's CI failed on `check` and the plan never ran it.
- [ ] `git diff master -- convex/aggregate.ts | grep -c TILE_KINDS` is `0`.
- [ ] `git status` is clean; no `.only` left in a test; no rows left behind in the dev deployment, and nothing of Artem's deleted.
- [ ] Every number on `/languages` traces to `categoryDays`, `kindCount` or `languageLevels`. No streak, no percentage, no bar against a CEFR level.
- [ ] An area invented in Settings and ticked becomes a tab with no deploy, with all four empty states correct.
- [ ] `npx convex run state:migrateCefrKeys` has been run against the dev deployment, and the before/after is in the report.
- [ ] The Languages month tile on `/dashboard` is unchanged.
