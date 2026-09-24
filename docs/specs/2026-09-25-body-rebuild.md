# Body rebuild — the Languages treatment (R6b-a, 25 Sep)

Written after the build: Artem asked for it to be built now ("where are
some programs, good UI, knowledge base and proper logging?"). Kept as the
record, per CLAUDE.md.

## What got built

- **Hero** — Body identity, latest weigh-in (state), days-in-30 per kind
  (`aggregate.categoryDays`), 12-week strip. The picture is the Next-up kind:
  his photo from `public/body/` once sent (`PHOTOS` in `kinds.tsx`), a large
  faded icon until then.
- **Log a session** — Mobility / Gym / Boxing / Hike, one tap = one
  `workout` log (what the Today tile counts), with this month's count.
- **Next up** — one routine for today from `nextRoutine` (tested, pure):
  mobility first, a rested gym day by oldest, then the rest. Words, no number.
- **My routines** — a card per picked program day; each exercise: dose,
  week dots, DID (`drills.did`), opens to why / steps / avoid.
- **Library** — five programs in `src/lib/body/library.ts`: lower-back
  mobility, hips & hamstrings, full-body gym A/B, boxing at home, hiking
  legs. Add / Remove via `drills.addProgram` / `drills.dropProgram`
  (ref = `day--exercise`, group = the program's kind; drop retires, logs stay).
  Every program carries the physio safety line.
- **Done** — by day, icon per kind, category chip (stretch shows as mobility).

## Done when

Pick the lower-back program from the library, open an exercise to read how,
press DID and see it tick; press Mobility session and see it on the hero
strip and the Today tile.

## Open

- Photos: one per kind (mobility, gym, boxing, hiking) into `public/body/`.
