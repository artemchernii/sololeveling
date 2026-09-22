# PLAN.md — how we got here

Dated reasoning moved out of `PLAN.md` §4 on 22 Sep so the plan reads as rules and a map. Nothing here overrides `PLAN.md`; the binding outcomes are summarized there under "Settled along the way".

**The order changed on 20 Sep: R6's area rework comes before R4.** Artem hit the same wall twice
in one day — a goal with nowhere to go but the wrong area, then a task on SoloLeveling badged
`business` when it is a pet project and `life` when that means nothing. A fixed enum cannot be
made to fit by choosing more carefully, and every screen that shows an area shows the wrong
answer until it is data he edits. Notes as the knowledge base (R4) is still wanted — he has asked
for prompts, screenshots and MD files twice — but it is a capability the app lacks, not a wrong
answer the app keeps repeating. Wrong answers come first. R4 follows R6, and R5 and R7 keep their
places.

**R6 is not a rename (added 20 Sep; the row was finally rewritten to match on 21 Sep).** The
row used to say "Languages (schema change)", which read as `portuguese` → `languages`. It is
more than that. Artem tried to file a goal under
**English** and found there was nowhere to put it: `area` is a fixed enum in
`convex/schema.ts`, so the set of areas is something only a deploy can change. R6 must make
areas **data he edits** — add one, rename one, retire one — which reaches the seven area
colour tokens (`--area-*` cannot be a static class per area), `src/lib/nav.ts`, the capture
parser's area words, and every table carrying `area`. What it must **not** reach is
`monthCounts()`: the six tiles are a fixed shape and are deliberately not derived from the
area enum (§3 item 4), and that stays true however many areas exist.

**R6 was split on 21 Sep, and three things were settled with it.** The three TRACK pages moved
to their own row (R6b): the areas rework alone reaches six tables, the colour tokens, the nav,
the capture parser and every screen that shows a badge, and Languages in particular is better
built _after_ an area is something you can invent — a tab per language you have filed something
under, rather than a fixed three. The decisions the plan is written on:

- **An area's identity is a slug, and its name is data.** An `areas` row carries a permanent
  `slug` ('body') and an editable `label`. Every table keeps `area` as that slug, so no row is
  rewritten, `logs.by_owner_area_time` is untouched, the capture verbs keep naming their area
  statically, and `monthCounts()`'s tile rules keep matching. Renaming changes what you read,
  never what is stored.
- **A theme owns lightness and chroma; an area owns its hue.** `--area-l` and `--area-c` are
  declared once per theme, and an area's colour is `oklch(var(--area-l) var(--area-c) <hue>)`.
  This is what lets the set be open-ended and still keeps the rule that no area is louder than
  another, and it keeps the 265–305° gap round the accent enforceable as a check rather than a
  convention.
- **A capture verb's area stays in code.** `gym` files under the `body` slug however that area
  is named. Retiring one it needs sends its verbs somewhere instead — see below.

**What measuring changed while R6 was built (21 Sep).** Two of the three decisions survived
untouched; the third did not, and two holes turned up that no amount of planning had found:

- **Retiring by refusal would have been a dead feature.** The rule as written was "refuse the
  retire and name the verbs". Counted against the parser, nine of the ten areas are named by a
  verb — only `projects` is not — so the refusal would never not have fired. It became one
  guard and one mechanism: an area one of the six tiles counts cannot be retired at all, and
  any other retires with a `replacedBy` its verbs follow, resolved in one hop.
- **A built-in slug has to be legal before its row exists.** `areas.ensure` runs when the
  settings editor mounts, and nothing makes anyone go there first — so the guard as designed
  threw `NO_SUCH_AREA` on the first `gym` of a fresh deployment. The ten are the union the
  schema used to hold; they pass whether or not a row is there yet.
- **`areas.remove` was missing.** Retiring says "I stopped tracking this" and keeps the row so
  the rows under it keep a name and a colour. There was no way to say "I typed that wrong". It
  refuses a built-in, and refuses any area something is filed under.

**A money target needs a fifth source, and does not have one (20 Sep).** Asked for a month
tile target of "€100" rather than a count. A tile's number is the denominator of a real bar,
counted from `logs` rows; a sum of logged amounts is none of the four sanctioned sources in
§1. Until that question is answered — a new source with written conditions, or a
`stateSnapshots` balance read against nothing — a tile keeps its count and may show the
goal's free-text `targetLabel` beside it as words. It belongs with R6 Finances.

**R6b was split again on 21 Sep, into R6b-a (Body) and R6b-b (Languages).**
One spec covers both — `docs/superpowers/specs/2026-09-21-r6b-body-and-languages-design.md` —
and Body shipped first because Languages reuses its `DayStrip`, its category
chip and `aggregate.categoryDays`. Finances is excluded from that spec
entirely: a sum of logged amounts is none of the four sanctioned sources, and
that question gets its own spec rather than holding up two pages that do not
need it answered.

**What Body's design changed (21 Sep).** §3 promised "Gym · Stretch · Boxing ·
Other, weight progress against a target". Two of those did not survive contact
with what he actually wanted. Consistency is the page's spine, not weight —
"what is most important is consistency" — so the first section is a strip per
category and weight is the second. And the four kinds are a starting set
rather than a list: the type lives in `logs.meta.category` as a plain string,
set by the verb and editable in the capture chip, because a fixed set of words
is the thing R6 was spent unlearning. `stretch` did not exist as a verb and
now does; `run` existed and was not in the four.

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
