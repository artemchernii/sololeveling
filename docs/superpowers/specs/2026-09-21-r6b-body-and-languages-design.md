# R6b (part 1) — Body and Languages

**Date:** 21 September 2026
**Row:** `PLAN.md` §4, R6b — the TRACK pages
**Covers:** Body and Languages. **Finances is deliberately excluded** — see §10.
**Base:** `master` at `97f9cfa` (R6 merged, #53).

---

## 1. Why this row, and why these two pages first

`PLAN.md` §3 lists three TRACK pages. All three are placeholders today. Finances
is the row's stated done-when, and it is also the only one of the three that
needs a question answered before a line of it can be written: **a sum of logged
amounts is not one of the four sanctioned sources** (§1). "€340 spent this
month" adds up `logs.value`; source 1 counts rows. The same hole blocks the
€100 month-tile target recorded under R6 in §4.

Body and Languages need no such answer. Both read rows that already exist —
`workout` logs, `session` logs, `weight` snapshots — and both are built on the
ground R6 just laid, where an area is something Artem invents rather than a
literal in a schema. So they ship first, as two PRs off this spec, and Finances
gets its own spec with the source question at the top of it.

**Split into two PRs, both branched from `master`** (no stacking — a stacked
child was merged into a dead branch on 17 Sep, #39):

- **R6b-a — Body.** The schema change, the three new verbs, the category chip,
  three new aggregate queries, the shared `DayGrid`, the Body page.
- **R6b-b — Languages.** The `track` flag on an area, the tabs, per-language
  CEFR keys and their migration, the dashboard's Languages cell. Reuses
  everything R6b-a builds.

---

## 2. What Artem asked for, in his words

Two corrections during brainstorming moved this design off what `PLAN.md` §3
promised. Both are recorded here because the plan will otherwise re-derive the
original:

1. **"What is most important is consistency"** — asked for the ability to track
   how often he goes to the gym, stretches, and takes protein and creatine.
   §3 had promised "Gym · Stretch · Boxing · Other, weight progress against a
   target". Weight is therefore the **second** section of Body, not the first,
   and the page's spine is a per-day grid.
2. **"Protein and creatine should be one thing"** — they are taken together, so
   they are one tick, not two. One `intake` row, category `supplements`.

And for Languages: **"normally we have classes like session, how many classes I
took a month or future classes, and if I did studying myself"** — a class and an
hour alone are both sessions and must be visible apart; future classes are a
separate matter because no log can describe the future.

---

## 3. Decisions taken (do not re-open in the plan)

1. **A workout's type is stored, not inferred.** `logs.meta.category` — a field
   that has been in the schema since day one and is written by nothing — starts
   carrying it. Deriving the type from free text was rejected: `run 30 by the
river` and `gym push day` make the grouping a guess, and a guessed category
   is indistinguishable on screen from a stored one.
2. **The category is a plain string, not an enum.** R6 existed because a fixed
   set of areas became the wrong answer repeated on every screen. Body would
   import that mistake at a smaller scale. A new type is a word typed into the
   log modal's chip; no deploy, no editor, no migration.
3. **Supplements are a new log kind, `intake`.** Not `workout` — the dashboard's
   Body tile counts `kind:'workout'`, so a creatine logged as a workout would
   make the morning screen read "30 workouts this month" and start lying. Not
   the existing `custom` kind either: `custom` is the junk drawer, and the first
   genuinely custom thing logged would land in the supplements row.
4. **No `habits` table.** `logs` is already append-only evidence. A second
   evidence store for "did I do the thing" is the drift the data model is
   arranged to prevent.
5. **No streaks.** A streak zeroes on a missed day, so it punishes a fact rather
   than reporting it, and it makes the number the thing you protect. `12 of the
last 30 days` is the same evidence without the lever, and the grid shows the
   gaps honestly. Artem was offered the streak explicitly and did not take it.
6. **Weight gets a line, not a bar.** A bar needs a start, and the start is the
   number §1 forbids inventing. `goals.startValue` (option C in brainstorming)
   stays available later as one optional field if the line proves unsatisfying;
   it is not built now.
7. **An area is a language because it says so.** `areas.track` — the flag chosen
   over deriving tabs from session logs (which would need an exclusion list for
   `work`, i.e. the hardcoded list back through the side door, and would give a
   newly-started language no screen to arrive at) and over a `languages` table
   (whose only non-config field, the current level, cannot live there: a level
   is state over time and belongs in `stateSnapshots`, and storing it twice is
   the first thing to drift).
8. **Body may use `--state-warn` / `--state-good`.** §3's "no red on the morning
   screen" governs the dashboard. Body is not the dashboard, and a weight moving
   away from its target is a state, not a quantity being graded (§3d.3).
9. **`stateHistory` is source 2 read as a series, and its limits are written
   down.** See §6.

---

## 4. Schema (`convex/schema.ts`)

| change               | detail                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logKind`            | gains one literal: **`intake`**                                                                                                                                                     |
| `logs.meta.category` | **no schema change** — the field exists. It starts being written: workout type (`gym`, `run`, `boxing`, `stretch`), intake type (`supplements`), session type (`class`, `practice`) |
| `logs.create`        | gains a `category: v.optional(v.string())` argument. **The mutation does not accept `meta` at all today** — this is a real addition, not a pass-through                             |
| `areas`              | gains `track: v.optional(v.literal('language'))`                                                                                                                                    |
| `stateSnapshots`     | **no change.** CEFR keys become `cefr_level:<slug>`, which leaves `by_owner_key_time` exactly as it is                                                                              |

`meta.category` is kept nested rather than promoted to a top-level `logs.category`
because it already exists and nothing reads it — promoting it would be a
migration bought for nothing. No index is added: the queries that read it are
already bounded by an owner-and-time index and filter in memory, exactly as
`monthCounts()` does.

`track` is named generally and valued narrowly, so a future "this area appears on
Body" is one more literal rather than a second field.

---

## 5. Capture (`src/lib/capture-parser.ts`, `src/components/shell/QuickCapture.tsx`)

**Existing verbs gain a category:** `gym`/`workout` → `gym`, `run` → `run`,
`boxing` → `boxing`, `pt`/`portuguese` → `class`.

**Three new verbs:**

| verb                   | writes                                                              | notes                            |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------- |
| `stretch`              | `workout`, area `body`, category `stretch`, minutes optional        | §3 promised it; it never existed |
| `supp` / `supplements` | `intake`, area `body`, category `supplements`, **no amount**        | one word + Enter                 |
| `practice`             | `session`, area `portuguese`, category `practice`, minutes optional | the solo counterpart to `pt`     |

**The confirm modal gains an editable category chip**, pre-filled by the verb,
offering the categories already present in his own rows as he types. This is the
mechanism by which a new type is added without a deploy. The chip must not slow
the three-second path: `gym` + Enter writes category `gym` without the chip ever
being touched (`CLAUDE.md`, "Speed of daily use").

**Known rough edge, recorded on purpose.** R6 decision 3 fixes a verb's area in
code, so `practice` files under `portuguese`. When Artem adds English,
`practice 40` lands on Portuguese and he taps the area chip to move it — one
extra tap for the second language. This is left deliberately unsolved: he asked
to feel it before anything cleverer is designed, and he said he expects to change
things after testing.

---

## 6. Numbers, and the source of each (`convex/aggregate.ts` only)

Components read these; they never compute them (`CLAUDE.md`).

| number on screen                                  | source                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `gym · 12 of the last 30 days`                    | 1 — log count, filtered by kind + category                                                                |
| each square in the grid                           | 1 — the same rows, bucketed by local day                                                                  |
| `9 classes · 14 practices this month`             | 1                                                                                                         |
| minutes this month against a goal's `targetValue` | 1, over a real denominator                                                                                |
| `75.4 kg`, `B1`                                   | 2 — latest snapshot for a key                                                                             |
| `3.4 to go`                                       | target − latest: composition of two sanctioned values, the shape §1 already permits for `holding × price` |

**Three additions, all inside `aggregate.ts`:**

- `dayCounts({ kind, area?, category?, start, end })` → one count per local day.
  Boundaries arrive as arguments, as they do for months and weeks: the server
  does not know what day it is where you are.
- `kindCount` gains an optional `category` argument.
- `stateHistory({ key, start, end })` → the stored snapshot rows for a key, in
  time order.

**`stateHistory` and the limits of source 2.** §1 defines source 2 as _the
latest_ `stateSnapshots` row for a key; the weight line plots all of them. This
is the same source read as a series, not a fifth source, and it is allowed on
these written terms — to be added to §1 beside the source-4 conditions:

> A state read as a series plots the stored rows and nothing between them. No
> smoothing, no interpolation across a gap, no trend line, no projection. A dot
> where a value was recorded, a straight segment between consecutive dots, and a
> target drawn as a flat line. A curve through two weigh-ins three weeks apart
> claims a path that was never measured.

`STATE_KEYS` in `aggregate.ts` is currently the tuple `['cefr_level', 'weight',
'net_worth']` and types `currentState`'s fixed shape. With per-language CEFR keys
that tuple can no longer enumerate every key; `currentState` keeps its fixed
three-field shape (§7) and the language key is resolved separately.

**`monthCounts()` is not touched.** Six tiles, a fixed shape, not derived from
the areas list and not derived from the categories list. A task that edits its
`TILE_KINDS` map has gone wrong. The Body tile keeps counting `kind:'workout'`,
which is what makes `intake` safe.

---

## 7. Body page (`src/routes/_app/body.tsx`) — PR R6b-a

**CONSISTENCY** — one row per category actually present among his `workout` and
`intake` logs (`gym`, `stretch`, `boxing`, `run`, `supplements`; a `weight` is
not an activity and is not a row here), twelve weeks of days as a grid, with
`12 of the last 30 days` beside each row. Categories are discovered from the
rows, so a type invented in the chip appears here with no code change. No
streaks.

**WEIGHT** — an inline SVG line of the stored snapshots, the target drawn flat
from a `body` goal carrying a `targetValue` in kg, and above it
`75.4 kg · 3.4 to go · 2 days ago`. `--state-warn` when the latest move went away
from the target, `--state-good` when it went toward it. No bar, and where no body goal carries a
`targetValue` there is no target line and no `to go` — the weight and its date
stand alone.

**RECENT** — the log list, values editable where they are shown (20 Sep,
`logs.setValue`; a weight still refuses, because editing the log would leave the
shown weight contradicting its own evidence).

**Empty states are the deliverable, not an afterthought.** Each of the three
sections gets the screen Artem will actually see on day one. Nothing is seeded,
and anything created while checking in the browser is deleted before the commit.

**`DayStrip`** is a new component (`src/components/track/DayStrip.tsx`), not an
extraction. The spec first proposed generalising `CommitHeatmap`; reading it
showed why that does not work — it is a 7×53-week year grid welded to the
`projectActivity` query, and `CommitStrip` draws bar heights from counts, which
says nothing about a supplement that is either taken or not. Body needs twelve
weeks, one row per category, filled or empty. Both commit components are left
untouched. Its rules are borrowed rather than its code: tones in steps rather
than a gradient, because a gradient invites reading a shade back as a number;
colour from the area, never from a rank or a recency.

**No new dependency.** There is no chart library in `package.json` and this adds
none: a polyline and some ticks.

---

## 8. Languages page (`src/routes/_app/languages.tsx`) — PR R6b-b

**Tabs** are the areas flagged `track: 'language'`, in `areas.order`. Portuguese
is ticked as part of the migration that introduces the flag — it is the area the
nav item already wears and the one his existing sessions are filed under.
Inventing English is: add the area in Settings, tick "language".

**Each tab:**

- **CLASSES this month** — `session` logs, that area, category `class`.
- **PRACTICE this month** — the same with category `practice`.
- **NEXT** — upcoming `events` filed under that area. A log is evidence that
  something happened, so nothing in `logs` can show next Tuesday; the calendar is
  the only honest source for a future thing. If he does not book classes there
  the strip is empty **and says why**, rather than being hidden.
- **LEVEL** — the latest `cefr_level:<slug>` snapshot with when it was recorded,
  and the target from a goal filed under that area carrying a `targetLabel`
  ("B2"). Words, not a bar: CEFR levels are not a scale anything may be divided
  by.
- **The grid** — `DayGrid`, classes and practice as two rows.
- **RECENT sessions.**

**With no area flagged**, the page says to tick one in Settings and links there.

**Settings** — the R6 areas editor (`src/components/settings/Areas.tsx`) gains
the tick per row. It is the only new control in R6b-b.

**The CEFR migration.** Existing rows keyed `cefr_level` are rewritten to
`cefr_level:portuguese` by a one-time mutation in `convex/state.ts`, owner-scoped
through `by_owner_key_time`, idempotent, and covered by a test. `state.record`
needs no change — `key` is already `v.string()`.

---

## 9. Dashboard

**One change:** the Languages cell in CURRENT STATE reads the most recent
`cefr_level:*` row and names its language — `B1 · Portuguese · 3 days ago`.
Latest row wins, exactly as it does today; it simply stops pretending there is
only one language. `currentState` keeps its fixed three-field shape, so a cell
cannot appear or vanish as a side effect of logging something.

Nothing else on the dashboard changes. The Body tile still counts
`kind:'workout'`; supplements cannot inflate it.

---

## 10. Deliberately out of scope

- **Finances** — its own spec, with the source question first.
- **Vocabulary, and notes filed under a language** — that is R4, where `notes`
  gains an `area`. A vocabulary store built here would be a second knowledge base
  beside Notes, and R4 is the row that makes Notes _the_ knowledge base. When R4
  lands, a language tab picks it up as one query and no new table.
- **Streaks**, a `habits` table, a weight bar, `goals.startValue`.
- **Retro-categorising old workouts** beyond one tap out of Other.
- **A cleverer multi-language `practice` verb** — see §5.

---

## 11. Testing

Per the repo's rule: **no DOM tests.** `src/lib/*` and `convex/*` are tested;
components are verified in the browser.

- `convex/aggregate.test.ts` — `dayCounts` (bucketing, boundaries, category
  filter), `kindCount` with a category, `stateHistory` (order, range). Owner
  isolation on **one** backend: `const t = convexTest(schema, modules)` then
  `t.withIdentity(...)` twice — two `convexTest()` calls are two databases and
  prove nothing.
- `convex/logs.test.ts` — `create` writes `meta.category`; `intake` is accepted;
  `task_done` and `note` stay refused.
- `convex/state.test.ts` — the CEFR migration: rewrites, is idempotent, and does
  not touch another owner's rows.
- `src/lib/capture-parser.test.ts` — the three new verbs, the categories the
  existing ones now set, and that `supp` takes no amount.
- Browser verification per page, including every empty state.

Each task closes with `pnpm typecheck && pnpm lint && pnpm test`, then a commit
with a real message.

---

## 12. Done when

- `gym`, then `stretch`, then `supp` — three logs in under ten seconds total —
  and Body's CONSISTENCY section shows three rows with today filled in.
- A weight logged twice a week apart draws two dots and a straight segment, with
  `3.4 to go` against a body goal's target, and no line where he has not weighed
  himself.
- An area invented as "English" and ticked as a language becomes a second tab,
  with its own empty states, without a deploy.
- The dashboard Body tile is unchanged by a month of supplements.
