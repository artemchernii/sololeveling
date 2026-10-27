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

## Words on screen: badges and numbers, never sentences (14 Oct)

Artem, after asking many times: "I begged you so many times to stop
writing slop text." Every label in the app, new or already shipped, is
checked against this list before he sees it. A label that fails is
rewritten, not explained.

1. **No sentences.** A state is a badge or a caps label with a value:
   `4 BUY`, `NOT SAVED`, `MISSING`, `IN THE FILE · iShares Physical Gold`.
   No instruction lines ("Remove takes back…", "add older buys"), no
   "you/your", no reassurance.
2. **A difference is two things with their places**, side by side:
   `IN THE FILE · X` and `SAVED ON · Y`, or
   `5 in the file · 6 in the account`. Never one word for the difference.
3. **Banned words** (each has been rejected): thing, wrong thing,
   instead, read as, in already, short, off, gap, over, wait, waits,
   lands, ends at, holds, stands on, two days, you paid for them.
4. **Reuse approved words first:** saved · not saved · missing · in the
   file · in the account · already added · same payment · BUY / SELL ·
   was · out · in · now.
5. **Before showing a screen:** grep the diff for the banned words, read
   every label aloud and look at the screenshot. If a label needs a
   second sentence to make sense, it is wrong.

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
The difference between two stored prices was allowed on 2026-10-13, on one
screen: the price chart of one position, when Artem drags from one day to
another ("lets do with drags"). Its conditions: only that chart
(`between()` in `src/lib/priceChart.ts`), both prices and both days always
shown beside it, nothing stored, nothing graded. The same day the ruler
was allowed on that chart ("go" on the mockup `chart.html`): the
difference between two levels read off the price axis, not stored prices
(`ruler()` beside `between()`), with both levels and both days always
shown and the days between. On 2026-10-14 the day's change was allowed
on a position's head ("go with day change" on the mockup
`position-head.html`): the latest stored price minus the last stored
close of an earlier day (`dayChange()` beside `between()`), with that
close and its day always shown beside it, nothing stored, nothing
graded. On 2026-10-15 the week's change was allowed on Review ("yes,
allow week change on Review" on the mockup `real.html`): this week minus
last week for spent (whole weeks, recurring bills left out and their sum
shown beside — "spent compare not days but weeks and exclude reoccuring
bills") and for worth, with both
numbers always shown beside it, an up or down arrow, green where the move
is good (less spent, more worth) and red where it is not, nothing stored.

On 2026-10-17 the month's change was allowed on Today ("yes, as the
mockup" on `design/today-mockup/month.html`): this month's count minus
the month before's for langs, workout, shake, post and commits, and worth
now minus the month before's last day — both numbers always beside it,
▲/▼ green where it rose and red where it fell, nothing stored.

Indicators and the average buy were allowed on 2026-10-13 ("yes
indicators, yes news, yes average price"), built on 2026-10-15 ("go —
build it" on the mockup `indicators.html`), all in
`src/lib/indicators.ts` and only on one position's chart and its
SIGNALS tab:

- **Lines**: RSI(14) (Wilder), the 50- and 200-day simple moving
  averages (`rsi()`, `sma()`) and the 52-week high and low
  (`yearRange()`, its distance from the high by `between()`). From stored
  closes only (`prices` / `priceYears`), each line named with its period
  on screen, off until pressed on every open, never stored. A line's own
  colour never means good or bad (`--ind-*`).
- **Average buy**: `avgBuy()` — the buys of the round held now
  (`rounds()`, as PAID counts it) over the shares they bought, in euros,
  and in the chart's currency at each buy's own day's stored rate
  (`rateOn()`); its buys and the round's first day always beside it.
- **Signals** (his words: "BAD or GOOD, most likely bullish or
  bearish"): `signals()` reads each line by its textbook rule — above
  the average buy IN PROFIT, above an average BULLISH, RSI over 70
  OVERBOUGHT and under 30 OVERSOLD, the top third of the year NEAR
  HIGH. Green, red or ink, with both numbers always shown on the row.
  This is the one place a verdict may be coloured.
- **A call to act** (15 Oct, his "go verdict … tell me overall idea
  what is the best to do"): a position may say ADD / HOLD / WAIT, built
  from the signals now and from fundamentals and news as those land.
  Its rule is written out in `src/lib/indicators.ts` and the reasons
  that made it are always shown beside it — never a bare word.
- **Fundamentals** (16 Oct, "go" on the mockup `fundamentals.html`): an
  analyst target (mean, low, high, count), an analyst rating (mean and
  the counts), revenue growth (last quarter on the same quarter a year
  before), P/E (next and last 12 months) and dividend yield, as external
  readings on the four conditions: stored in `fundamentals`, one row per
  reading, never edited; attributed to Yahoo Finance; shown with their
  day; derived only as the target's distance from the latest stored
  price (`between()`). Only on one position's verdict and its
  FUNDAMENTALS tab. They feed `verdict()` by the rows written in
  `src/lib/indicators.ts`: they can turn an ADD into a HOLD, never make
  an ADD; older than 7 days they do not feed it. Sector averages for P/E
  and dividend yield (Damodaran, NYU Stern, yearly) are external
  readings on the same four conditions, shown only beside the company's
  own number in its ⓘ card.
- **News** (13 Oct, "we simply fetch it and show"): headlines with
  publisher, time and link, fetched on open, never stored, never
  summarised, not an input to the verdict.

Insights, Finances' fourth room, was allowed on 2026-10-19 ("go" on the
mockup `design/treasury-mockup/insights.html`, spec
`docs/specs/2026-10-19-insights.md`). Only on that room:

- **Market data, fetched on open** (his words: "DONT SAVE IT TO DB"):
  index and company prices over 1D · 1W · 1M · 1Y, inflation, the Fed
  and ECB rates, ETF holdings and the world split. Attributed and shown
  with the time they were fetched, like news — but never stored, kept on
  the page at most 10 minutes, fetched by one Convex action call on open
  (never a reactive query), and never an input to `verdict()`. The
  change over a period is two fetched prices with both shown.
  Earnings dates of held companies were added on 2026-10-22 ("go —
  window next 14 days / last 7, yes add the earnings line" on the mockup
  `design/treasury-mockup/earnings.html`), on the same terms and only on
  MINE's boxes: the next results day within 14 days, or the last within
  7 with the move since the close before it — two fetched prices, both
  shown on its card. They reach the read and ASK as facts (`earn-…`),
  never `verdict()`.
  The same dates may ring the phone (22 Oct, N3, "go — build N3 as the
  mockup, yes CLAUDE.md line for earnings" on
  `design/notifications-mockup/n3.html`): fetched once by the 21:30
  evening job, never stored, two days before a results day and on the
  first stored close after it — that close and the stored close before
  it both on the push (`src/lib/investAlert.ts`).
- **CLOSE, the day's report** (22 Oct, his "report opens in Insights as
  CLOSE, one push at 21:30, rules 1 and 2 as you say"): one push a day
  at 21:30 Lisbon, after the US close, opening Insights' CLOSE tab. Two
  rules for it only: (1) the day's change of worth — worth now minus
  worth at the last stored close of the day before, both always shown,
  ▲/▼ green or red, nothing stored, only on CLOSE and its push; (2)
  "major news" is chosen by the app, never a model: the headlines of the
  three biggest movers held and of any company reporting, and (his
  "small block for overall market news") the market's day — the S&P 500,
  Nasdaq 100, Stoxx 600 and Bitcoin over 1D, as MARKET fetches them —
  with the newest two S&P 500 headlines; all fetched on open like news,
  never stored, never summarised.
- **A model's market read**, on a press only: a headline, two plain
  sentences and 3–5 lines, each of a kind from a fixed list (inflation,
  rates, market, allocation, don't, no data) that picks its icon. The
  numbers under a line are the app's own facts, printed by the app; the
  model's words quote numbers only from those facts or from a source it
  links. Nothing it says is stored as a number. The model, the time, the
  tokens, the cost and who paid are always shown, with RESEARCH · NOT
  ADVICE. Missing data is said as ❔ NO DATA, never guessed.
- **Ideas**: 2–4 tickers not owned, named by the read with a why, a bull,
  a bear and a wrong-if in words; every number on the card fetched by the
  app. Badged MODEL · NOT ADVICE. Never a sell, never a € amount, never a
  score.
- **ASK**: questions answered by the same model on the same facts, a 🌐
  switch for web search per question; answers stay on the screen, not in
  the database.
  Asked for ideas (21 Oct, "go on ideas in ASK" on the mockup
  `design/treasury-mockup/ask-ideas.html`), an answer may name up to
  three tickers not owned and not in NEXT, on the same terms as Ideas
  below: a why, a bull, a bear and a wrong-if in words, every number on
  their cards fetched by the app, MODEL · NOT ADVICE, gone with the
  thread.
- **Explanations may be sentences** ("for not smart person like me I
  want more like explanation"): behind an ⓘ card and a WHAT IT MEANS
  tap only. The screen itself stays badges and numbers.
- **Cost**: paid only on a press, no automatic run, no automatic retry.
  On localhost the read and ASK go through Claude Code on his Mac (his
  Pro plan; the one Start server function allowed for it); deployed,
  through the API, stopped at $2 a month counted from each response's
  usage. His Anthropic Console spend limit is the ceiling behind it.

The fourth was added deliberately, on 2026-09-09, because money cannot be
tracked without prices that come from outside. That is the bar for adding
another: a real thing the app must show, and a written set of conditions that
keep it auditable. Not convenience.

`monthSix()` returns Today's six (`PLAN.md` §3 item 4, 17 Oct);
`monthCounts()` keeps the older six-tile shape for Review's weeks. Neither
is derived from the `area` enum, deliberately.

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

One exception (27 Oct, "go" on the mockup `design/firstrun-mockup/demo.html`,
spec `docs/specs/2026-10-27-demo-account.md`): the **demo account**, his
other Gmail, so a friend can hold his phone without seeing his money. Made-up
rows live on the real app in that account only — marked `demo` on its
profile by `demo:make`, an internal mutation run with the deploy key, and
written only by `convex/fake/story.ts`. Every public write refuses it
(`convex/write.ts`, held by a lint rule), so does every paid model, and
every one of its screens carries `DEMO · FAKE DATA` — its numbers are not
reality, and the badge says so. His own account never gets the mark.

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

## Deploying dev (18 Oct)

Every branch shares one dev Convex backend, and a deploy replaces its
functions with exactly what the pushing checkout has — another branch's new
functions vanish (Review broke twice on 15 Oct). Each deploy also re-runs
every open tab's queries, which are paid reads. Artem, planning 5–10 parallel
sessions: "Its gonna be many deploys and I gonna spend 7$ again?"

On 21 Oct the rule that sessions never deploy was dropped. Every session
ended with "say deploy dev" and stopped, so nothing reached localhost and he
never tested: "We constantly have this 'deploy dev when ready' and never
test locally." He said "yes change".

1. **While building, tests run on the local e2e backend**, which costs
   nothing. A hook refuses `npx convex dev` without `--local`; dev is
   reached only through `pnpm deploy:dev`.
2. **`pnpm deploy:dev` deploys everything open at once**: `origin/master`,
   with every unmerged `feat/` `fix/` `perf/` `refactor/` `claude/` branch
   pushed in the last 3 days merged on top (not one whose PR was closed
   unmerged), from a throwaway worktree. A branch that conflicts is left
   out and named. Because it carries every open branch, one session's
   deploy never drops another's functions.
3. **A branch ready for his check is put in front of him by the session,
   in the same turn**: push → `pnpm deploy:dev --dry-run`, then
   `pnpm deploy:dev` → the main checkout onto the branch (only when it
   holds nothing of another chat's — check first) → the app on :3000 →
   a look in the browser pane that the screen loads. Then he gets
   "open localhost:3000" and 2–3 things to press. Never "say deploy dev",
   never a command for him to type. A branch with no `convex/` change
   skips the deploy.
4. **Once per branch ready, not per edit.** Fixes from his check are
   tested locally and deployed together when he is to look again. Each
   deploy re-runs every open tab's queries (paid reads) — say the cost
   line ([[say-the-convex-cost]]).
5. After a merge, the session deploys master the same way and puts :3000
   back on master.

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
   the spec text → e2e tests first → build until green → he tests the
   branch on localhost with his own data → PR with screenshots → merge.
   (15 Oct: "We should test by me and then PR" — no PR while he tests.)
2. **Checks sized to the change (12 Oct).** Artem, waiting ten minutes
   on a two-line fix: "all this verification slow down everything badly
   … We need to verify not on every turn." Before the 12th every PR owed
   the full `pnpm verify`; now:
   - **A fix or a small change:** `pnpm typecheck && pnpm lint`, the unit
     tests of what changed, and only the spec files it touches
     (`pnpm exec playwright test e2e/<file>`). About two minutes. GitHub
     runs typecheck, lint, format, every unit test and the build on the PR.
   - **A new screen or a slice:** the full `pnpm verify` once, on the
     final branch — in the background, never while he waits on a reply.
   - Red means no PR. Say in the PR which of the two was run.
3. **Tests run on mock data only** — the `e2e` skill. Never press a
   write on his real account to check something.
4. **Every write answers**: "saving…" at once, a landed screen, then it
   closes. An e2e test asserts all three.
5. **Small**: a PR under ~600 changed lines, never over 1000; a file
   under ~500 lines (split, don't grow). The `session-guard` hook says
   when a branch is too big or a session too long. One exception (22
   Oct, his "one PR for a slice I've tested", after saying "next" four
   times through a chain of five): a slice he has said "works" on goes
   in as one PR, whatever its size, with auto-merge — never a chain of
   dependent PRs. The PR body says it is over the limit by this rule.
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
