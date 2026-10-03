# Chart by account — the journey (3 Oct)

Artem, 3 Oct: "I want to see one view of movements of all sources +
graph with sources and different lines." Later, on the Overview chart:
"chart with different sources. Like this screenshot but different banks,
dynamic and so on. But make it smart."

Agreed the same day: the all-sources list of movements belongs in Flow;
this is the chart. Journey only — no layout, no code until his yes.

## When he opens it

**Who and when.** Him, on Overview, a few times a week, after a payday or
a bulk update. It is the chart he already looks at, read another way.

**What he wants to know:** "Where is my money, and what moved it?" Not a
total that jumps: which account went up or down, and why.

**What he does:** looks at the lines, taps the one that moved, sees the
rows behind the move, goes back.

## The steps, in his words

1. **"One line per bank."** BPI, Revolut, ActivoBank, Trade Republic,
   Trading 212, Cash — each in its own colour, on the same € axis, over
   the same 1M / 3M / 6M / 1Y. A broker's line is its cash and shares
   together.
2. **"I see which one moved."** Next to each name: what it holds now and
   the change over the chosen period, green up, red down ("BPI €5,077
   ▼ €1,640 in 3M").
3. **"A bank appearing is not money arriving."** An account's line starts
   the day the app first knows it, with a small tag ("Trading 212 joined ·
   3 Oct"). No line is drawn before it, and the total no longer looks like
   €15,000 landed in a day.
4. **"Money between my accounts is not a loss."** €1,100 from BPI to
   ActivoBank: one line down, one up, the same day, joined by a thin mark
   saying it was a move between his own accounts.
5. **"I tap a point and see why."** The rows of that account on that day
   (or week, on 1Y): what came in, what went out, the move and where to.
   Tap again or BACK to return.
6. **"I can hide one."** Tap a name to turn its line off — e.g. Trading
   212's €13k of cash, to see the banks at their own scale.

## What it is not

- Not a new page or sidebar entry: a fourth view on the chart he has
  (TOTAL · FREE CASH · INVESTED · **ACCOUNTS**).
- No line drawn where no balance or row exists; no smoothing that invents
  a value between two readings.
- Not a list of every movement — that is Flow, next.

## Where the numbers come from

Each line is the account's own stored balances and logged rows, the same
ones `aggregate.worthHistory` already adds up for TOTAL — split by account
instead of summed. Prices for brokers' shares as now (Yahoo closes, or
the broker's screen for a frozen share). Nothing new is derived.

## Open questions (my recommendation first)

1. **Lines or stacked bands?** Lines, as he said — each account at its own
   height. Stacked bands show the total, but TOTAL already does.
2. **Where does it live?** A fourth button, ACCOUNTS, beside TOTAL / FREE
   CASH / INVESTED. TOTAL stays what it is.
3. **Small accounts.** ActivoBank at €153 next to Trading 212 at €15k is a
   flat line on the floor. Recommend: hiding one rescales the axis; no log
   scale (it misleads about size).
