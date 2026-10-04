import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import schema from './schema'
import { merchantKey } from '../src/lib/intake'
import { payeeKey } from '../src/lib/payee'
import { payeeIdOf } from '../src/lib/payees'
import { LENT, SUBSCRIPTIONS } from '../src/lib/money'
import { billFromRow } from './recurring'
import { pairLent } from './lent'

/* Payees (4 Oct; design/treasury-mockup/payees.html): who a row is paid
   to, in his words. Naming one names every row of it, past and next. */

const MAX_NAME = 40
const ROWS = 5000

const lineOf = (l: Doc<'logs'>) =>
  l.meta?.raw ?? l.meta?.merchant ?? l.text ?? ''

async function moneyRows(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db
    .query('logs')
    .withIndex('by_owner_area_time', (q) =>
      q.eq('ownerId', ownerId).eq('area', 'money'),
    )
    .order('desc')
    .take(ROWS)
}

/** Every payee he has named. */
export const list = query({
  args: {},
  returns: v.array(schema.doc('payees')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('payees')
      .withIndex('by_owner_key', (q) => q.eq('ownerId', ownerId))
      .take(1000)
  },
})

/**
 * "Who is this?" — name the payee of a row. Every row of that payee shows
 * the name; the group, when given, moves them all (and, unless it is a
 * PayPal mandate, the reader's rule, so the next statement comes in
 * filed); a bill paid to it takes the name too. Returns the rows it
 * covers.
 */
export const set = mutation({
  args: {
    logId: v.id('logs'),
    name: v.string(),
    domain: v.union(v.string(), v.null()),
    category: v.union(v.string(), v.null()),
    partOf: v.union(v.string(), v.null()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) throw new Error('No such row')
    const name = args.name.trim()
    if (name.length === 0) throw new ConvexError('Say who it is.')
    if (name.length > MAX_NAME) throw new ConvexError('That name is too long.')
    const domain = args.domain?.trim().toLowerCase() || undefined
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new ConvexError('That is not a site.')
    }
    const partOf = args.partOf?.trim() || undefined
    const key = payeeIdOf(lineOf(log))
    if (key === '') throw new ConvexError('This row has no payee to name.')
    const category = args.category?.trim().toLowerCase() || undefined
    /* "I lent it" files this payment only (see logs.refile). */
    if (category === LENT) {
      if (log.kind === 'expense') {
        await ctx.db.patch(log._id, { meta: { ...log.meta, category } })
        await pairLent(ctx, ownerId)
      }
    }
    const group = category === LENT ? undefined : category

    /* PayPal is a middleman (4 Oct: "sometimes paypal is preply, sometimes
       I buy clothes online"): its mandate is his PayPal account, not a
       shop. A PayPal row is named on its own — this payment only. */
    if (key.startsWith('PAYPAL')) {
      await ctx.db.patch(log._id, {
        meta: {
          ...log.meta,
          payee: name,
          ...(group && log.kind === 'expense' ? { category: group } : {}),
        },
      })
      if (group === SUBSCRIPTIONS && log.kind === 'expense') {
        const fresh = await ctx.db.get(log._id)
        if (fresh) await billFromRow(ctx, ownerId, fresh, 'monthly')
      }
      return 1
    }

    const had = await ctx.db
      .query('payees')
      .withIndex('by_owner_key', (q) => q.eq('ownerId', ownerId).eq('key', key))
      .first()
    const fields = { name, domain, partOf, updatedAt: Date.now() }
    if (had) await ctx.db.patch(had._id, fields)
    else await ctx.db.insert('payees', { ownerId, key, ...fields })

    const rows = (await moneyRows(ctx, ownerId)).filter(
      (l) => payeeIdOf(lineOf(l)) === key,
    )
    if (group) {
      for (const l of rows) {
        if (l.kind !== 'expense' || l.meta?.category === group) continue
        await ctx.db.patch(l._id, { meta: { ...l.meta, category: group } })
      }
      if (!key.startsWith('PAYPAL ')) {
        const mk = merchantKey(log.meta?.merchant ?? log.text ?? '')
        if (mk) {
          const rule = await ctx.db
            .query('merchantRules')
            .withIndex('by_owner_key', (q) =>
              q.eq('ownerId', ownerId).eq('key', mk),
            )
            .first()
          if (rule === null) {
            await ctx.db.insert('merchantRules', {
              ownerId,
              key: mk,
              category: group,
              updatedAt: Date.now(),
            })
          } else {
            await ctx.db.patch(rule._id, {
              category: group,
              updatedAt: Date.now(),
            })
          }
        }
      }
    }

    /* A bill paid to this payee takes his name: it is the same thing. */
    if (!key.startsWith('PAYPAL ')) {
      const base = payeeKey(lineOf(log))
      const bills = await ctx.db
        .query('recurring')
        .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
        .take(100)
      for (const b of bills) {
        if (b.matchKey === base && b.name !== name) {
          await ctx.db.patch(b._id, { name, foundAt: undefined })
        }
      }
    }
    /* Subscriptions are bills: this payment makes one (see logs.refile). */
    if (group === SUBSCRIPTIONS && log.kind === 'expense') {
      const fresh = await ctx.db.get(log._id)
      if (fresh) await billFromRow(ctx, ownerId, fresh, 'monthly')
    }
    return rows.length
  },
})

/** The names he gave single PayPal payments, newest first ("Preply",
    "Zalando"): offered as one tap on the next one. */
export const paypalNames = query({
  args: {},
  returns: v.array(
    v.object({ name: v.string(), category: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const out = new Map<string, string | null>()
    for (const l of await moneyRows(ctx, ownerId)) {
      const name = l.meta?.payee
      if (!name || out.has(name)) continue
      out.set(name, l.meta?.category ?? null)
      if (out.size >= 8) break
    }
    return [...out.entries()].map(([name, category]) => ({ name, category }))
  },
})
