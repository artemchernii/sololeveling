# Delete account (R8 · S3b)

Journey: a guest who wants out opens Settings. The last card says what the
app holds of theirs — rows, files, the account's email. One press arms it
(NO UNDO · KEEP / DELETE ALL); DELETE ALL counts down while their rows go,
then their Clerk account is deleted and the sign-in page says
`✓ DELETED · N ROWS · F FILES · ACCOUNT`. Artem never has the card. His
words, 27 Oct: "delete only for guests", then "go on the delete mockup"
(`design/firstrun-mockup/delete.html`).

## Functions

- `account.counts` — for a guest, rows (profile and `intakeTrades`
  included) and stored files, capped at 4000 (`more`, shown as `4000+`);
  nothing read for anyone else.
- `account.deleteAll` — refuses `NOT_A_GUEST`, schedules `account.wipe`.
- `account.wipe` — 300 rows a run through each table's owner index;
  stored files (`projects.logoId`, `attachments.storageId`,
  `intakes.storageIds`) and pending jobs (`events.remindJob`,
  `closeJobs`/`moneyAlerts.jobId`) go with their rows; an intake's trades
  before the intake; the profile last; schedules itself until done.
- `DeleteAccount` on Settings; the sign-in page reads what went from
  session storage once.

## Scenarios

- D1 guest → counts → DELETE ACCOUNT → NO UNDO → KEEP closes it →
  DELETE ALL → DELETING · n OF N → nothing of theirs left
  (`e2e/delete-account.spec.ts`). Clerk's own delete is aborted in the
  test: the Clerk test user is shared.
- D2 Artem → no card.
- `account.test`: counts; a guest's 320+ rows, task, file and profile gone
  over several runs while Artem's stay; refused for Artem and signed out.

## Out of scope

Clerk's dashboard setting that lets users delete their account (his). AI
keys (S4).
