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
