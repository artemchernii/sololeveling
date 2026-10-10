# SOLO LEVELING — operating rules

Single-user personal operating system for Artem. `PLAN.md` is the spec: read it
before starting a phase. This file is the standing agreement, and it wins over
habit — where it and `PLAN.md` disagree, say so rather than picking one.

## Stop producing slop: journey, then mockup, then code (27 Sep)

Artem, after a day of Finances screens he did not recognise: "STOP
PRODUCE SLOP SHIT." The screens were built from specs in words, each
step reasonable, and together not what he pictured. A form, a raw list,
a number with no question behind it — that is slop, however well coded.

1. **Journey first.** Before any new or reworked screen, write down the
   moment he opens it: what he wants to know or do, what he does next, how
   often. In his words — read his earlier messages before asking again.
   He says yes before anything else happens.
2. **Then something he can click.** A mockup on real proportions (the
   Treasury mockup on :3950 is the bar). He marks it up; it changes
   until he says go.
3. **Build what it shows.** Match the approved mockup — its layout,
   density, charts, states — not a reinterpretation of it. Before calling
   a screen done, put both side by side in the browser pane and look.
4. **The app does the work.** Detect, prefill, remember; ask him only
   what cannot be known. Never a form where a file, a guess or a default
   would do.
5. **A recommendation is not a decision.** Say what it changes in the
   thing he sees ("Revolut becomes two cards") before he agrees to it.

## Reality over gamification

This is the rule the whole product exists to keep. It is invisible in a diff:
an invented metric looks exactly like a real one until someone asks where the
number came from.

Every number on screen comes from one of **four sanctioned sources**, all of
them in `convex/aggregate.ts`:

1. **log count or sum** — rows in `logs` over a period, or the sum of their
   amounts on the five conditions in `PLAN.md` §1 (one currency, a stated
   period, only logged rows, every sum opens its rows, no derived "saved")
2. **state** — the latest `stateSnapshots` row for a key
3. **entity count** — rows in `projects` / `tasks` matching a filter
4. **external reading** — a stored, attributed, timestamped value from a named
   outside source (a share price, an exchange rate). See `PLAN.md` §1 for the
   four conditions it must meet: stored not fetched at render, attributed,
   shown as of a time, and not a licence to derive.

Components read those numbers; they never compute them. A progress bar renders
only where `goals.targetValue` gives it a real denominator. When you reach for a
fifth source, or find yourself deriving a score, an index, or a percentage out
of thin air — stop and ask.

Sums were allowed on 2026-09-26 for Finances, the same way.
The fourth was added deliberately, on 2026-09-09, because money cannot be
tracked without prices that come from outside. That is the bar for adding
another: a real thing the app must show, and a written set of conditions that
keep it auditable. Not convenience.

`monthCounts()` returns the fixed six-tile shape in `PLAN.md` §3 item 4. It is
not derived from the `area` enum: nine areas, six tiles, deliberately.

## Intent is not evidence

Ticking a task off says you meant to do a thing. It is not proof you did it.

`tasks.complete` writes `logs{kind:'task_done'}` and stops there. Real activity —
a workout, a session, an expense, a weight — is a separate row the user confirms
with one tap. Keep the two apart in both directions: never infer activity from a
completion, never infer a completion from activity.

## Nothing is seeded

`seed.ts` inserts the six principle lines and stops. Goals, chains and tasks
are created through the UI, because creating them **is** the product.

Never write fixture data to make a screen look populated. If a screen has
nothing to show, build its empty state — that is the screen I will actually see
on day one, and the one a demo row would hide.

## The map is PLAN.md §3, one slice at a time

On 15 Sep the layout was rethought: fewer places, each one deep. `PLAN.md` §3
is the map (eleven sidebar entries in three groups) and §4 the order (R1–R7).
Each row is one branch and one spec under `docs/specs/`, written
only when the row before it has shipped. Do not build ahead of the current
row, and do not add a sidebar entry §3 does not list — a section that is not
used is the thing the rethink exists to remove.

## Three quests a day, and no backlog on the morning screen

Both are enforced in the data layer, not suggested in the UI (`PLAN.md` §3c).

`tasks.pickForToday` throws `TODAY_FULL` on the fourth. Choosing three is the
planning ritual; there is no other one. A finished task keeps its slot,
ticked, until the day ends — only `tasks.dropFromToday` frees one (16 Sep:
freeing on completion made three a day mean three at a time). The three live
on Today (the dashboard) since 15 Sep; the separate Quests page is gone, the
limit is not.

Unpicked tasks live on the backlog page and nowhere else. No screen shows a
total of open tasks — "47 remaining" is the number that makes people close the
app. If a design would surface it on the dashboard, don't build it: ask.

## Tasks and events are two tables

They stay two tables. They meet only in the UI, through a `TimelineItem` mapper
shared by Calendar and the dashboard TODAY card. A task is creatable from a
title alone.

## Design

Nocturne is the design source of truth. Its tokens live in
`src/styles/tokens.css` and reach components through Tailwind's `@theme` in
`src/styles.css`. Take every colour, radius, space and shadow from a token.

The tokens under that file's `APP ADDITIONS` rule (eleven groups, as of 27
Sep: ground, mono face, glass, motion, area colours, lift/sink, the light
theme, state, note kinds, the System, and the Treasury's marks and money
colours) are the only values not from Nocturne, and each carries the reason it
exists. Adding another means writing that reason too.

`design/wireframes-v2/Solo Leveling Wireframes.dc.html` is visual reference for
rhythm and component anatomy. Where it and `PLAN.md` §3 disagree, §3 wins — the wireframe paints its
glass with inline hex, which is what tokens replaced.

Voice: dark ground, frosted panels, one lavender accent for live and focus
things and for the System window, mono caps for labels, big light numerals.

**Lavender is the app, an area's colour is the room (26 Sep).** The System
window — lit lavender edge, corner brackets, `[ BRACKETED ]` caps titles
(`system-frame`, `system-title`, `system-pulse` in `styles.css`) — frames the
tracking pages and the sidebar's hover. An area's colour marks which page:
its icon, its photo's light, a thin accent, never a whole panel.

**Not flat and not grey (20 Sep).** Artem: "everything is boring and
depressing. No fun!" State has colour — `--state-danger/warn/good`, PLAN.md
§3d.3 — and the eight motion utilities in `styles.css` are there to be used.
A thing that arrives should arrive; a write that lands should be seen to land.
What colour still may not do is grade: a state, never a quantity.

## Speed of daily use

Quick capture (⌘L) logs something in under three seconds: `workout 60`,
`spend 48 groceries`, `pt 30`, `weight 75.4`, `note …`. When a feature would
slow the daily loop to make a rarer screen better, the daily loop wins.

## Data and auth

- Client reads and writes go through Convex `useQuery` / `useMutation`. Convex
  reactivity is the point of the stack — a phone log updates the desktop with no
  code. Reach for a Start server function only for work Convex cannot do, and
  ask first.
- `convex/schema.ts` validators are the single source of truth for shape.
  Import `Doc<'tasks'>`, `Id<'projects'>`. Every field is typed — when a shape
  is genuinely unknown, ask rather than widening it.
- Every table carries `ownerId: v.string()` and an owner-scoped index. Every
  mutation and every query opens with `requireUser(ctx)` from `convex/auth.ts`,
  which returns the Clerk `identity.tokenIdentifier`, then scopes the read
  **through an index** — never `.filter()` over a full table scan. There is no `OWNER_ID`
  env var. A query that could return another user's row is a bug, even while
  there is only one user.
- Aggregations live only in `convex/aggregate.ts`, as `monthCounts()`,
  `currentState()` and `entityCounts()`.

## Stack

TanStack Start · Convex · Clerk · Tailwind v4 · shadcn/ui · deployed to
Cloudflare Workers. Fixed, per `PLAN.md` §1. A new dependency needs a one-line
reason before it goes in.

## Workflow (5 Oct) — work like pros, on a Pro plan

Artem, after a week of fixes breaking last week's screens: "I finally
want to work smart and not go back and forth, and generating slop."
These are rules, not advice.

1. **Every screen or feature is a slice: load the `slice` skill first.**
   Spec for me (scenarios that become tests) → Artem approves **1–2
   plain sentences plus something to see** (mockup or screenshot), never
   the spec text → e2e tests first → build until green → PR with
   screenshots → he tests on localhost with his own data → merge.
2. **`pnpm verify` before every PR** (typecheck, lint, format, unit,
   build, e2e). Red means no PR.
3. **Tests run on mock data only** — the `e2e` skill. Never press a
   write on his real account to check something.
4. **Every write answers**: "saving…" at once, a landed screen, then it
   closes. An e2e test asserts all three.
5. **Small**: a PR under ~600 changed lines, never over 1000; a file
   under ~500 lines (split, don't grow). The `session-guard` hook says
   when a branch is too big or a session too long.
6. **Find, don't search**: `docs/journeys/<area>.md` maps each journey
   to its screens, functions and test. Read it before the code; update
   it in the same PR.
7. **Budget (Pro plan)**: one slice per session; start from the handoff
   memory and the spec, not the history; no helper agents unless the
   slice is huge; screenshots from tests, not browsing. When the hook
   fires, write the handoff and stop.
8. **Ask, don't guess** — in the spec or the reply, few at a time, each
   with a recommendation.
9. **Tests with the code**: every Convex write or count gets convex-test
   (with refusals); parsers and mappers in `src/lib` too.
10. **Conventional commits, never squashed** (24 Sep): `type(scope): what`
    with the why in the body; PRs land as merge commits. The history is
    the record of the work.

## Where we are

Every reply ends with this block. Artem is steering a long build across many
sessions; without it he has to reconstruct the state of play from the middle
of a technical answer. He chose the headings and the emojis (22 Sep) so the end
of a turn is findable when he scrolls back — **🫪 is Artem, 🤖 is me.**

After the substance of the reply, exactly this shape:

```
### 📋 Summary
<one or two plain sentences>

### ✅ Just did
<what changed, in one line>

### 🫪 You
<what Artem does next — a decision, an account, a look at a screen — ending
with the exact short words to say, e.g. say "go". "Nothing" when the ball is
entirely in my court.>

### 🤖 Me
<what I do next, once he says go>

### ⏱ Session
⏱️ <length> · 🧠 <context> of 500k · 🔋 5h <% left> (resets <time>) · 🔋 week <% left> · ♨️ cache <min left> 🛸
```

The ⏱ line (5 Oct, reworked 10 Oct) is how he paces the Pro plan. Every
number is read fresh on every reply — a reading repeated from earlier in
the session is what he called "not updating and weird". Length and cache
come from the global `session-meter` hook's `meter:` line on his last message;
context and both plan limits come from `get_usage`, called once per
reply. The limits say what is **left** (100 minus percent used), never
what is used. Cache is the minutes before the hour-long prompt cache
expires — after that the next message re-reads the whole context at full
price; when the hook says cold, write `🧊 cache cold`. Each item carries
its emoji (5 Oct: "emoji drag attention"). A limit with more than 10%
left is 🔋 and the line ends 🛸; with 10% or less left it is 🪫 and the
line ends 🚨: `🔋 5h 98% left · 🪫 week 5% left 🚨`. That hook also says
when context passes 500k; `session-guard` says when the branch touches a
file over 500 lines. The same block and line are in `~/.claude/CLAUDE.md`
for every other project.

The phrase to say lives inside the 🫪 line. No separate closing paragraph or
"do this now" line after the block — he called that bother.

Keep it concrete: "create the Clerk JWT template named convex" rather than "set
up auth". Where a step is blocked, name what it is waiting on.

Expand it into a **plan position** at every phase boundary, whenever a session
resumes, and any time roughly five turns have passed without one — state the
current `PLAN.md` §4 phase, the done-when that closes it, and how many phases
remain. Artem asked for this refresh explicitly; it is how he keeps the map.

## Repo notes

Everything under `design/` is reference material, not app source — lint and
Prettier skip the whole folder.

`design/wireframes-v2/` is a Claude Design export: wireframes plus the Nocturne
stylesheet that `src/styles/tokens.css` was extracted from. `support.js` inside
it is a generated canvas runtime. `design/sololeveling_design.pdf` is the source
brief — its §16 is where the six principles in `seed.ts` come from.

Nothing in `design/` is imported by the app. It is kept because losing it would
mean losing the argument behind every token.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
