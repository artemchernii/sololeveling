# ✦ ASK on cards

Journey: once a month, after payday, he reads Insights. A card makes him
wonder — AVGO says WAIT, tech is 41% — and he wants the why without
typing it. He presses the small ✦ on that card; the ASK drawer opens with
the question already in the box; he sends it as it is, edits it, or
closes the drawer. Nothing is sent and nothing is paid until he presses
ASK (21 Oct, his idea; mockup `design/treasury-mockup/ask-on-cards.html`).

Screens/files: `ReadLines` (a ✦ ASK pill beside WHAT IT MEANS and → TAB),
`Mine` `Box` (a ✦ in the top-right corner), `Allocation` row (a ✦ at the
end), `IdeaCard` in NEXT (a ✦ ASK pill under WRONG IF; not on the cards
inside an ASK answer). `AskDrawer` takes an `ask(question)` from the room
(a `useAskPrefill` store beside `useAsk`); `Ask` puts it in the box, lights
the box, focuses it on a wide screen. Pure builders in
`src/lib/askOnCards.ts`. Journey map: `docs/journeys/finances.md`, the
Insights ASK row.

Questions (the app's words, from the card's own words and numbers, no
model call):

- read line: `<title> — why?`
- position: `Why is AVGO WAIT?` (its call); `Why is OZON FROZEN?`; no
  call: `What moved BTC −4.1% in 1M?`; no call and no move:
  `What about BTC?`
- allocation line: `Why is tech 41%, world 26%?`; no world number:
  `Why is gold 6%?`; MISSING: `Why is health MISSING?`
- idea: `What could go wrong with JNJ?`

Scenarios:

- S1 READ: ✦ on a line → drawer open, box holds `<title> — why?`, the
  thread unchanged, no ask call made.
- S2 MINE: ✦ on a box → `Why is <SYM> <CALL>?`; ✦ on an allocation line →
  `Why is tech N%, world M%?`. Nothing sent.
- S3 IDEAS: ✦ ASK on a card → `What could go wrong with <TICKER>?`, edit
  it, press ASK → it is asked like any typed question.
- S4 a second ✦ replaces the box's text; while an answer is asking the box
  is filled but ASK stays off until it lands.
- S5 phone width: the ✦ on a box is always shown (no hover), the drawer
  is the bottom sheet, the keyboard stays down.

Data: none new — every word and number is already on the card.

Out of scope: auto-send, a ✦ on MARKET cards, keeping the question
anywhere.
