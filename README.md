# SOLO LEVELING

Personal operating system for one user.
`GOAL → PROJECT → TASK → SCHEDULE → ACTION → RESULT → REVIEW → ADJUST`

- **`PLAN.md`** — the spec: architecture, data model, layout, phases.
- **`CLAUDE.md`** — the standing rules for anyone (human or agent) writing code here.
- **`2nd version Daily focus with chain model/`** — design reference: wireframes
  and the Nocturne design system the token layer is extracted from.

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
deployment needs `CLERK_JWT_ISSUER_DOMAIN` and `OWNER_ID` set on it:

```sh
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-issuer>
npx convex env set OWNER_ID <your Clerk user id>
```

`OWNER_ID` is the single-user guard. Until it is set, every mutation and private
query refuses.
