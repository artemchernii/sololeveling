# SOLO LEVELING — Build Plan

Personal operating system. "I am the project."
Loop: GOAL → PROJECT → TASK → SCHEDULE → ACTION → RESULT → REVIEW → ADJUST.

Non-negotiables: reality over gamification · counts and real units, never 0–100 scores ·
progress bars only when an explicit target exists · **everything is created by the user, never seeded** ·
**the day holds three quests, not thirty** · daily-use speed.

---

## 1. Architecture

**Stack (deliberately different from Oreum's Next+Supabase):**

- **TanStack Start** (Vite, React 19, file-based routes, SSR + server functions) · TS · Tailwind v4 · shadcn/ui · lucide
- **Convex** — DB + backend functions + realtime. Schema in TS, no migrations, no SQL.
- **Clerk** — auth (Google one-tap), wired via `ConvexProviderWithClerk`. Multi-tenant from day one: every row carries `ownerId` (see §2).
- `date-fns` + `rrule` (client-side expansion) · `cmdk` for ⌘K quick capture
- Deploy: Convex Cloud (backend) + **Cloudflare Workers** for the Start app via `@cloudflare/vite-plugin`
  (official TanStack partner, free tier, one `wrangler.jsonc`). Fallback: Netlify with `@netlify/vite-plugin-tanstack-start`. PWA manifest.

Why this fits: Convex queries are reactive → log a workout on the phone, dashboard on the desktop
updates instantly, zero code. Start's SSR is not needed for the data (Convex is client-driven) but
gives a fast first paint on mobile and a place for server functions later (cron digests, imports).

**Structure**

```
/src
  routes/           TanStack file routes
    __root.tsx  _app.tsx (authed shell, Clerk guard in beforeLoad)  _app/dashboard.tsx  _app/quests.tsx
    _app/calendar.tsx  _app/goals.tsx  _app/projects.$id.tsx
    _app/{money,body,social,portuguese,career,style}.tsx   (phase 7+, empty)
    _app/{notes,principles,reviews,settings}.tsx  login.tsx
  components/
    shell/      TopBar, SideNav, MobileNav, QuickCapture (⌘K)
    dashboard/  TodayCard, ChainsCard, StateStrip, ActionsLogged, QuestList
    ui/         shadcn
  lib/          capture-parser.ts, recurrence.ts, format.ts
/convex
  schema.ts
  tasks.ts projects.ts goals.ts logs.ts state.ts events.ts notes.ts reviews.ts
  auth.ts        -- requireUser(ctx) -> ownerId; called first in every mutation and query
  aggregate.ts   -- monthCounts(), currentState(), entityCounts()  (the only number sources)
  seed.ts        -- internal mutation: principles only. Nothing else is ever seeded.
  auth.config.ts
```

**Key rule — every number on screen comes from exactly one of three sanctioned sources:**

1. **log count** — aggregate over `logs` for a period (12 workouts this month, 2 events this month)
2. **state** — latest `stateSnapshots` row for a key (weight 75.4 kg, net worth €42,100, CEFR B1)
3. **entity count** — rows in `projects` / `tasks` matching a filter (2 active projects, 11 of 17 tasks)

All three live in `convex/aggregate.ts` and nowhere else. There is no fourth source, and none of the
three can produce a score, an index, or a percentage without an explicit `targetValue` to divide by.

---

## 2. Data model (`convex/schema.ts`)

**Every table carries `ownerId: v.string()`** (the Clerk `identity.tokenIdentifier`) and an
`by_owner…` index.
Every query and mutation filters by it. This is not for sharing — it is so that no query can
accidentally return everything, and so a second user costs nothing later.

```ts
const area = v.union(...literals('business','portuguese','body','money','social','career','style','knowledge','life'));
const projectStatus = literals('focus','active','paused','completed','archived');
const taskStatus = literals('open','done','skipped');
const logKind = literals('workout','weight','expense','transfer','session','conversation',
  'event','people_met','task_done','piece','note','idea','custom');

goals:     { ownerId, title, description?, area, status: 'active'|'done'|'dropped',
             targetLabel?,            // "B2", "€80,000", "profitable business"
             targetValue?: number, unit?,   // only when measurable
             deadline?: string }      // ISO date
           .index('by_owner_status', ['ownerId','status'])
projects:  { ownerId, goalId, title, description?, status: projectStatus, deadline? }
           .index('by_owner_status', ['ownerId','status'])   // one 'focus' per owner — setFocus enforces
tasks:     { ownerId, title, notes?, projectId?, goalId?, area?,
             dueDate?, scheduledAt?: number, durationMin?,
             rrule?,                  // recurring template; instances expanded on client
             priority: number, status: taskStatus, completedAt?: number,
             todayFor?: string }      // ISO date — set only when this task is one of today's three
           .index('by_owner_status', ['ownerId','status']).index('by_owner_today', ['ownerId','todayFor'])
           .index('by_project', ['projectId']).index('by_owner_due', ['ownerId','dueDate'])
events:    { ownerId, title, area?, projectId?, startsAt: number, endsAt: number, rrule?, notes? }
           .index('by_owner_start', ['ownerId','startsAt'])
logs:      { ownerId, kind: logKind, area, occurredAt: number,   // quick capture. append-only evidence.
             value?: number, unit?,   // 60 (min), 48 (eur), 75.4 (kg)
             text?,                   // "push day", "groceries"
             taskId?, projectId?,
             meta?: v.object({ reps: v.optional(v.number()), sets: v.optional(v.number()),
                               weightKg: v.optional(v.number()), category: v.optional(v.string()),
                               people: v.optional(v.number()) }) }
           .index('by_owner_time', ['ownerId','occurredAt']).index('by_owner_area_time', ['ownerId','area','occurredAt'])
stateSnapshots: { ownerId, area, key, value?: number, textValue?, unit?, recordedAt: number }
           .index('by_owner_key_time', ['ownerId','key','recordedAt'])
           // keys: weight, bench, net_worth, cefr_level, protein_avg, savings …
notes:     { ownerId, title, body, tags: string[], projectId?, goalId?, kind: 'note'|'idea'|'book'|'reference' }
principles:{ ownerId, text, sortOrder: number }
reviews:   { ownerId, period: 'daily'|'weekly'|'monthly', periodStart: string, closedAt?: number,
             answers: v.object({ didHappen: v.optional(v.string()),   // what I actually did
                                 movedForward: v.optional(v.string()),
                                 avoided: v.optional(v.string()),
                                 overthought: v.optional(v.string()),
                                 shouldChange: v.optional(v.string()) }),
             decision?: string }      // the one sentence "what changes next week"
```

**Derived, not stored:** level (= age, 32 — a joke that stays honest), "this month" counts,
project `done/total`, free hours today. All via `convex/aggregate.ts` queries — reactive for free.

**Mutation side-effects (Convex has no triggers — do it in the function):**
`tasks.complete` → also inserts `logs{kind:'task_done'}`. `logs.create` with kind `weight` → also inserts
`stateSnapshots{key:'weight'}`. `projects.setFocus` → demotes the previous focus to `active`.
`tasks.pickForToday` → rejects with `TODAY_FULL` if the owner already has three tasks with
`todayFor = today`. `tasks.complete` and `tasks.dropFromToday` clear the slot.

---

## 3. Layout (from the design exploration — final = 3a + 4a merged + chains)

**Shell (desktop ≥1024)**

- TopBar: ■ SOLO LEVELING · Search ⌘K · bell · ARTEM ▾
- SideNav grouped: **DO** Dashboard/Quests/Calendar/Goals/Projects · **TRACK** Money/Body/Social/
  Portuguese/Career/Style · **KNOW** Notes/Knowledge/Principles · Settings at bottom
- Persistent "Log something" button (top-right) → ⌘K palette: type `workout 60`, `spend 48 groceries`,
  `pt 30`, `weight 75.4`, `note …` → parsed into a `logs` row. Three seconds, no form.

**Dashboard** (in order)

1. `Good morning, ARTEM.` · `LEVEL 32 · CURRENT FOCUS · <focus project>`
2. Two columns: **TODAY** (events + scheduled tasks, "Three booked hours. The rest is yours.")
   | **CHAINS** (goal → focus project → done/total · next action; FOCUS/LIVE/IDLE tag)
3. **CURRENT STATE** — one compact strip, six cells, each labelled with its source:
   | cell       | value                          | source                                  |
   | ---------- | ------------------------------ | --------------------------------------- |
   | Portuguese | B1 · 2 of 4 sessions           | state `cefr_level` + log count          |
   | Body       | 75.4 kg · 3 workouts           | state `weight` + log count              |
   | Money      | €42,100 net worth              | state `net_worth`                       |
   | Social     | 2 events this month            | log count `kind:'event'`                |
   | Business   | 2 active projects · 1 in focus | entity count                            |
   | Career     | 6 of 8 skills logged           | state `skills_logged` / `skills_target` |
4. **THIS MONTH · ACTIONS LOGGED** — exactly these six tiles, in this order, each vs last month.
   `monthCounts()` returns this fixed shape; the grid is not driven by the `area` enum.

   | tile       | counts                   | source          |
   | ---------- | ------------------------ | --------------- |
   | Projects   | tasks shipped            | log `task_done` |
   | Portuguese | sessions logged          | log `session`   |
   | Body       | workouts done            | log `workout`   |
   | Money      | transfers to the floor   | log `transfer`  |
   | Style      | pieces bought or altered | log `piece`     |
   | Social     | events attended          | log `event`     |

   Career, Knowledge and Life have no tile: nothing about them is countable per-month yet.
   They still exist as `area` values for tagging tasks and notes. Nine areas, six tiles, on purpose.
   ("Counts of things you did. There is no score for Portuguese, and there never will be.")

5. **TODAY'S QUESTS** — at most three. Checklist, area tag, time/duration. When all three slots are
   full, the "add" affordance is replaced by the line _"Today is full. Finish one or drop one."_
   The dashboard never shows a backlog count — see §3c.

**Projects page** = chains grid (cards from design v2: title, `11 of 17 tasks`, `ends 30 Sep · 23 days`,
3 open tasks, `NEXT →`). "New chain" = goal + project in one form.

**Weekly review page** = "The week, as it actually went." KPI tiles · 12-week movement table
(rising/slipping + absolute delta) · one principle · **What changes next week** (one sentence) · Close the week.

**Backlog page** — the only place unpicked tasks live. A list with one action per row: _pick for today_
(disabled when today is full). Reachable from the nav, never surfaced on the dashboard.

**Mobile (<768)**: greeting+focus → Today (2 lines) → Today's quests (max 3) → This month (2×2) → sticky
"+ Log something" pill → bottom nav Today / Quests / Projects / Month / More. Rows 48–56px.

**Design system — Nocturne is the source of truth.** The Claude Design project ships
`_ds/nocturne-688ea808-.../styles.css` + `_ds_bundle.js`. Extract the **token layer only**
(colors, radii, spacing, type scale) into `src/styles/tokens.css` and map it in Tailwind v4's
`@theme`. Do not ship `_ds_bundle.js` components — shadcn/ui restyled with these tokens instead.
`Solo Leveling Wireframes.dc.html` is visual reference for rhythm and component anatomy;
where it disagrees with §3 above, §3 wins.

**Visual:** near-black ground, frosted panels, one lavender accent used only for live things,
mono caps for labels, big light numerals. No bars without a target. No emoji.

---

## 3b. Five settled decisions

1. **Completing a workout task ≠ a workout.** `tasks.complete` writes `logs{kind:'task_done'}` only.
   A real workout is `logs{kind:'workout'}`. If the completed task has `area:'body'` (or `'portuguese'`),
   the checklist shows a one-tap follow-up — "log as workout?" / "log as session?" — which writes the
   second row. Explicit, never automatic. Intent and evidence stay separate.
2. **Nocturne tokens are the source of truth**, wireframe glass is reference. See §3 Design system.
3. **Events and tasks are two tables.** TASK ≠ EVENT. Merge them only in the UI via a
   `TimelineItem = {id, source:'task'|'event', title, startsAt, durationMin, area}` mapper used by
   Calendar and the dashboard TODAY card.
4. **Clerk stays, and the schema is multi-tenant from day one.** `ConvexProviderWithClerk` + a JWT
   template named `convex`. A shared `requireUser(ctx)` helper in `convex/auth.ts` returns
   `identity.tokenIdentifier` as `ownerId`; every mutation and query calls it first and scopes by it.
   Not `identity.subject`: Convex guarantees the token identifier is unique across providers, where a
   bare subject only happens to be unique while there is one. The value is opaque by contract, so it
   is read from the public `auth.whoami` query — shown on /settings — never assembled by hand.
   No `OWNER_ID` env var, no single-user shortcut — retrofitting ownership later is a day of work
   and a good way to leak your own net worth to a friend.
5. **Nothing is seeded except principles.** The six lines, in order, from the source brief §16:
   `DON'T PERFORM. PARTICIPATE.` · `I DON'T CHASE INTEREST. I NOTICE IT.` · `I CHOOSE TOO.` ·
   `I AM ALLOWED TO BE IMPERFECT.` · `ACTION > OVERTHINKING.` · `BUILD > CONSUME.`
   `seed.ts` is an internal mutation taking `ownerId` as an argument — it has no identity to read:
   `npx convex run seed:run '{"ownerId":"<the value on /settings>"}'`, with `seed:clear` as its
   counterpart. No auto-seed on first sign-in.
   Beyond these six rows: Goals, chains and tasks are created through the UI,
   because creating them is the product. `seed.ts` inserts the six principle lines and stops.

## 3c. Three limits that keep it usable

The failure mode of a personal OS is not too few features — it is a list long enough to feel like
debt. Three constraints are enforced in the data layer, not suggested in the UI:

1. **Three quests a day, hard.** `tasks.pickForToday` throws `TODAY_FULL` on the fourth. Everything
   else waits in the backlog. Choosing three is the planning ritual; there is no other one.
2. **One focus chain.** Already enforced by `projects.setFocus`. Non-focus chains render as title +
   next action only — no task lists, no counts competing for attention.
3. **The backlog is never on the dashboard.** No "47 open tasks" anywhere on the morning screen.
   That number is the one that makes people close the app. It lives on its own page or nowhere.

## 4. Phases

| #   | Deliverable                                                                                                                                                       | Done when                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0   | Scaffold: TanStack Start + Cloudflare plugin + Tailwind + shadcn, Nocturne tokens imported, Convex init, Clerk auth, shell, empty routes, CLAUDE.md, first deploy | Logged in, nav visible, live on `*.workers.dev`        |
| 1   | `schema.ts` with `ownerId` everywhere, `auth.ts` `requireUser`, `seed.ts` (principles only)                                                                       | Typed schema deployed; DB otherwise empty on purpose   |
| 2   | **Quick capture (⌘K) + Quests**: create a task, pick up to 3 for today, complete, log an action, backlog page                                                     | I run one real day on it with data I created myself    |
| 3   | **Goals + Chains**: create a goal, create a project under it, attach tasks, set focus                                                                             | I can build a chain end to end without touching the DB |
| 4   | **Dashboard**: aggregate layer + today / chains / current state / month tiles                                                                                     | Morning screen is true, built only from what I entered |
| 5   | Calendar (week view, rrule expansion, events + scheduled tasks)                                                                                                   | Recurring gym/PT/review show up                        |
| 6   | Weekly review + Notes + Principles + mobile pass + PWA                                                                                                            | I close a week on my phone                             |
| 7+  | Money, Body, Portuguese, Social, Career, Style detail pages — one per sprint                                                                                      | —                                                      |

**Why the dashboard is fourth, not second:** it only reads. With nothing seeded, a dashboard built
early renders six empty tiles and proves nothing. Build the ways in first, use them for a few days,
then build the screen that reflects them back.

Each phase = one branch, one PR, one commit message per meaningful step. Ship 0–4 before touching 5+.

---

## 5. Prompt for Claude Code

Save this file as `PLAN.md` in the repo root, `git init`, then paste the block below as the first message.

```
You are building SOLO LEVELING, a single-user personal operating system for me (Artem).
Read PLAN.md fully before doing anything. It is the spec; this message is the operating agreement.

FIRST, before Phase 0 code:
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import:
https://claude.ai/design/p/f75af0ae-d7c3-464f-9d77-3eb77e604a19?file=Solo+Leveling+Wireframes.dc.html
Read: `Solo Leveling Wireframes.dc.html`, `_ds/nocturne-688ea808-7cad-46e7-bf90-42a9c6bb4f3a/styles.css`,
`_ds/nocturne-688ea808-7cad-46e7-bf90-42a9c6bb4f3a/_ds_bundle.js`, `support.js`.
Extract the TOKEN LAYER ONLY from Nocturne (colors, radii, spacing, type scale, shadows) into
src/styles/tokens.css as CSS custom properties, and map them in Tailwind v4's @theme block.
Do NOT copy _ds_bundle.js components into the app — we use shadcn/ui restyled with these tokens.
Treat the wireframe as visual reference for rhythm and component anatomy only; where it disagrees
with PLAN.md §3, PLAN.md wins.

Ground rules — copy these verbatim into CLAUDE.md so you re-read them every session:
- Reality over gamification. Never render a 0-100 score, XP, streak, or arbitrary percentage.
  Every number on screen comes from one of exactly three sources (PLAN.md §1): a log count over a
  period, the latest stateSnapshots row for a key, or an entity count over projects/tasks. All three
  live in convex/aggregate.ts; components never compute numbers. Progress bars only where an explicit
  targetValue exists. If you catch yourself inventing a metric, stop and ask me.
- monthCounts() returns the fixed six-tile shape in PLAN.md §3 item 4 — it is not derived from the
  `area` enum. Nine areas, six tiles, deliberately.
- Completing a task is not the same as doing the thing. `tasks.complete` writes only
  logs{kind:'task_done'}. Real activity (workout, session, expense, weight) is a separate log the
  user confirms with one tap. Never auto-derive one from the other.
- Three quests a day is a hard limit enforced in tasks.pickForToday, not a UI hint. The backlog
  never appears on the dashboard and no screen shows a total count of open tasks. If a design would
  surface "N tasks remaining" on the morning screen, don't build it — ask me.
- Tasks and events are two tables and stay that way. They merge only in the UI through a
  TimelineItem mapper. A task must be creatable with a title and nothing else.
- Nocturne tokens are the design source of truth. No hardcoded hex, no gradients, no emoji,
  one lavender accent reserved for live/focus things, mono-caps for labels, big light numerals.
- Speed of daily use beats completeness. Quick capture (Cmd-K) must log something in under three
  seconds: `workout 60`, `spend 48 groceries`, `pt 30`, `weight 75.4`, `note ...`.
- Stack is fixed (PLAN.md §1): TanStack Start, Convex, Clerk, Tailwind v4, shadcn/ui, deployed to
  Cloudflare Workers. Adding any other dependency requires a one-line justification first.
- Nothing is seeded except principles. Every goal, chain and task must be creatable through the UI;
  creating them is the product. Never write fixture data to make a screen look populated — if a
  screen has nothing to show, build its empty state.
- Scope: phases 0-4 only for now, in that order (capture and creation before the dashboard).
  Money/Body/Portuguese/Social/Career/Style get an empty route and nothing else. Do not build ahead.

Data and auth conventions:
- All data access through Convex useQuery/useMutation on the client. No TanStack Start server
  functions for data — Convex reactivity is the point. Server functions only for things Convex
  cannot do, and only when I ask.
- convex/schema.ts validators are the single source of truth. Import Doc<'tasks'>, Id<'projects'>;
  never hand-write DB types.
- Every table has ownerId: v.string() and an owner-scoped index. Every mutation and query starts
  with requireUser(ctx) from convex/auth.ts, which returns the Clerk identity.tokenIdentifier, and
  filters by it using an index — never .filter() over a full table scan. There is no OWNER_ID env var.
  A query that could return another user's row is a bug, even while there is only one user.
- Aggregations live only in convex/aggregate.ts, exposing three shapes: monthCounts(),
  currentState() and entityCounts(). Components never compute numbers themselves.
- No v.any() anywhere in schema.ts. If a field's shape is unknown, ask me rather than reaching for it.

Working style:
- One phase at a time. Before each phase, list the files you will create or modify in 10 lines or
  fewer, then wait for my OK. Do not start coding on the same turn.
- After each phase: run typecheck and lint, summarize in 5 lines or fewer, and tell me the single
  thing to verify manually. Commit with a real message; one commit per meaningful step.
- Ask me instead of guessing when: PLAN.md is ambiguous, a UI element has no source in the data
  model, or a design decision would add a metric that is not a count or a state value.

Start with the Nocturne import, then give me your Phase 0 file plan and any questions.
```

**Before you paste, have ready:**

- Convex project (`npx convex dev` creates it on first run)
- Clerk app with a JWT template named `convex` — publishable key in `.env.local`, issuer URL in the
  Convex dashboard as `CLERK_JWT_ISSUER_DOMAIN` (set per deployment: dev and prod separately)
- Cloudflare account, `wrangler login`
