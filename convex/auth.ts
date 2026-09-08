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
 * On `subject` vs `tokenIdentifier`: Convex's own guidelines prefer
 * `tokenIdentifier` (`{issuer}|{subject}`) as a global identity key, because a
 * bare subject could collide across two auth providers. PLAN.md §3b.4 specifies
 * `identity.subject`, and this app has exactly one provider, so subject is
 * unique here — and it is the value you can read off a Clerk dashboard and pass
 * to `seed:run`. Both break identically if the Clerk instance is replaced.
 * If a second provider is ever added, this one line is what changes, plus a
 * backfill of every table.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    throw new Error('Not signed in')
  }
  return identity.subject
}
