# SOLO LEVELING

A personal operating system for one person: the day, the work, the body,
the languages and the money, in one dark, quiet app.

`GOAL → PROJECT → TASK → SCHEDULE → ACTION → RESULT → REVIEW → ADJUST`

It is built around one rule: **reality over gamification.** No points, no
streak scores, no invented percentages. Every number on screen is something
that happened (a logged row), something that is (the latest state), something
that exists (a project, a task), or a dated reading from outside (a share
price). If a number cannot say where it came from, it is not shown.

> Work in progress, used every day. Finances is being built now; the rest is
> in use and gets reworked as it is lived with.

## What is in it

| Group     | Page      | What it does                                                                                         | State        |
| --------- | --------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| **Now**   | Today     | The morning screen: the six principles, today's timeline, three tasks for the day, the month's count | in use       |
|           | Calendar  | Events and scheduled tasks; drag to move, any duration                                               | in use       |
|           | Review    | The weekly look back                                                                                 | next         |
| **Build** | Projects  | A project's tasks, notes, files, hours and GitHub commits                                            | in use       |
|           | Goals     | Goals with targets, milestones and deadlines                                                         | in use       |
|           | Backlog   | Every task not picked for today — and the only place they appear                                     | in use       |
|           | Notes     | The knowledge base: kinds, images, PDFs, YouTube, prompts to copy back out                           | in use       |
| **Track** | Finances  | Net worth, spending by month, accounts and portfolio — fed by bank files, not forms                  | **building** |
|           | Body      | Workouts per day, sessions, weight against a target                                                  | in use       |
|           | Languages | A tab per language: classes, homework, level, and class sheets read by AI                            | in use       |

Plus **Quick capture (⌘L)** — `workout 60`, `spend 48 groceries`,
`weight 75.4`, `note …` — logged in under three seconds from anywhere, and
**Settings** for areas, theme and account.

Three limits are enforced in the data, not suggested in the UI: **three tasks
a day**, **no backlog total on the morning screen**, and **ticking a task is
not proof you did it** — real activity is its own logged row.

Coming after Finances: Review → Today rework → sharing with friends (R8) →
polish, with Ask AI (⌘-chat over your own rows) placed along the way.

## Stack

TanStack Start (Vite, React 19) · Convex · Clerk · Tailwind v4 · shadcn/ui,
deployed to Cloudflare Workers. The design system is
Nocturne (`src/styles/tokens.css`).

## Where things are

| Path             | What                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `PLAN.md`        | The spec: architecture, data model, the map of pages, the build order     |
| `CLAUDE.md`      | The standing rules for anyone — human or agent — writing code here        |
| `docs/journeys/` | Each thing you do on a page → its screen, code, Convex functions and test |
| `docs/specs/`    | One spec per slice, written before it is built                            |
| `convex/`        | Schema, functions, and `aggregate.ts` — the only place numbers are made   |
| `src/`           | The app: routes, components, `lib/` parsers and mappers                   |
| `e2e/`           | Playwright tests, run against a throwaway local backend                   |
| `design/`        | Reference only: wireframes, the Nocturne source, the original brief       |

## How work is done

Every screen or feature is a **slice**: a short spec with test scenarios →
a mockup approved before code → e2e tests first → build until green → a PR
with screenshots → tried on real data → merged (merge commits, conventional
messages, never squashed). Small PRs, small files.

## Running it

```sh
pnpm install
npx convex dev      # creates the deployment, writes CONVEX_DEPLOYMENT + VITE_CONVEX_URL
pnpm dev
```

`.env.local` needs Convex and Clerk values before the app renders — see
`.env.example`. Clerk needs a JWT template named `convex`, and each Convex
deployment (dev and prod) needs `CLERK_JWT_ISSUER_DOMAIN`:

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-issuer>
```

There is no `OWNER_ID`. Every row carries an `ownerId` and every function opens
with `requireUser(ctx)` from `convex/auth.ts`, so the data is scoped by who is
signed in.

The database starts empty on purpose — everything is created through the UI.
The one exception is the six principles:

```sh
npx convex run seed:run '{"ownerId":"<the Owner ID shown on /settings>"}'
```

`seed:clear` takes the same argument and undoes it.

## Checks

```sh
pnpm verify      # everything below, in order — green before every PR
```

| Command          | What it runs                                                  |
| ---------------- | ------------------------------------------------------------- |
| `pnpm typecheck` | the app against the DOM, `convex/` against the Convex runtime |
| `pnpm lint`      | ESLint                                                        |
| `pnpm check`     | Prettier (`pnpm format` fixes it)                             |
| `pnpm test`      | Vitest and convex-test                                        |
| `pnpm build`     | the production build                                          |
| `pnpm e2e`       | Playwright, on a local test backend (:3210) and app (:3200)   |

The e2e tests use mock data only and never touch a real account. First time on
a machine: `pnpm e2e:setup`. CI runs everything except e2e (for now).

## Deploying

A merge to `master` deploys once the checks pass — one job in
`.github/workflows/ci.yml`:

```sh
convex deploy --cmd 'pnpm build'   # schema + functions to prod Convex, built against it
wrangler deploy                    # the worker
```

The two steps are one command on purpose: building separately is how a site
ends up serving production against a development backend.

**GitHub secrets:**

| secret                       | where it comes from                               |
| ---------------------------- | ------------------------------------------------- |
| `CONVEX_DEPLOY_KEY`          | Convex dashboard → Production → Deploy key        |
| `CLOUDFLARE_API_TOKEN`       | Cloudflare → API tokens → Edit Cloudflare Workers |
| `VITE_CLERK_PUBLISHABLE_KEY` | the `pk_...` in `.env.local` — public by design   |

`CLERK_SECRET_KEY` belongs to the running worker, not the build, and is set
once with `npx wrangler secret put CLERK_SECRET_KEY`. Prod Convex needs
`CLERK_JWT_ISSUER_DOMAIN` too — without it every query refuses.

## Backups

```sh
pnpm backup         # prod + dev → ~/Backups/sololeveling (BACKUP_DIR to move it)
pnpm backup:drill   # restore the newest prod snapshot into a throwaway local
                    # backend and check every table came back row for row
```

The drill never touches a real deployment. Restoring for real replaces the
deployment's data and loses anything written after the snapshot:

```sh
npx convex import <snapshot.zip> --replace-all --prod
```
