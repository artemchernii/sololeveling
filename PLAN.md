# SOLO LEVELING — Build Plan

Personal operating system for one user. "I am the project."
Loop: GOAL → PROJECT → TASK → SCHEDULE → ACTION → RESULT → REVIEW → ADJUST.

Non-negotiables: reality over gamification · counts and real units, never 0–100 scores ·
progress bars only when an explicit target exists · one user · daily-use speed.

---

## 1. Architecture

**Stack (deliberately different from Oreum's Next+Supabase):**
- **TanStack Start** (Vite, React 19, file-based routes, SSR + server functions) · TS · Tailwind v4 · shadcn/ui · lucide
- **Convex** — DB + backend functions + realtime. Schema in TS, no migrations, no SQL.
- **Clerk** — auth (Google one-tap), wired via `ConvexProviderWithClerk`. Single user: mutations reject any `identity.subject` ≠ `OWNER_ID` env.
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
  auth.ts        -- requireOwner(ctx) helper, called by every mutation/private query
  aggregate.ts   -- monthCounts(), currentState(), entityCounts()  (the only number sources)
  seed.ts        -- internal mutation, my real data
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

```ts
const area = v.union(...literals('business','portuguese','body','money','social','career','style','knowledge','life'));
const projectStatus = literals('focus','active','paused','completed','archived');
const taskStatus = literals('open','done','skipped');
const logKind = literals('workout','weight','expense','transfer','session','conversation',
  'event','people_met','task_done','piece','note','idea','custom');

goals:     { title, description?, area, status: 'active'|'done'|'dropped',
             targetLabel?,            // "B2", "€80,000", "profitable business"
             targetValue?: number, unit?,   // only when measurable
             deadline?: string }      // ISO date
projects:  { goalId, title, description?, status: projectStatus, deadline? }
           .index('by_status', ['status'])     // exactly one 'focus' — enforced in setFocus mutation
tasks:     { title, notes?, projectId?, goalId?, area?,
             dueDate?, scheduledAt?: number, durationMin?,
             rrule?,                  // recurring template; instances expanded on client
             priority: number, status: taskStatus, completedAt?: number }
           .index('by_status', ['status']).index('by_project', ['projectId']).index('by_due', ['dueDate'])
events:    { title, area?, projectId?, startsAt: number, endsAt: number, rrule?, notes? }
           .index('by_start', ['startsAt'])
logs:      { kind: logKind, area, occurredAt: number,     // quick capture. append-only evidence.
             value?: number, unit?,   // 60 (min), 48 (eur), 75.4 (kg)
             text?,                   // "push day", "groceries"
             taskId?, projectId?,
             meta?: v.object({ reps: v.optional(v.number()), sets: v.optional(v.number()),
                               weightKg: v.optional(v.number()), category: v.optional(v.string()),
                               people: v.optional(v.number()) }) }
           .index('by_time', ['occurredAt']).index('by_area_time', ['area','occurredAt'])
stateSnapshots: { area, key, value?: number, textValue?, unit?, recordedAt: number }
           .index('by_key_time', ['key','recordedAt'])
           // keys: weight, bench, net_worth, cefr_level, protein_avg, savings …
notes:     { title, body, tags: string[], projectId?, goalId?, kind: 'note'|'idea'|'book'|'reference' }
principles:{ text, sortOrder: number }
reviews:   { period: 'daily'|'weekly'|'monthly', periodStart: string, closedAt?: number,
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
   | cell | value | source |
   |---|---|---|
   | Portuguese | B1 · 2 of 4 sessions | state `cefr_level` + log count |
   | Body | 75.4 kg · 3 workouts | state `weight` + log count |
   | Money | €42,100 net worth | state `net_worth` |
   | Social | 2 events this month | log count `kind:'event'` |
   | Business | 2 active projects · 1 in focus | entity count |
   | Career | 6 of 8 skills logged | state `skills_logged` / `skills_target` |
4. **THIS MONTH · ACTIONS LOGGED** — exactly these six tiles, in this order, each vs last month.
   `monthCounts()` returns this fixed shape; the grid is not driven by the `area` enum.
   | tile | counts | source |
   |---|---|---|
   | Projects | tasks shipped | log `task_done` |
   | Portuguese | sessions logged | log `session` |
   | Body | workouts done | log `workout` |
   | Money | transfers to the floor | log `transfer` |
   | Style | pieces bought or altered | log `piece` |
   | Social | events attended | log `event` |

   Career, Knowledge and Life have no tile: nothing about them is countable per-month yet.
   They still exist as `area` values for tagging tasks and notes. Nine areas, six tiles, on purpose.
   ("Counts of things you did. There is no score for Portuguese, and there never will be.")
5. **TODAY'S QUESTS** — checklist, area tag, time/duration

**Projects page** = chains grid (cards from design v2: title, `11 of 17 tasks`, `ends 30 Sep · 23 days`,
3 open tasks, `NEXT →`). "New chain" = goal + project in one form.

**Weekly review page** = "The week, as it actually went." KPI tiles · 12-week movement table
(rising/slipping + absolute delta) · one principle · **What changes next week** (one sentence) · Close the week.

**Mobile (<768)**: greeting+focus → Today (2 lines) → Today's quests → This month (2×2) → sticky
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

## 3b. Four settled decisions

1. **Completing a workout task ≠ a workout.** `tasks.complete` writes `logs{kind:'task_done'}` only.
   A real workout is `logs{kind:'workout'}`. If the completed task has `area:'body'` (or `'portuguese'`),
   the checklist shows a one-tap follow-up — "log as workout?" / "log as session?" — which writes the
   second row. Explicit, never automatic. Intent and evidence stay separate.
2. **Nocturne tokens are the source of truth**, wireframe glass is reference. See §3 Design system.
3. **Events and tasks are two tables.** TASK ≠ EVENT. Merge them only in the UI via a
   `TimelineItem = {id, source:'task'|'event', title, startsAt, durationMin, area}` mapper used by
   Calendar and the dashboard TODAY card.
4. **Clerk stays.** `ConvexProviderWithClerk` + a JWT template named `convex`. Single-user protection
   is not the provider's job: a shared `requireOwner(ctx)` helper in `convex/auth.ts` asserts
   `identity.subject === process.env.OWNER_ID` at the top of every mutation and non-public query.

## 4. Phases

| # | Deliverable | Done when |
|---|---|---|
| 0 | Scaffold: TanStack Start + Cloudflare plugin + Tailwind + shadcn, Nocturne tokens imported, Convex init, Clerk auth, shell, empty routes, CLAUDE.md, first deploy | Logged in, nav visible, live on `*.workers.dev` |
| 1 | `schema.ts` + `seed.ts` (my real goals/projects/tasks/principles) | `npx convex run seed:run` gives a populated DB |
| 2 | Dashboard with real queries + aggregate layer | Morning screen matches layout §3 with seed data |
| 3 | Quests page + Quick capture (⌘K parser + logs mutation) + task_done side-effect | I run a day on it |
| 4 | Goals + Projects (chains) pages, focus switching | Chains grid works, one focus enforced |
| 5 | Calendar (week view, rrule expansion, events + scheduled tasks) | Recurring gym/PT/review show up |
| 6 | Weekly review + Notes + Principles + mobile pass + PWA | I close a week on my phone |
| 7+ | Money, Body, Portuguese, Social, Career, Style detail pages — one per sprint | — |

Each phase = one branch, one PR, one commit message per meaningful step. Ship 0–3 before touching 4+.

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
- Tasks and events are two tables and stay that way. They merge only in the UI through a
  TimelineItem mapper. A task must be creatable with a title and nothing else.
- Nocturne tokens are the design source of truth. No hardcoded hex, no gradients, no emoji,
  one lavender accent reserved for live/focus things, mono-caps for labels, big light numerals.
- Speed of daily use beats completeness. Quick capture (Cmd-K) must log something in under three
  seconds: `workout 60`, `spend 48 groceries`, `pt 30`, `weight 75.4`, `note ...`.
- Stack is fixed (PLAN.md §1): TanStack Start, Convex, Clerk, Tailwind v4, shadcn/ui, deployed to
  Cloudflare Workers. Adding any other dependency requires a one-line justification first.
- Scope: phases 0-3 only for now. Money/Body/Portuguese/Social/Career/Style get an empty route and
  nothing else. Do not build ahead.

Data and auth conventions:
- All data access through Convex useQuery/useMutation on the client. No TanStack Start server
  functions for data — Convex reactivity is the point. Server functions only for things Convex
  cannot do, and only when I ask.
- convex/schema.ts validators are the single source of truth. Import Doc<'tasks'>, Id<'projects'>;
  never hand-write DB types.
- Every mutation and every non-public query starts with a shared requireOwner(ctx) helper in
  convex/auth.ts asserting identity.subject === process.env.OWNER_ID.
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
- Clerk app with a JWT template named `convex` — publishable key + issuer URL in `.env.local`
- Cloudflare account, `wrangler login`
- After your first login: copy your Clerk user id into `OWNER_ID` (`.env.local` + `wrangler secret put`)
