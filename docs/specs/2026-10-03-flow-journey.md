# Flow — the journey (3 Oct)

Artem, 3 Oct: "I want to see one view of movements of all sources." Agreed
the same day: that list lives in Flow, not on a page of its own. From the
2 Oct plan: moves between his accounts as their own thing, bills found
from statements, a calendar without dropdowns, colour by state and not
gold everywhere. From 27 Sep: "I'm afraid you gonna build more FORMs …
and shitty ass lists. I want to make it smart and useful."

Journey only. No layout, no code until his yes.

## When he opens it

**Who and when.** Him, once or twice a week: after payday, after an
UPDATE ALL drop, or when a balance on Overview looks off.

**What he wants to know**, in this order:

1. "Where did my money go this month?"
2. "What is still coming out before the next salary?"
3. "What exactly happened?" — every movement, from every account, in one
   place.

**What he does:** reads the top, taps whatever surprises him, lands on
the rows behind it, goes back. He types nothing.

## The steps, in his words

1. **"The month in one line."** At the top: in, out, and what is left,
   for this month, moves between his own accounts not counted. Salary
   marked where it landed. Last month beside it for comparison, green or
   red by state (did more go out than came in), never a grade.
2. **"Where it went."** The few places most of the money went — mortgage,
   groceries, subscriptions, … — as bars, biggest first. Tap one: its
   rows.
3. **"What's still coming."** Bills found in his statements, not typed:
   the app sees the same payee each month at a similar amount and asks
   once — "Netflix, about €13, monthly — a bill?" Yes or no. After that
   each bill sits on its day: ✓ paid (matched to the statement row by
   itself) or still to come before payday. Salary the same way.
4. **"One view of movements of all sources."** Every row from every
   account, newest first, grouped by day, each with its bank's logo:
   money in green, money out red. Tap a logo to see one account only.
   Search by name.
5. **"Money between my accounts is not spending."** A move — BPI to
   ActivoBank, a top-up into Trade Republic, an ATM withdrawal into Cash —
   is one row, not two, in grey: "BPI → ActivoBank". It never counts as
   in or out.
6. **"Which day?"** The month as a strip of days, a mark on each day
   something moved and on each bill's day. Tap a day: the list jumps to
   it. No dropdowns anywhere.

## What it is not

- No form. Nothing to fill in to make the page work; files and the
  reader feed it. Adding a row by hand stays behind + / ⌘L.
- No budget or limit (removed 26 Sep), no score, no "you saved".
- No count of rows ("214 movements"). The list just scrolls.
- Not the chart — that is Overview's ACCOUNTS.
- Not lent / paid back with people yet — that is the next slice, (b).

## Where the numbers come from

- In, out, left, where it went: sums of logged rows over the month, one
  currency, moves excluded, each sum opening its rows (PLAN.md §1, the
  sums allowed 26 Sep).
- Moves: the rows already filed as his own money (`ownMoneyMoves`), paired
  by the two accounts.
- Bills: `recurring` rows he said yes to; "paid" is the statement row
  linked to it (`meta.recurringId`) — the row is the evidence.
- Nothing new is derived. A guessed bill is a question until he answers.

## Open questions (my recommendation first)

1. **Which month — calendar or payday to payday?** Calendar month: it is
   what statements and Overview's "this month" use. Payday is a mark on
   it, not the edge.
2. **The list: everything, or behind a tap?** Everything, on the page,
   under the three answers — it is the thing he asked for. Shows the
   last 30 days, then "earlier" loads more.
3. **Where-it-went groups: from where?** The category the reader already
   gives each statement row; he can correct one once and the payee
   remembers it. No category picker on every row.
4. **The current calendar and Bills cards:** replaced by steps 3 and 6,
   not kept beside them. One page, not three half-ones.
5. **Bill suggestions: how sure before asking?** Same payee in at least
   two of the last three months, amounts within 10%. Fewer false asks;
   a missed bill can still be added by hand.
