# SOLO LEVELING

Personal operating system for one user.
`GOAL → PROJECT → TASK → SCHEDULE → ACTION → RESULT → REVIEW → ADJUST`

- **`PLAN.md`** — the spec: architecture, data model, layout, phases.
- **`CLAUDE.md`** — the standing rules for anyone (human or agent) writing code here.
- **`design/`** — reference material, not app source: the wireframes and the
  Nocturne design system `src/styles/tokens.css` is extracted from, plus the
  source brief.

## Stack

TanStack Start (Vite, React 19) · Convex · Clerk · Tailwind v4 · shadcn/ui,
deployed to Cloudflare Workers.

## Running it

```sh
pnpm install
npx convex dev      # creates the deployment, writes CONVEX_DEPLOYMENT + VITE_CONVEX_URL
pnpm dev
```

`.env.local` needs Convex and Clerk values before the app renders — see
`.env.example`. Clerk needs a JWT template named `convex`, and the Convex
deployment needs `CLERK_JWT_ISSUER_DOMAIN` set on it — per deployment, so dev
and prod each get their own:

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-issuer>
```

There is no `OWNER_ID`. Every row carries an `ownerId` and every function opens
with `requireUser(ctx)` from `convex/auth.ts` (PLAN.md §3b.4), so the database
is scoped by who is signed in rather than by a deployment variable.

The database starts empty on purpose — everything is created through the UI. The
one exception is the six principles:

```sh
npx convex run seed:run '{"ownerId":"<the Owner ID shown on /settings>"}'
```

`seed:clear` takes the same argument and undoes it. The ownerId is Clerk's
opaque token identifier, so read it off the page rather than building it.

## Checks

The same four commands CI runs, in the same order:

```sh
pnpm typecheck   # the app against the DOM, convex/ against the Convex runtime
pnpm lint
pnpm check       # prettier
pnpm test        # vitest + convex-test
pnpm build       # what `pnpm deploy` does first
```

`pnpm format` fixes what `check` and `lint` complain about.

## Deploying

A merge to `master` deploys, once the checks above pass. One job, in
`.github/workflows/ci.yml`:

```sh
convex deploy --cmd 'pnpm build'   # schema + functions to prod Convex, and a
                                   # build with VITE_CONVEX_URL already set to it
wrangler deploy                    # the worker
```

The two steps are one command on purpose. Building separately is how the site
ends up serving production against a development backend.

**Three GitHub secrets** make it work:

| secret                       | where it comes from                               |
| ---------------------------- | ------------------------------------------------- |
| `CONVEX_DEPLOY_KEY`          | Convex dashboard → Production → Deploy key        |
| `CLOUDFLARE_API_TOKEN`       | Cloudflare → API tokens → Edit Cloudflare Workers |
| `VITE_CLERK_PUBLISHABLE_KEY` | the `pk_...` in `.env.local` — public by design   |

`CLERK_SECRET_KEY` is deliberately **not** among them. It belongs to the running
worker, not to the build, and is set once:

```sh
npx wrangler secret put CLERK_SECRET_KEY
```

The production Convex deployment needs `CLERK_JWT_ISSUER_DOMAIN` set on it, the
same way dev does — without it, prod trusts nobody and every query refuses.
Principles are seeded there once, by hand, with `--prod`.
