import type { MutationCtx, QueryCtx } from './_generated/server'

/**
 * SOLO LEVELING has exactly one user (PLAN.md §3b.4). Clerk proves *who* is
 * calling; this proves it is *me*. Call it first in every mutation and every
 * non-public query.
 *
 * Fails closed: if OWNER_ID is unset on the deployment, nothing is authorized.
 * An unset variable must never read as "allow".
 */
export async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    throw new Error('Not signed in')
  }

  const ownerId = process.env.OWNER_ID
  if (!ownerId) {
    throw new Error(
      'OWNER_ID is not set on this Convex deployment — refusing every request. ' +
        'Set it with: npx convex env set OWNER_ID <your Clerk user id>',
    )
  }

  if (identity.subject !== ownerId) {
    throw new Error('Not authorized')
  }

  return identity
}
