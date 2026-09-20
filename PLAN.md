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
    _app/{money,body,social,portuguese,career,style,knowledge}.tsx   (phase 7+, empty)
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
  search.ts      -- everything(): ⌘K over your own rows. A read, not an aggregation:
                    it returns rows grouped by kind and never scores or ranks across them.
  seed.ts        -- internal mutation: principles only. Nothing else is ever seeded.
  auth.config.ts
```

**Key rule — every number on screen comes from exactly one of four sanctioned sources:**

1. **log count** — aggregate over `logs` for a period (12 workouts this month, 2 events this month)
2. **state** — latest `stateSnapshots` row for a key (weight 75.4 kg, net worth €42,100, CEFR B1)
3. **entity count** — rows in `projects` / `tasks` matching a filter (2 active projects, 11 of 17 tasks)
4. **external reading** — a value fetched from a named outside source, stored as a row with that
   source and the instant it was read (a share price, an exchange rate)

All four live in `convex/aggregate.ts` and nowhere else, and none of them can produce a score, an
index, or a percentage without an explicit `targetValue` to divide by.

**Why there is a fourth, and what it costs to have one.** The first three are all things this app
observed: you logged it, you recorded it, or it counted its own rows. A share price is none of those
— it is true, and it comes from somewhere else. Tracking money without it is not possible, so the
rule extends rather than being quietly broken. The extension carries four conditions, and a number
that fails any of them is not a source-4 number:

- **Stored, never fetched at render.** A value read at paint time changes under you and cannot be
  audited. It is written as a row first, and screens read the row.
- **Attributed.** The row says which source it came from and when it was read.
- **Shown as of a time.** `€42,100 · read 09:41` — a price presented as current when it is twenty
  minutes old is a lie told by omission, and it is the exact failure §1 exists to prevent.
- **Not a licence to derive.** `holding × price` is composition of two sanctioned values, the same
  shape as "2 of 4". A "portfolio health score" is still invented, and still forbidden.

The storage shape is decided when Money is built, not here. What is decided here is that an external
number is allowed to exist, and what it must carry to be shown.

**The first external reading is GitHub commits** (R3c, 20 Sep, `convex/github.ts`, which names where
each condition is kept): an hourly internal action stores every commit on a project's public repo as
a row, the row carries the repo it came from, the project carries when the check last succeeded, and
`aggregate.projectCommits` only counts those rows per week. Prices arrive with Finances (R6).

Building it taught the fourth condition's real shape: the check first read one page of 100 commits,
and the card showed "100 this week · 0 last week" where the truth was 117 and 65. Nothing was
derived and nothing was invented — a _truncated_ reading is simply not the reading, and it looks
exactly like a real count. A source-4 number must be the whole reading or no reading at all.

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
const logKind = literals('workout','weight','expense','transfer','income','session','conversation',
  'event','people_met','task_done','piece','note','idea','custom');

goals:     { ownerId, title, description?, area, status: 'active'|'done'|'dropped',
             targetLabel?,            // "B2", "€80,000", "profitable business"
             targetValue?: number, unit?,   // only when measurable
             deadline?: string,       // ISO date
             tile?: 'projects'|'portuguese'|'body'|'money'|'style'|'social' }
                                      // a monthly target read against that §3 tile (R2)
           .index('by_owner_status', ['ownerId','status']).index('by_owner_tile', ['ownerId','tile'])
projects:  { ownerId, goalId, title, description?, status: projectStatus, deadline?,
             githubRepo?, githubCheckedAt?: number }   // source 4 (R3c): 'owner/name', and when last checked
           .index('by_owner_status', ['ownerId','status'])   // one 'focus' per owner — setFocus enforces
           .index('by_github_repo', ['githubRepo'])          // internal cron only — the one index not led by ownerId
commits:   { ownerId, projectId, repo, sha, message, url, authoredAt: number, fetchedAt: number }
           .index('by_owner_project_time', ['ownerId','projectId','authoredAt']).index('by_project_sha', ['projectId','sha'])
           // source 4's first reading (R3c): stored hourly by convex/github.ts, counted per week
tasks:     { ownerId, title, notes?, projectId?, goalId?, area?,
             dueDate?, scheduledAt?: number, durationMin?,
             rrule?,                  // recurring template; instances expanded on client
             priority: number, status: taskStatus, completedAt?: number,
             todayFor?: string,       // ISO date — set only when this task is one of today's three
             pickedAt?: number }      // orders the three by when they were chosen (16 Sep)
           .index('by_owner_status', ['ownerId','status']).index('by_owner_today', ['ownerId','todayFor'])
           .index('by_project', ['projectId']).index('by_owner_due', ['ownerId','dueDate'])
events:    { ownerId, title, area?, projectId?, startsAt: number, endsAt: number, rrule?, notes? }
           .index('by_owner_start', ['ownerId','startsAt'])
logs:      { ownerId, kind: logKind, area, occurredAt: number,   // quick capture. append-only evidence, except `value`.
             value?: number, unit?,   // 60 (min), 48 (eur), 75.4 (kg)
             text?,                   // "push day", "groceries"
             taskId?, projectId?,
             meta?: v.object({ reps: v.optional(v.number()), sets: v.optional(v.number()),
                               weightKg: v.optional(v.number()), category: v.optional(v.string()),
                               people: v.optional(v.number()) }) }
           .index('by_owner_time', ['ownerId','occurredAt']).index('by_owner_area_time', ['ownerId','area','occurredAt'])
           .index('by_owner_project_time', ['ownerId','projectId','occurredAt'])   // time on a project (R3)

**`logs.value` became editable on 20 Sep, his call.** The rule was that a log
is never edited into a different truth — a mistake was removed and logged
again. He asked twice for a mistyped duration to be fixable where it is shown
and overruled it. What survives of the reasoning is narrower and still binds:
a correction may not leave two stored facts disagreeing. So `kind`,
`occurredAt` and `text` stay immutable, and a **weight** is still refused —
it writes a `stateSnapshots` row that `remove` deletes with it, and editing
the log alone would leave the shown weight contradicting its own evidence.

stateSnapshots: { ownerId, area, key, value?: number, textValue?, unit?, recordedAt: number }
           .index('by_owner_key_time', ['ownerId','key','recordedAt'])
           // keys: weight, bench, net_worth, cefr_level, protein_avg, savings …
notes:     { ownerId, title, body, tags: string[], projectId?, goalId?, kind: 'note'|'idea'|'book'|'reference' }
           .index('by_owner_kind', ['ownerId','kind']).index('by_owner_project', ['ownerId','projectId'])
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
`todayFor = today`. Only `tasks.dropFromToday` clears the slot; a finished task keeps
it, ticked, until the day ends (16 Sep).

---

## 3. Layout (rethought 15 Sep 2026 — fewer places, each one deep)

The first layout (§3 of 8 Sep) had sixteen sidebar entries, seven of them
placeholders, and the same day shown in three places. After a week of use the
verdict was: **too many sections means never using them.** What is used gets
made deep; what is not gets removed. This section is the map; §4 is the order
it is built in (R1–R7). Everything in §1–§2 and §3b–§3d still holds.

**Shell (desktop ≥1024)**

- TopBar unchanged: ■ SOLO LEVELING · Log ⌘L · Search ⌘K · bell · avatar.
- SideNav, three groups, eleven entries, Settings at the bottom:

  | group     | entries                            |
  | --------- | ---------------------------------- |
  | **NOW**   | Today · Calendar · Review          |
  | **BUILD** | Projects · Goals · Backlog · Notes |
  | **TRACK** | Finances · Body · Languages        |

  Gone: Quests (merged into Today), Chains (the word and the card), Knowledge
  (Notes _is_ the knowledge base), Principles (one line a day on Today),
  Career (its one number becomes a goal), Social and Style (events with a
  `social` area, a `style` notes kind, and a goal each — no page). Money is
  renamed Finances; Portuguese becomes Languages.

- Mobile bottom nav: Today · Calendar · Projects · Notes · More.

**Today** (the dashboard; the only screen that must be right at 7am), in order

1. Two columns (16 Sep). **Left:** greeting · `LEVEL 32` with the year's
   progress as a bar (a calendar fact: days since the last birthday over 365
   — not a score) · `CURRENT FOCUS`. **Right:** the **principles**, as text on
   the ground rather than in a card — the six stacked in a window one line
   tall, **looping**: the column slides up by one line every 7s, each line in
   its own colour, with `READ ALL SIX` — a filled button, not a quiet label —
   opening them full size. It pauses while you read it and stops under
   `prefers-reduced-motion` (the §3d.1 exception, recorded there).

   **No line is "today's" (16 Sep).** One was picked by the date until then
   and marked as such: it read as the app naming the line to live by, and it
   is not a prophecy. Six lines, all true at once, each shown in turn.

   Four shapes were tried before the loop: one static line stopped being read
   within a day; all six as a list read as a wall and pushed the day's cards
   below the fold; the same line in a glass card was one more box on a screen
   made of boxes; characters tilting in place was not what "loop text" means.

2. **TODAY** (events + scheduled tasks, the timeline) beside **TODAY'S THREE**
   (the three slots, §3c.1: add, tick, drop, give a time; the evidence
   follow-up after a tick). On a phone the three come first.
3. **CURRENT STATE**: Languages (level + sessions of target), Body (weight +
   workouts), Finances (net worth; later the portfolio value as of a time),
   Social (events this month). Business and Career cells are gone — projects
   were counted twice, and Career had nothing to count.
4. **THIS MONTH · ACTIONS LOGGED** — the six tiles, each against a **target**
   when one exists (R2): `Body · 5 of 9 workouts · 4 to go · 16 days left`. The
   target is a goal's `targetValue` (§1) — the only thing a count may be divided
   by — set on the tile itself: a goal bound to that tile (`goals.tile`), read
   per month, one per tile. A tile with no target shows the count and last
   month, as before.
5. **THIS WEEK** at a glance (R2): the seven days, what is booked, what was
   logged. The weekly review stays its own page.

**Three decisions taken by default on 15 Sep** (each is one line to flip):

- **Three a day stays.** §3c.1 is unchanged; only the Quests _page_ went.
- **No red on the morning screen.** Being behind a target reads as words and a
  calm colour (`4 to go, 12 days left`). Red/green is reserved for Finances,
  where direction is a fact (§3d.3), and even there is added only after the
  position itself has been watched for two weeks.
- **Investments show the position before the gain.** What you hold, what it
  is worth, as of when — then, later, the difference.

**Pages, and what each becomes**

| page      | R1 (prune)                                                                | later                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today     | quests merged in; chains card, Business/Career cells gone; principle line | R2: year bar, targets on tiles, week glance, more colour by kind                                                                                              |
| Calendar  | as is                                                                     | R5: drag to move, any duration, start–end instead of minutes, binding to project/goal, reminders                                                              |
| Review    | in the sidebar at last; label "Review"                                    | —                                                                                                                                                             |
| Projects  | "chain" → "project" everywhere; the goal+project form stays               | R3: the deep page — tasks from backlog, notes, files, time spent (project verb logs), GitHub commits (source 4), milestones                                   |
| Goals     | as is                                                                     | R3: bound to projects and areas, a milestone timeline 0—1—2—3, deadlines, Reached/Drop/Delete kept                                                            |
| Backlog   | as is                                                                     | R3: created-at, bind to project/goal, "put it on the calendar"                                                                                                |
| Notes     | as is                                                                     | R4: the knowledge base — more kinds (`style` among them), expanded editor, drag-and-drop images/PDFs (Convex file storage), YouTube embeds, bind to a project |
| Finances  | renamed; still a placeholder                                              | R6: Investments (portfolios, positions, prices as source 4), Balances, Spending                                                                               |
| Body      | placeholder                                                               | R6: Gym · Stretch · Boxing · Other, weight progress against a target                                                                                          |
| Languages | renamed; still a placeholder                                              | R6: Portuguese · English · German tabs; `area` gains `languages` with a language field, `portuguese` migrated                                                 |
| Settings  | as is                                                                     | —                                                                                                                                                             |
| Ask AI    | —                                                                         | R7: a ⌘-shortcut, not a page — a reader over your own rows, never a fifth source of numbers                                                                   |

**Mobile (<768)**: greeting+principle → Today's three → Today timeline → This
month → sticky "+ Log" pill → bottom nav. Rows 48–56px.

**Design system — Nocturne is the source of truth**, dark by default, light as
"milky glass" (§3d.4). `design/wireframes-v2/` is visual reference for rhythm
and anatomy; where it disagrees with this section, this section wins.

**Visual:** dark ground or milky glass, frosted panels, one lavender accent
used only for live things, mono caps for labels, big light numerals. No bars
without a target. No emoji.

---

## 3b. Six settled decisions

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
6. **A recurring occurrence has an identity, even though it is not a row.**
   Expansion is client-side (§2), so the Tuesday gym you see is computed, not
   stored. It still carries a stable id — `${eventId}:${occurrenceStartMs}` —
   because the alternative is components that address occurrences by array
   position, and that is the thing that makes exceptions expensive later.

   Phase 5 ships expansion only: a recurring event is editable as a series and
   not as one instance. **Deferred to a later phase: materialize-on-edit** —
   moving or skipping a single occurrence writes a real `events` row that
   overrides the computed one, leaving the rest of the series computed. It is
   deferred because the exception _taxonomy_ (this event / this and following /
   all events) should be chosen from a week of real use, not guessed.

## 3c. Three limits that keep it usable

The failure mode of a personal OS is not too few features — it is a list long enough to feel like
debt. Three constraints are enforced in the data layer, not suggested in the UI:

1. **Three quests a day, hard.** `tasks.pickForToday` throws `TODAY_FULL` on the fourth. Everything
   else waits in the backlog. Choosing three is the planning ritual; there is no other one.
2. **One focus project.** Already enforced by `projects.setFocus`. Non-focus projects render as
   title + next action only — no task lists, no counts competing for attention. (Called "chains"
   until 15 Sep; the word confused more than it explained, and only the word went.)
3. **The backlog is never on the dashboard.** No "47 open tasks" anywhere on the morning screen.
   That number is the one that makes people close the app. It lives on its own page or nowhere.

## 3d. Motion, loading, and what colour is allowed to say

Written before it is built, because these three are the ones that spread. A
transition added in one component becomes four durations in a month, and a
colour that means something in one place means nothing three screens later.

This section is a floor, not a ceiling. The app is meant to become considerably
more alive than §3 first described it — more colour, more badges, more things
that respond when touched. Only one thing stays fixed: a number on screen still
comes from a sanctioned source, and colour still may not grade the person using
it. Everything else is open.

**1. Motion has two speeds and one curve.** Added to `tokens.css` under APP
ADDITIONS with the rest of the reasoned exceptions: `--motion-fast` (120ms) for
feedback on something you are touching — hover, press, focus — and
`--motion-base` (220ms) for something arriving or leaving. One easing,
`--motion-ease`. Nothing gets a third duration without a written reason.

The rule for what moves: **a state change you caused animates; the app moving on
its own does not.** A card you opened, a quest you completed, a week you closed —
those animate, because the motion tells you the app heard you. Data arriving from
Convex does not slide in; it is not a response to anything you did, and a
dashboard that reflows every time a query resolves is a dashboard you cannot
read. `prefers-reduced-motion: reduce` removes all of it — the information is in
the change, not the movement.

**The one exception, taken deliberately on 16 Sep: the principles loop.**
Every seven seconds the column slides up by one line inside a window one line
tall (`loop-window`), the first line repeated under the last so the wrap has no
rewind in it. It breaks the rule above
and is allowed to, because the rule exists to stop _data_ moving under you —
the number you are reading, the card that reflows as a query lands — and a
principle is the one thing on Today that is not data. Two shapes were tried
first and both failed for the same reason: a single static line was stopped
being read within a day, and all six as a list read as a wall. It holds while
the pointer is on it or focus is inside it, it does not rotate at all under
`prefers-reduced-motion`, the date still decides which line is showing when
the screen opens, and every line is reachable by hand. Nothing else on Today
moves on its own, and adding a second thing that does needs its own line here.

**2. Loading shows shape, never values.** A skeleton mirrors the layout that is
coming: the same tile grid, the same row heights, the same number of rows where
the count is known. It shows no numbers, no placeholder figures, no "0" standing
in for a value that has not arrived — a skeleton that renders a plausible number
is a fixture, and §3b.5 rules those out everywhere else too.

`Reading…` as grey text is not a loading state and is not to be used as the
default. A spinner is for something with no knowable shape; almost nothing here
qualifies — except a write you pressed for and are waiting on.

**A skeleton breathes, and stays long enough to be seen** (decided 14 Sep,
after using it). Built static first, by the letter of rule 1: loading is the
app, not you. On screen a still grey block read as a page that had died, not
one that was coming. So a skeleton pulses slowly in opacity — never a sweep,
never a slide. It first waited `--motion-fast` before appearing, which made a
load just past that flash a skeleton for a few frames; Artem called that a
flicker. Now a page that opens without its data shows the skeleton at once and
holds it for `--loading-hold` (half a breath), then fades the content in. A
page that already has its data — visited in the last few minutes — shows it on
the first frame, with no skeleton and no wait. The same goes for anything
standing in for a thing still loading, like the avatar's place in the top bar.
It is the one exception to rule 1, and it moves no layout: nothing reflows,
only opacity changes.

**3. Colour says what a thing is, not whether it is good.** This is the §1 rule
in visual form, and the distinction is the whole of it:

- **Kind and state — freely.** Area, `LIVE` / `FOCUS` / `IDLE`, open versus
  closed, a series versus a one-off, a slot that is full. This is information,
  and the app has been too monochrome about it.
- **Valence — per metric, declared, opt-in.** Green-up/red-down as a global rule
  is banned. `+1 workout` green and `+1 transfer` green look identical and mean
  opposite things; more spending is not an achievement. Where a direction is
  genuinely known it is declared once beside that metric, with the direction
  written down. Where it is not known, the number is flat — which is where the
  dashboard's month tiles stay, deliberately.
- **A palette, where colour says only "another one" (16 Sep).** The six
  principles each wear one of the area hues from `tokens.css` — borrowed as a
  palette, not as area meaning: a principle is not an area, and the colour
  grades nothing and measures nothing. It is there because six lines in one
  grey are six lines nobody reads. Anything else borrowing the area hues this
  way says so here first.

Lavender remains reserved for live and focus things (§3 Visual). Colour added
under this rule is additional vocabulary, not a licence to repaint that.

**3. State has colour too (20 Sep, Artem's call, overriding the ration).**
Artem, looking at a project whose deadline passed eight days ago and read
exactly like a project with no deadline at all: "entire platform is boring and
bland… overdue we can make RED or warning and icon to HIGHLIGHT". Until today
red and green were held back for money, where direction is a fact (§3d.3
below). That rule was written to stop colour grading things that cannot be
graded, and it did — at the cost of a screen where nothing could ever look
wrong.

So: `--state-danger`, `--state-warn`, `--state-good` (`tokens.css` item 8).
They mark the **state of a thing**, never a quantity: a passed deadline is
danger, a deadline inside two days is warn, a write that landed is good.
Nothing is "37% red", nothing grades, and §3d.3 still holds for money — a
share price going up is not "good".

Motion is part of the same complaint and the same answer. `styles.css` has
carried eight motion utilities since R1 — `motion-arrive`, `motion-pop`,
`motion-pulse`, `motion-press` and the rest — used by **five** elements in the
whole app. The vocabulary was written and never spoken. A thing that arrives
should arrive, and a write that lands should be seen to land.

**4. Light as well as dark** (decided 14 Sep). The dark ground above stays the
default and the design's voice. A light theme exists because Artem's day has
daylight in it: the app follows the device's appearance — macOS and iOS "Auto"
switch at sunset — and Settings can force Light or Dark on one device. It is
made of tokens, not components: components mix `lift` and `sink` instead of
white and black (`tokens.css` item 6), and the light theme redefines those,
turns the grey and lavender ramps around so each step keeps its role, and
darkens the area colours to one shared lightness. One light palette, "milky glass" — kept after living with it beside two others, which
were deleted rather than left as options: every theme is one more to check on every
screen. Everything in 1–3 holds in both themes.
---

## 4. Phases

**Phases 0–6b (8–14 Sep) are done**: scaffold, schema, capture and quests, goals and
projects, dashboard, calendar, review/notes/principles/PWA, and the polish pass (motion,
skeletons, light theme, robustness, backups). They are kept in git history; the table below
is what is left, in the order agreed on 15 Sep. Each row is one branch, one PR, and one
plan under `docs/superpowers/plans/`, written when the previous row has shipped — a plan
written earlier would describe ground the earlier row changes.

| #    | Deliverable                                                                                                                                                                                                                                             | Done when                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| R1   | **Prune and rename** — the §3 sidebar (11 entries), Quests merged into Today, chains card and dead cells gone, principle of the day, "chain" → "project", Money → Finances, Portuguese → Languages                                                      | The sidebar is §3's table; nothing on Today is a placeholder or a duplicate; all checks pass           |
| R2   | **Today, rebuilt** — year bar, targets on the month tiles (goals with `targetValue`), week glance, colour by kind                                                                                                                                       | A morning with a gym target shows `5 of 9 · 12 days left`, in calm colour                              |
| R3   | **Projects deep, Goals with a timeline, Backlog bound** — tasks/notes/files/time on a project, GitHub commits as source 4, milestones and deadlines on goals. Shipped as three PRs: R3a project page + backlog, R3b goal milestones, R3c GitHub commits | Oreum's page shows its tasks, notes, hours this month and last week's commits, and its goal's timeline |
| R4   | **Notes as the knowledge base** — kinds, expanded editor, images/PDFs by drag-and-drop, YouTube embeds, bind to a project                                                                                                                               | A PDF and a YouTube link pasted from Telegram live on a note attached to Oreum                         |
| R5   | **Calendar** — drag, any duration, start–end, binding, reminders                                                                                                                                                                                        | A gym session is dragged from 8:00 to 9:15 and asks nothing                                            |
| R6   | **Areas** — Finances (investments per the parked design, balances, spending), Body, Languages (schema change)                                                                                                                                           | `invest → Revolut → TSLA → 300$` lands in a portfolio and Finances shows the position as of a time     |
| R7   | **Ask AI** — a ⌘-shortcut chat that reads your own rows through a Convex action                                                                                                                                                                         | "What did I actually do in August?" is answered from logs, and nothing on screen is derived from it    |
| Late | Scheduled backups (`pnpm backup` daily, retention, a scheduled drill); Clerk production instance (needs a domain, an ownerId migration, and the dev-vs-prod data decision); notifications (the bell)                                                    | Deferred 14 Sep while the app is still being built                                                     |

**The order changed on 20 Sep: R6's area rework comes before R4.** Artem hit the same wall twice
in one day — a goal with nowhere to go but the wrong area, then a task on SoloLeveling badged
`business` when it is a pet project and `life` when that means nothing. A fixed enum cannot be
made to fit by choosing more carefully, and every screen that shows an area shows the wrong
answer until it is data he edits. Notes as the knowledge base (R4) is still wanted — he has asked
for prompts, screenshots and MD files twice — but it is a capability the app lacks, not a wrong
answer the app keeps repeating. Wrong answers come first. R4 follows R6, and R5 and R7 keep their
places.

**R6 is not a rename (added 20 Sep).** The row above says "Languages (schema change)", which
read as `portuguese` → `languages`. It is more than that. Artem tried to file a goal under
**English** and found there was nowhere to put it: `area` is a fixed enum in
`convex/schema.ts`, so the set of areas is something only a deploy can change. R6 must make
areas **data he edits** — add one, rename one, retire one — which reaches the seven area
colour tokens (`--area-*` cannot be a static class per area), `src/lib/nav.ts`, the capture
parser's area words, and every table carrying `area`. What it must **not** reach is
`monthCounts()`: the six tiles are a fixed shape and are deliberately not derived from the
area enum (§3 item 4), and that stays true however many areas exist.

**A money target needs a fifth source, and does not have one (20 Sep).** Asked for a month
tile target of "€100" rather than a count. A tile's number is the denominator of a real bar,
counted from `logs` rows; a sum of logged amounts is none of the four sanctioned sources in
§1. Until that question is answered — a new source with written conditions, or a
`stateSnapshots` balance read against nothing — a tile keeps its count and may show the
goal's free-text `targetLabel` beside it as words. It belongs with R6 Finances.

**Rules that carry through every row:** every number from a sanctioned source (§1); three a
day (§3c.1); the backlog never on Today (§3c.3); tasks and events two tables (§3b.3);
nothing seeded (§3b.5); Nocturne tokens only (§3d).

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
