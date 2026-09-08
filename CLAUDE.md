# SOLO LEVELING — operating rules

Single-user personal operating system for Artem. `PLAN.md` is the spec: read it
before starting a phase. This file is the standing agreement, and it wins over
habit — where it and `PLAN.md` disagree, say so rather than picking one.

## Reality over gamification

This is the rule the whole product exists to keep. It is invisible in a diff:
an invented metric looks exactly like a real one until someone asks where the
number came from.

Every number on screen comes from one of **three sanctioned sources**, all of
them in `convex/aggregate.ts`:

1. **log count** — rows in `logs` over a period
2. **state** — the latest `stateSnapshots` row for a key
3. **entity count** — rows in `projects` / `tasks` matching a filter

Components read those numbers; they never compute them. A progress bar renders
only where `goals.targetValue` gives it a real denominator. When you reach for a
fourth source, or find yourself deriving a score, an index, or a percentage out
of thin air — stop and ask.

`monthCounts()` returns the fixed six-tile shape in `PLAN.md` §3 item 4. It is
not derived from the `area` enum: nine areas, six tiles, deliberately.

## Intent is not evidence

Ticking a task off says you meant to do a thing. It is not proof you did it.

`tasks.complete` writes `logs{kind:'task_done'}` and stops there. Real activity —
a workout, a session, an expense, a weight — is a separate row the user confirms
with one tap. Keep the two apart in both directions: never infer activity from a
completion, never infer a completion from activity.

## Tasks and events are two tables

They stay two tables. They meet only in the UI, through a `TimelineItem` mapper
shared by Calendar and the dashboard TODAY card. A task is creatable from a
title alone.

## Design

Nocturne is the design source of truth. Its tokens live in
`src/styles/tokens.css` and reach components through Tailwind's `@theme` in
`src/styles.css`. Take every colour, radius, space and shadow from a token.

The three tokens under that file's `APP ADDITIONS` rule are the only values not
from Nocturne, and each carries the reason it exists. Adding a fourth means
writing that reason too.

`Solo Leveling Wireframes.dc.html` is visual reference for rhythm and component
anatomy. Where it and `PLAN.md` §3 disagree, §3 wins — the wireframe paints its
glass with inline hex, which is what tokens replaced.

Voice: dark ground, frosted panels, one lavender accent reserved for live and
focus things, mono caps for labels, big light numerals, flat colour.

## Speed of daily use

Quick capture (⌘K) logs something in under three seconds: `workout 60`,
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
- Every mutation and every non-public query opens with `requireOwner(ctx)` from
  `convex/auth.ts`. It fails closed: an unset `OWNER_ID` authorizes nothing.
- Aggregations live only in `convex/aggregate.ts`, as `monthCounts()`,
  `currentState()` and `entityCounts()`.

## Stack

TanStack Start · Convex · Clerk · Tailwind v4 · shadcn/ui · deployed to
Cloudflare Workers. Fixed, per `PLAN.md` §1. A new dependency needs a one-line
reason before it goes in.

## Working style

- One phase at a time. Open a phase by listing the files you will create or
  modify in ten lines or fewer, then wait for the OK. The listing turn does no
  coding.
- Close a phase by running typecheck and lint, summarizing in five lines or
  fewer, and naming the single thing to verify by hand. Commit per meaningful
  step with a real message.
- Ship phases 0–3 first. Each later route stays an empty destination until its
  own phase.
- Ask rather than guess when `PLAN.md` is ambiguous, when a UI element has no
  source in the data model, or when a design decision would introduce a number
  that is not one of the three sources.

## Where we are

Every reply ends with a **Where we are** block. Artem is steering a seven-phase
build across many sessions; without it he has to reconstruct the state of play
from the middle of a technical answer.

The block is three lines, after the substance of the reply:

```
**Where we are**
- Just did — what changed, in one line
- You — what needs Artem next: a decision, an account, a credential, a look at
  a screen. Write "nothing" when the ball is entirely in my court.
- Me — what I do next, once he says go
```

Keep it concrete: "create the Clerk JWT template named convex" rather than "set
up auth". Where a step is blocked, name what it is waiting on.

Expand it into a **plan position** at every phase boundary, whenever a session
resumes, and any time roughly five turns have passed without one — state the
current `PLAN.md` §4 phase, the done-when that closes it, and how many phases
remain. Artem asked for this refresh explicitly; it is how he keeps the map.

## Repo notes

The design folder `2nd version Daily focus with chain model/` is a Claude Design
export: wireframes plus the Nocturne stylesheet. It is reference material, and
`support.js` inside it is a generated canvas runtime. Lint and Prettier skip it.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
