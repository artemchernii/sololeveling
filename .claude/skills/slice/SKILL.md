---
name: slice
description: The SOLO LEVELING build loop for any new or changed screen or feature — spec with test scenarios, Artem's 2-sentence approval with a visual, e2e first, build to green, PR with screenshots. Use before writing any feature code.
---

# A slice: spec → his go → tests → build → his review

One slice = one small PR (aim < 600 changed lines, never > 1000).
Do the steps in order. Do not skip to code.

## 1. Spec (for me) — `docs/specs/YYYY-MM-DD-<name>.md`

```
# <name>
Journey: when he opens it, what he wants, what he does next (his words).
Screens/files: which components, Convex functions, journey map entry.
Scenarios (each becomes one e2e test):
  S1 <given> → <he does> → <he sees>   [states: empty | one | many | error | slow]
  S2 every write: pressed → "saving…" at once → landed tick → closes
Data: which of the four sources each number comes from (CLAUDE.md).
Out of scope: …
Questions: … (each with my recommendation)
```

Scenario checklist — every slice covers: empty state · one item · many
items · a failed write · a slow write (pending shown) · phone width ·
dark theme. Words: plain, no meta labels ([[plain-ui-words]] in memory).

## 2. His approval — 1–2 plain sentences + something to see

Never the spec text. Example: "After you press add, you see a tick and
'Revolut is up to date'. Here's the picture." Visual = a mockup on
:3950 (`design/treasury-mockup/`) or a screenshot. Wait for "go".

### Look before he looks (10 Oct)

Artem: "we need some common sense rules somewhere because I don't have to
tell you it jumps, alignment is bad, spacing is bad." Run this on every
state of a mockup or a built screen before sending it. Measure in the
browser pane; do not judge from the code.

1. **Start from what is built.** Open the screen he has today and keep
   what he likes; say in the reply what is kept. Compare side by side.
2. **Nothing jumps.** Walk every step: a window changes height only
   between steps, and glides when it does. Lines keep their height while
   their text changes. Read the heights with `getBoundingClientRect`.
3. **No dead space.** No fixed heights to hide a jump. Content fills its
   box; the gap under the last thing is 0.
4. **One axis.** Under a centred block, the next row is centred too.
   Cards in a row share a height; things in a row share a baseline.
5. **Room.** Nothing touches its edge: a logo sits 6px or more inside its
   chip, text 12px or more from a border.
6. **Alive.** What moves in the app moves in the mockup (the breathing
   drop edge, things arriving). A state that matters — saved, stopped,
   not finished — has an icon, a colour and motion, never grey words.
7. **Only what applies.** No step, button or label that means nothing in
   this state (a typed number shows no "drop · read").
8. **Words.** "You", never "he". Plain ([[plain-ui-words]]).
9. **Both widths.** His window (about 950px) and a phone.

## 3. Tests first

Write the e2e scenarios (`e2e/<area>.spec.ts`, see the `e2e` skill) and
convex-test cases for any write. They fail. Commit them.

## 4. Build until green

`pnpm verify` passes. Look at every screenshot in `e2e/screens/`
against the mockup — layout, words, motion. Fix before he sees it.
Update `docs/journeys/<area>.md` with the path the slice touches.

## 5. PR → his review

PR body: 2 sentences, screenshots/video, one thing to press on
localhost with his own data. Merge only after he says so. Merge commit,
conventional commits, never squash.

## Stop and ask when

A number has no sanctioned source · the mockup and the spec disagree ·
the PR would pass 1000 lines (split it) · the hook says start a new
session (write the handoff memory first).
