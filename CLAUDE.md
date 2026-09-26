# SOLO LEVELING — operating rules

Single-user personal operating system for Artem. `PLAN.md` is the spec: read it
before starting a phase. This file is the standing agreement, and it wins over
habit — where it and `PLAN.md` disagree, say so rather than picking one.

## Reality over gamification

This is the rule the whole product exists to keep. It is invisible in a diff:
an invented metric looks exactly like a real one until someone asks where the
number came from.

Every number on screen comes from one of **four sanctioned sources**, all of
them in `convex/aggregate.ts`:

1. **log count** — rows in `logs` over a period
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

The tokens under that file's `APP ADDITIONS` rule (ten groups, as of 26
Sep: ground, mono face, glass, motion, area colours, lift/sink, the light
theme, state, note kinds, and the System) are the only values not from Nocturne, and each carries the reason it
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

## Working style

Light process, written 22 Sep after one session burned 13% of a week's
tokens on helper agents re-reading the same files. Superpowers is off in
this project; these are the parts of it worth keeping.

- **A new row opens with a one-page spec** in `docs/specs/`: what gets built,
  which files, the done-when from `PLAN.md` §4, and open questions. No code in
  the spec. Artem reads it and says go before any code.
- **Ask, don't guess.** Questions go in the spec or the reply, a few at a
  time, each with my recommendation — when `PLAN.md` is ambiguous, a UI element
  has no source in the data model, or a number is not one of the four sources.
- **Tests with the code.** Every Convex function that writes or counts gets a
  `convex-test` case in the same commit, including the refusal paths
  (`TODAY_FULL`, another owner's row). Parsers and mappers in `src/lib` too.
- **Work inline.** Helper agents only for a genuinely huge row, and few of them.
- **Look at UI in the browser pane** whenever something visible changed —
  precision matters here. Read text with `get_page_text`; screenshot for layout,
  colour and motion.
- **Close a row** with typecheck, lint and tests green, one review of the whole
  branch, a PR based on `master`, and one thing for Artem to press by hand.
  Commit per meaningful step with a real message.
- **Conventional commits, never squashed** (24 Sep). Every commit is
  `type(scope): what changed` — `feat`, `fix`, `docs`, `test`, `refactor`,
  `chore` — with the why in the body. A PR lands as a merge commit; squash
  and rebase merging are switched off on GitHub. Artem: one commit for a lot
  of work "looks like I don't do work". The history is the record of the
  work, so it stays whole.

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
```

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
