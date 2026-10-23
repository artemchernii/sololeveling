# Model pick on localhost

Journey: Artem runs the app on his Mac more (22 Oct: "locally I want to be
able to change models"). On localhost every AI answer goes through Claude
Code on his Pro plan. He opens ⌘J or Insights ASK, taps the PRO badge,
picks Haiku for a quick count or Opus for a hard question, asks. The pick
stays in that browser until he changes it.

Screens/files: `vite/claudeRead.ts` (model from the body, only the three
ids), `src/lib/claudeResult.ts` (stamp names the asked model, not the first
sonnet in `modelUsage`), `src/lib/marketRead.ts` (`LOCAL_MODELS`,
`localModel()` read/write in localStorage, try/catch), `RowsDrawer.tsx`,
`AskDrawer.tsx`, `ReadHero.tsx`, the three hooks that POST to `/__claude/*`.
Review has no localhost path (API only) — nothing there.

Scenarios (e2e on the mock backend; `/__claude/*` routes stubbed with
`page.route`, since E2E_RUN has no vite route):
S1 localhost path, nothing saved → badge `⚡ PRO · SONNET 5.5` → ask →
the POST carries `claude-sonnet-5-5`, stamp `✦ SONNET 5.5`
S2 pick OPUS 5.5 → menu closes, badge `⚡ PRO · OPUS 5.5` → ask → POST
carries `claude-opus-5-5`, stamp `✦ OPUS 5.5`
S3 reload → still OPUS 5.5 (localStorage); storage throws → SONNET, no crash
S4 API path (no route) → no pick, `💳` badge as today
S5 phone width: badge and ✕ on one line, menu inside the sheet
Unit: the vite route refuses any other id (400); `parseClaudeResult` with
an asked model picks it from `modelUsage`.

Data: no numbers added. Model names only.

Out of scope: the deployed API path (⌘J Haiku 5.5, Insights Sonnet 5.5).

Decided (22 Oct, his "go with B — PRO badge opens the pick, one pick for
every localhost answer, Sonnet 5.5 default"): option B of the mockup
`design/model-pick/`; one pick, default Sonnet 5.5. S6: the pick made on
the Insights read is the ASK drawer's too.
