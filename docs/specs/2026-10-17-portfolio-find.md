# Portfolio: find and sort

Journey (his words, 17 Oct): 20+ positions and "the list is getting long".
He opens Finances → Portfolio wanting one position — "NVIDIA", or a
ticker — or wanting the list in an order (by worth, P&L, name). He types a
few letters, sees only the rows that match, presses one and lands on its
page. Several times a week, on the laptop (~950px) and the phone.

Mockup: `design/treasury-mockup/find.html` (:3950).

Screens/files: `PortfolioList.tsx` (field, pills, filtering),
`src/lib/owned.ts` (`ordered` gains `name`, a `matches()` helper),
`docs/journeys/finances.md`. No Convex change, no new reads: rows are
already loaded by `aggregate.positions`.

What changes in what he sees:
- A field under the list's title: `NAME OR TICKER`, `/` to jump to it,
  × and Esc clear it. Matches any listing's name or ticker, letters
  matched in lavender. Not kept: empty on every open.
- Sort pills: BIGGEST · UP MOST · DOWN MOST (as built) · A–Z. The choice
  is kept on this device (`portfolio-sort`, like `position-tab`).
- Title while searching: `EVERYTHING OWNED · 2 OF 22`.
- Sold rows are searched too; `SOLD · n` counts the matches, and opens
  by itself when only sold rows match.
- No match: `0 FOUND` · `"ORACLE"` · CLEAR.
- The field shows only with more than 5 rows (owned and sold).

Scenarios (e2e/portfolio-find.spec.ts, mock data):
  S1 many positions → type part of a name → only matching rows, `n OF m`
  S2 type a ticker → that row; press it → its page
  S3 type a sold thing's name → SOLD · 1 opens with it
  S4 type nonsense → 0 FOUND; CLEAR → every row back
  S5 press A–Z → rows by name; reload → A–Z still on
  S6 few positions → no field
  S7 phone width → field full width, no sideways scroll

Data: no new number. `n OF m` is an entity count of rows already shown.

Out of scope: tags/sector filter (next slice "tags + map"), searching
inside the account cards, a sort by euros gained.

Questions:
- UP MOST / DOWN MOST stay by percent as built (recommend: yes).
