# N4 — Ask replies ring the phone (DRAFT, waits his go)

Journey (draft, from his R7 and N1 words; for his yes): on the iPhone he
opens the app, presses ✦ Ask, types "What did I actually do in August?"
and locks the phone or goes to another app — an answer takes 20–90 s.
When it lands the phone rings: `✦ Ask · AUG 1 – 31` with the answer's
headline. He taps it; the app opens on the ⌘J drawer at that answer, the
question marked `📲 ANSWERED 14:07`, the tiles and rows as R7 shows them.
If he stayed on the screen, nothing rings. A few times a month.

Look: `design/notifications-mockup/n4.html` (launch `notify-n4`, :3972,
served from the repo root; the app inside the phone is
`design/ask-mockup/index.html` at phone width).

## What changes, and why

The phone is the deployed app (workers.dev), so it always asks through
the API action (`ai.rowsAsk.ask`), which already reads the rows itself.
A Convex action runs to the end even when the page that called it is gone
— but today its answer goes back only to that page, so a locked phone
loses an answer that was paid for. N4:

1. The action, when it ends (answered or failed), writes one
   `askReplies` row: question, period, the model's answer and stamp — not
   the rows or the counts, which are read again on open.
2. It schedules `askReplies.ring` 15 s later. The page, if it got the
   answer while on screen (`visibilityState === 'visible'`), marks the
   row seen and nothing rings. Else `ring` calls `notifyOwner`
   (kind `ask_reply`) → bell row + push to every device.
3. A tap opens `/dashboard?ask=<id>`; the drawer opens on that turn, the
   rows are read again and counted, and the row is deleted. Unopened rows
   are deleted after 24 h.

This is the one change to R7's "not saved": an answer waits on the
server until opened, at most 24 h; the thread itself still lives only on
the page.

## Scenarios

- S1 answer lands while the page is hidden → push `✦ Ask · <range>` with
  the headline; bell row; tap → drawer open on the answer, `📲 ANSWERED`.
- S2 answer lands on screen → no push, row deleted.
- S3 the call fails while hidden → push `✕ Ask · NOT REACHED`, body
  `$0.00 · NOTHING PAID · <question>`; tap → ✕ NOT REACHED, ↻ ASK AGAIN.
- S4 opened from the home icon (not the push) with an answer waiting →
  the drawer opens on it.
- S5 a row unopened for 24 h is gone; the push's link then opens an
  empty drawer.
- Convex: `askReplies` owner-scoped (another owner's id is refused);
  `ring` skips a seen row; `seen` deletes.

## Data

No new number. The answer's numbers are R7's counts, recounted on open
from the rows (sources 1 and 3). The push body is the model's headline.
Convex cost: one small row and one scheduled function per question.

## Out of scope

Insights ASK (its facts are market data, "DONT SAVE IT TO DB");
localhost answers (Claude Code runs inside the open Mac tab, a closed tab
loses it); the Review and Insights reads (stored already, could ring
later).

## Questions (each with my pick)

1. Which replies ring — ★ ⌘J answers that land while the app is not on
   screen, deployed only. Alt: every ⌘J answer, also on screen.
2. Failures ring too — ★ yes, so ↻ ASK AGAIN is one tap away.
3. Insights ASK — ★ no (it would store market data). Alt: ring with the
   headline only, nothing to reopen.
