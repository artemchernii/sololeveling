# READ, about his money — plain lines with a move each (29 Oct)

Approved: "Go" on `design/treasury-mockup/read-personal.html` (round 2,
commit 4d9bd34). Round 1 was rejected: "alignment is shit, words are
weird, I dont understand LLM style of text, make it more readable for
normal human".

**Waits for IDEAS.** The build starts after the IDEAS board
(`docs/specs/2026-10-29-ideas-board.md`, session `ideas-board`) is merged:
both change the same Insights files, and READ's buttons open IDEAS lines.

## Journey (his yes, 29 Oct)

1. He opens Finances → Insights → READ after CLOSE or on a weekend. Each
   line says what happened in plain words, with a line icon. No emoji.
2. Under it, what it means for his money in €, from his own numbers. He
   is 33, lives in Portugal, earns and spends in euros. Portugal facts
   where they fit: 28% tax on gains, the ECB rate (not the Fed) for cash.
3. Each line ends with one move: a button that says it in words and opens
   that line on the IDEAS board ("Move €9,000 to XEON", "Buy Alphabet for
   €2,500"), and ✦ Ask. A line with nothing to do says "No action".
4. HOW IT IS MADE is gone. On the right: THIS WEEK, the moves in € with
   their total and "Open the plan in Ideas", and one quiet line on where
   the data comes from.

His words that shape it: "too many emojis", "HOW IT IS MADE … not
needed", "personalized … call to action … how it relates to me",
"Remove that crap not advice".

## The screen (match the mockup)

Two columns on desktop: lines ~⅔, THIS WEEK ~⅓ sticky. Phone: one
column, THIS WEEK first, boxes stacked.

1. **Head**: "This week's read · <day>", the model's headline and two
   plain sentences; model · time · tokens · cost · who paid, ↻ READ
   AGAIN. Six facts in plain labels: Total, Cash (% of total), In banks,
   Broker cash, Investments (% in the US), Spending a month (last 3
   months). Under them: age · country · currency, from the profile.
2. **A line**, everything on one left edge after a 40px icon:
   - kind in caps (INFLATION, INTEREST RATES, MARKETS, MIX, DON'T,
     NO DATA) with its icon and colour, source and day on the right;
   - title, one plain sentence (the model's);
   - one plain line under it (the model's);
   - three equal boxes: label · number · what the number is
     ("Lost to prices in a year · −€1,743 · 3.8% of €45,858"). Red or
     green only on a box that is a loss or a gain;
   - a row: the move button + one plain hint ("earns about €180 a year at
     2.0%"), or "No action"; ✦ Ask on the right.
3. **THIS WEEK**: total € of the moves, "to put to work, out of €X
   cash", a bar by IDEAS part colour, one row per move (logo, name,
   ticker · Ideas, part, €), "Open the plan in Ideas". With no moves:
   a tick, "No action", and the same button.
4. Footer line: "Data from Eurostat, BLS, the Fed, the ECB and Yahoo
   Finance. Account numbers as of <time>."

Words: plain short sentences are allowed on READ (his round 2). No
dot-chained caps shorthand, no "·"-joined labels inside a box. The
banned list in CLAUDE.md still holds.

## Numbers and where they come from

- **His numbers** (total, cash split, investments, shares by region and
  sector, gold %, spending a month): the app's existing queries, as IDEAS
  reads them. Age and country from the profile (ask him to add a birth
  year if the profile has none — do not hard-code 33).
- **Outside numbers** (euro and US inflation, Fed and ECB rates, 10Y,
  EUR/USD, gold): fetched on open as MARKET does, attributed, never stored.
- **The € boxes are the app's sums, never the model's** (allowed by his
  "Go" on a mockup that showed them): one of his numbers × one fetched
  rate, both always printed under the result. In `src/lib/readMine.ts`,
  each a fact key the model may name:
  - `cash-lost-year` = cash × euro inflation
  - `us-eur` = investments × US share
  - `dollar-gain-month` = `us-eur` × EUR/USD move since the 1st
  - `gold-tax-now` = gold gain × 28% (gain from the round held now, as
    PAID counts it; Portugal's 28% as a constant with its source)
  - `xeon-year` = an IDEAS amount × the ECB rate (the hint under a move)
    Nothing is stored; a missing input makes the box ❔ No data.
- **The moves come from IDEAS, not from the model's READ answer.** The
  model names an IDEAS ticker per line (`idea: 'XEON'` or none); the app
  looks it up in the latest IDEAS read and takes the words, part and €
  from there. A ticker not on the board → no button. No IDEAS read yet →
  no buttons, THIS WEEK says "No plan yet" and offers to open IDEAS.
- **Convex cost**: one read row per READ AGAIN, as today. No new reactive
  query over fetched data.

## The model's job (prompt change in `marketRead.ts`)

Add his profile (age, country, currency, tax 28%) and the `readMine`
facts to the inputs. Per line: kind, title, sub, three fact keys, and
`idea` (an IDEAS ticker or null). Rules: say what it means for his money,
in plain words a normal person reads once; no shorthand; quote numbers
only from facts.

## Order of work (one PR at the end, his "works" first)

1. `readMine.ts` + tests (each sum, missing inputs → no data).
2. Prompt + checker: new fields, `idea` validated against the IDEAS read;
   canned answer for e2e.
3. ReadLines: the new line layout, head facts, THIS WEEK; remove HOW IT
   IS MADE, the NOT ADVICE badge and the emoji kinds.
4. Buttons open IDEAS with that line lit; ✦ Ask on the line.
5. Phone layout.
6. e2e on the mock backend: lines render with three boxes, a move opens
   IDEAS on its line, NO DATA box, no-moves week, READ AGAIN shows saving
   → landed.

## Done when

He opens READ on localhost with his dev data, reads each line once and
knows what it means for his money, presses a move and lands on that IDEAS
line, and says "works".
