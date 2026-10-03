# Flow — the journey (3 Oct)

Artem, 3 Oct: "I want to see one view of movements of all sources." Agreed
the same day: that list lives in Flow, not on a page of its own. From the
2 Oct plan: moves between his accounts as their own thing, bills found
from statements, a calendar without dropdowns, colour by state and not
gold everywhere. From 27 Sep: "I'm afraid you gonna build more FORMs …
and shitty ass lists. I want to make it smart and useful."

Journey only. No layout, no code until his yes.

**His answer (3 Oct):** "yes, all 5 but flow should be useful, i
actually analyze my spending and future." So Flow is not only what
happened — it is where he studies his spending and looks ahead. Steps 7
and 8 and questions 6–8 below were added for that.

## When he opens it

**Who and when.** Him, once or twice a week: after payday, after an
UPDATE ALL drop, or when a balance on Overview looks off.

**What he wants to know**, in this order:

1. "Where did my money go this month?"
2. "What is still coming out before the next salary?"
3. "What exactly happened?" — every movement, from every account, in one
   place.
4. "Is my spending growing, and on what?"
5. "What does the next months look like — how much will I have?"

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
   the app sees the same payee each month at a similar amount and puts
   it on its day by itself, tagged NEW for a week — no question (3 Oct:
   asking about a €5.99 Uber One is "a lot of hustle"; the mortgage,
   Vodafone, the gym are what he means by bills). A wrong one gets
   × not a bill on its row and is never found again. A bill it cannot
   know (paid once: a yearly insurance, a club just joined) he adds
   from the payment itself — tap it in movements → repeats every month /
   every year, nothing typed. + bill opens with the likely bills already
   in his statements (payees outside everyday spending, not yet a bill)
   — pick monthly or yearly (3 Oct: "most likely those bills are in
   statements"). Typing one line is only for a bill not paid yet. Each bill sits on
   its day: ✓ paid (matched to the statement row by
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

7. **"How my spending is changing."** Each group over the last six
   months, side by side: mortgage flat, groceries up, subscriptions
   creeping. What grew most since last month is said in one line on top
   ("Eating out €210, up €85 on August"), tap opens both months' rows.
   The small things add up here — forty €2 coffees from a Revolut
   statement show as one €80 group, which he would never log by hand.
   Subscriptions also as a year: "€412 a year on 9 subscriptions".
8. **"The months ahead."** From now to three months out: salary in on
   its day, every known bill out on its day, yearly ones too (insurance,
   a domain). The line is what he has today, moved only by those known
   things — "after the mortgage on the 5th, before salary on the 27th:
   €1,940". Beside it, what the rest (groceries, eating out, …) cost in
   each of the last three months, as a real range ("€640–€910"), not a
   guess folded into the line.

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
- Bills: `recurring` rows the app found (minus the ones he struck out); "paid" is the statement row
  linked to it (`meta.recurringId`) — the row is the evidence.
- Changing: the same monthly sums per group, six months of them.
- Months ahead: today's balances (state) plus the bills and salary he
  confirmed, on their days — "left after bills", pick E of 26 Sep. The
  range is last three months' real sums, shown apart from the line.
- Nothing else is derived. A guessed bill is a question until he answers.

## Open questions (my recommendation first)

1–5 answered yes, 3 Oct. 6–8 answered yes, 3 Oct, with: "important
thing is to show future spendings, especially reoccurring". So in step 8
the recurring payments ahead come first and in full — each one by date,
name, amount and the account it leaves from, with a mark when that
account will not hold enough on the day — and the line comes second.

New, for steps 7 and 8:

6. **Ahead: which money?** Free cash in banks and Cash only — broker
   cash stays out (it is waiting to be invested, not for bills). Say if
   Trading 212's cash should count.
7. **Ahead: spending in the line, or beside it?** Beside it, as last
   three months' range. Folding an average into the line makes a number
   that never happened ("not simple average cheap slop").
   **Changed 3 Oct, his call:** everything is IN by default — bills,
   salary and the rest of his spending as a range: top edge spent like
   the cheapest of the last three real months, bottom like the dearest.
   A range, never an average. A toggle, "only bills and salary", shows
   the old step line.
8. **How far ahead?** Three months, with yearly bills inside it marked;
   a twelve-month view of bills only ("what I pay this year") one tap
   away.

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
5. **Bills found: how sure before adding?** Same payee in at least
   two of the last three months, amounts within 10%. Fewer false adds;
   a missed bill can still be added by hand.
