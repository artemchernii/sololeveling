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
