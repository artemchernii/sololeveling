import { v } from 'convex/values'

import { query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'

/**
 * PLAN.md §3b.4. Clerk proves *who* is calling; this turns that into the
 * `ownerId` every row is scoped by. Call it first in every mutation and every
 * query, then read through an owner-leading index — never `.filter()`.
 *
 * Fails closed: no identity, no ownerId, no read. There is no OWNER_ID env var
 * and no single-user shortcut; a query that could return another user's row is
 * a bug even while there is only one user.
 *
 * `tokenIdentifier`, not `subject`: Convex guarantees it is globally unique
 * across identity providers, where a bare subject only happens to be unique
 * while there is exactly one provider. The cost of being wrong is asymmetric —
 * a longer string in a CLI argument versus backfilling nine tables — and the
 * value is opaque by contract, so it is read from `whoami` below rather than
 * assembled by hand from an issuer and a subject.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    throw new Error('Not signed in')
  }
  return identity.tokenIdentifier
}

/**
 * The one way to see your own ownerId — needed to seed a deployment's
 * principles, and shown on /settings.
 *
 * Returns null rather than throwing for an anonymous caller: "nobody" is a
 * true answer to "who am I", and it lets the page render during SSR before
 * Clerk's token has reached the client. It exposes only the caller's own
 * identity, so it is safe as a public query.
 */
export const whoami = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    return identity?.tokenIdentifier ?? null
  },
})
