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
  aggregate.ts   -- monthCounts(), currentState()  (the only two number sources)
  seed.ts        -- internal mutation, my real data
  auth.config.ts
```

**Key rule:** every number on screen comes from one of two sources:
- **count** = aggregate over `logs` for a period (e.g. 12 workouts this month)
- **state** = latest row in `state_snapshots` for a key (e.g. weight 75.4 kg, net worth €42,100)
No third source. No computed "scores".

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
             taskId?, projectId?, meta?: v.any() }
           .index('by_time', ['occurredAt']).index('by_area_time', ['area','occurredAt'])
stateSnapshots: { area, key, value?: number, textValue?, unit?, recordedAt: number }
           .index('by_key_time', ['key','recordedAt'])
           // keys: weight, bench, net_worth, cefr_level, protein_avg, savings …
notes:     { title, body, tags: string[], projectId?, goalId?, kind: 'note'|'idea'|'book'|'reference' }
principles:{ text, sortOrder: number }
reviews:   { period: 'daily'|'weekly'|'monthly', periodStart: string, answers: v.any(), decision?, closedAt?: number }
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
3. **CURRENT STATE** — one compact strip: Portuguese B1 · Body 75.4 kg · Money €42,100 · Social 2 events · Business 2 projects
4. **THIS MONTH · ACTIONS LOGGED** — 6 tiles, each count vs last month
   ("Counts of things you did. There is no score for Portuguese, and there never will be.")
5. **TODAY'S QUESTS** — checklist, area tag, time/duration

**Projects page** = chains grid (cards from design v2: title, `11 of 17 tasks`, `ends 30 Sep · 23 days`,
3 open tasks, `NEXT →`). "New chain" = goal + project in one form.

**Weekly review page** = "The week, as it actually went." KPI tiles · 12-week movement table
(rising/slipping + absolute delta) · one principle · **What changes next week** (one sentence) · Close the week.

**Mobile (<768)**: greeting+focus → Today (2 lines) → Today's quests → This month (2×2) → sticky
"+ Log something" pill → bottom nav Today / Quests / Projects / Month / More. Rows 48–56px.

**Visual:** near-black ground, frosted panels, one lavender accent used only for live things,
mono caps for labels, big light numerals. No bars without a target. No emoji.

---

## 4. Phases

| # | Deliverable | Done when |
|---|---|---|
| 0 | Scaffold: TanStack Start + Cloudflare plugin + Tailwind + shadcn, Convex init, Clerk auth, shell, empty routes, CLAUDE.md, first deploy | Logged in, nav visible, live on `*.workers.dev` |
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

Paste this as the first message in the repo (after `git init`), with this file saved as `PLAN.md`.

```
You are building SOLO LEVELING, a single-user personal operating system. Read PLAN.md fully before doing anything.

Ground rules (also write them into CLAUDE.md so you re-read them every session):
- Reality over gamification. Never render a 0–100 score, XP, streak, or percentage unless PLAN.md §2 says the entity has a numeric target. Every number is either a count over `logs` or the latest `state_snapshots` row. If you find yourself inventing a metric, stop and ask.
- Speed of daily use beats completeness. Quick capture must work in ≤3 keystrokes + text.
- Stack is fixed (PLAN.md §1): TanStack Start, Convex, Clerk, Tailwind, shadcn, deploy to Cloudflare Workers. Don't add libraries without saying why in one line.
- Follow the visual language in PLAN.md §3. Dark, minimal, one lavender accent, mono-caps labels, no emoji, no gradients.
- Keep MVP scope: phases 0–3 first. Do not scaffold Money/Body/etc. pages beyond an empty route.

Working style:
- Work one phase at a time. Before each phase, list the files you'll create/modify in ≤10 lines and wait for my OK.
- After each phase: run typecheck + lint, summarize what's done in ≤5 lines, tell me the one thing to verify manually.
- All data access through Convex `useQuery`/`useMutation` on the client; no Start server functions for data (keep Convex reactive). Server functions only for things Convex can't do (later).
- Validators in `schema.ts` are the single source of truth; import `Doc<'tasks'>` etc., never hand-write DB types.
- Every mutation checks `ctx.auth.getUserIdentity()?.subject === process.env.OWNER_ID` via a shared helper.
- Ask me, don't guess, when: a field in PLAN.md is ambiguous, a query would need a "score", or a UI element has no source in the data model.

Start now with Phase 0. First reply: your file plan for Phase 0 and any questions.
```

**Before you paste:** create the Convex project (`npx convex dev` on first run), a Clerk app with a
JWT template named `convex`, and a Cloudflare account (`wrangler login`); put keys in `.env.local` and
`wrangler secret`. Set `OWNER_ID` to your Clerk user id after first login.
