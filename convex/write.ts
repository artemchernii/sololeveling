import { ConvexError } from 'convex/values'
import {
  customAction,
  customCtx,
  customMutation,
} from 'convex-helpers/server/customFunctions'

import { internal } from './_generated/api'
import {
  action as rawAction,
  internalQuery,
  mutation as rawMutation,
} from './_generated/server'
import type { QueryCtx } from './_generated/server'

/**
 * The demo account is read-only (27 Oct, docs/specs/2026-10-27-demo-
 * account.md): every public write is built here and refuses it on the
 * server, so a friend holding the phone saves nothing and starts no paid
 * model. Reads, the fetch-on-open market actions and internal functions
 * are untouched. ESLint keeps public writes importing from this file.
 */

async function demoAsking(ctx: Pick<QueryCtx, 'auth' | 'db'>) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return false
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_owner', (q) => q.eq('ownerId', identity.tokenIdentifier))
    .unique()
  return profile?.demo === true
}

/** For actions, which cannot read the database themselves. */
export const isDemo = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => await demoAsking(ctx),
})

const refuse = (code: 'DEMO_READ_ONLY' | 'DEMO_NO_AI') => {
  throw new ConvexError(code)
}

/** A public write: refused for the demo account. */
export const mutation = customMutation(
  rawMutation,
  customCtx(async (ctx) => {
    if (await demoAsking(ctx)) refuse('DEMO_READ_ONLY')
    return {}
  }),
)

/** A write that starts a paid model: refused for the demo account. */
export const aiMutation = customMutation(
  rawMutation,
  customCtx(async (ctx) => {
    if (await demoAsking(ctx)) refuse('DEMO_NO_AI')
    return {}
  }),
)

/** An action that writes or reaches a bank, a broker or a model. */
export const action = customAction(
  rawAction,
  customCtx(async (ctx) => {
    if (await ctx.runQuery(internal.write.isDemo, {})) refuse('DEMO_READ_ONLY')
    return {}
  }),
)

/** An action that asks a paid model. */
export const aiAction = customAction(
  rawAction,
  customCtx(async (ctx) => {
    if (await ctx.runQuery(internal.write.isDemo, {})) refuse('DEMO_NO_AI')
    return {}
  }),
)

/** A write the demo account may make: idempotent, nothing a friend chose
    (areas.ensure, demo.freshen). Each use says why. */
export const openMutation = rawMutation
