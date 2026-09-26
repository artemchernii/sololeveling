# Later — opening the app to other people (26 Sep, a plan, not a row yet)

Artem: "If and when I want to share this tool with someone, we need to
make some changes so other people can log in, add their objectives, API
keys and start working/improving. Right? It is possible?"

Yes. This is the plan, written now so it is not re-derived later. It is
**not** the next row: his order (26 Sep) is Finances → Review → Today →
**Sharing** → polish. When its turn comes, this becomes the one-page spec,
re-read against whatever changed in between.

## What is already right

Every table carries `ownerId` with an owner-scoped index, and every query
and mutation opens with `requireUser(ctx)` and reads through that index
(CLAUDE.md, "Data and auth"). A second person signing in sees only their
own rows. No rewrite is needed; the work is in the edges.

## What has to change

1. **Real sign-up.** Clerk's production instance on a domain he owns
   (PLAN.md §4 "Late"). It carries the dev-vs-prod data decision: which
   deployment is his real data, and how his `ownerId` (the Clerk
   `tokenIdentifier`, which changes between Clerk instances) is carried
   over — a one-off migration of `ownerId` on every table.
2. **A first-run setup instead of his defaults.** Things that are his
   today: the six principles `seed.ts` inserts, "Good morning, ARTEM", the
   Body photo and quote, Portuguese as the default language, the workout
   guide's six workouts. A new person gets three steps — their name, the
   areas they care about, the language they are learning — and otherwise
   the empty states that already exist (nothing is seeded).
3. **AI keys.** Two ways; the choice is the open question below.
   - **His key, a cap per person.** The Vault's 30-in-30-days cap already
     counts per owner, so a friend costs at most ~30¢ a month. No new code
     beyond a per-person switch.
   - **Each person's own key.** A settings field; keys stored encrypted in
     Convex (an encryption key in the environment, never the plain key in
     a row), read only inside the action that calls the model.
4. **Trust.** Their data lives in his Convex account, so he could read it.
   Said plainly to friends; a short privacy note beyond them. A
   **"delete my account and data"** button — every table by owner, every
   stored file — which a real app needs anyway.
5. **Improving it** is not this row. Working on the code means being a
   collaborator on the GitHub repo, which already works.

## Done when (draft)

A friend signs up on the real domain, goes through the three steps, logs
a workout and reads a class sheet, sees none of Artem's rows, and can
delete everything they made with one button. Artem's own data is
unchanged.

## Open questions (my pick first)

1. **Whose key?** _Pick: his key with the per-person cap_, until more
   than a handful of people use it.
2. **Invite-only or open sign-up?** _Pick: invite-only_ (Clerk allowlist)
   — it is a personal tool shared with friends, not a product.
3. **Finances for others?** Money is the most personal data here. _Pick:
   design F1–F3 so nothing in them assumes one person_, and decide at
   this row whether Finances is on for invited people.
