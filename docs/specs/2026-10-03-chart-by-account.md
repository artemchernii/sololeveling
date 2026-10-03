# Chart by account — spec (3 Oct)

Journey: `2026-10-03-chart-by-account-journey.md` (his yes, 3 Oct).
Mockup: `design/treasury-mockup/accounts-chart.html` on :3950 (his "go
chart", 3 Oct, after v2: a new account is a pin, events in a lane under
the plot, hovering turns the list into that day).

## What gets built

A fourth view on Overview's chart, **ACCOUNTS**, beside TOTAL / FREE CASH
/ INVESTED. TOTAL, FREE CASH and INVESTED do not change.

- One line per live account: its cash and its shares together, per day.
- An account with one day in the range is a **pin** on the right edge
  ("▲ Trading 212 €15,011 · new today"), never the scale.
- The axis fits the lines, four nice steps (1 · 2 · 2.5 · 5 × 10ⁿ).
- An **event lane** under the plot: accounts that joined (grouped within
  a week), and moves between his own accounts — two rows so close days
  don't collide. On the plot a move is only a dashed link.
- The **list** beside the chart: each account now and its change over
  the range (green ▲ / red ▼, or "joined 1 Aug" / "new today"), the total
  under it. Hover: the list shows that day. Tap a name: hide its line,
  the axis rescales.
- **Tap a point**: that account's rows that day, from its sheet's rows.
- Empty states: no accounts; one account ("the others draw here as you
  add them").

## Files

- `convex/aggregate.ts` — `worthHistory` also returns `moves` (own
  transfers in range: day, from, to, amount), read from the logs the
  cash history already reads.
- `src/lib/accountLines.ts` (+ test) — pure: per-account values (cash +
  invested), lined vs pinned, nice scale, join groups, event lane rows.
- `src/components/finances/AccountsChart.tsx` — the SVG view, as the
  mockup draws it. `WorthChart.tsx` shows it for ACCOUNTS.
- `src/styles/tokens.css` — group 11 grows a line colour per bank (its
  own hue where it has one) and four spares, with the reason.

## Where the numbers come from

Sources 1, 2 and 4 as TOTAL already uses them: his balance readings and
logged rows (cash), trades/holdings × stored closes × stored ECB rates
(invested) — split by account instead of summed. The change in the list
is "change since the start of the range" (derivation B, allowed 26 Sep).
Nothing new is derived.

## Done when

On his data: six accounts, Trading 212 a pin, BPI's 1 Sep −€1,100 and
ActivoBank's +€1,100 linked in the lane; hovering 28 Aug turns the list
into 28 Aug; tapping BPI on 1 Sep lists its rows. Side by side with the
mockup in the browser. Typecheck, lint, tests green.

## Open questions

None left — the three in the journey were answered (lines, a fourth
button, no log scale).
