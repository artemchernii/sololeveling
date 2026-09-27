import { v } from 'convex/values'

import { transferPair } from './logs'
import { internalMutation } from './_generated/server'
import { productIn } from '../src/lib/institutions'

/* One owner's money rows, moved into the "adding money" shape (27 Sep):
   run once per owner (`npx convex run migrations:addingMoney`), safe to
   run again — each step looks before it writes.

   1. An account learns its institution from its name or its logo's site.
   2. An account that was bank AND broker (Revolut) becomes two: the bank,
      and "<name> Invest" holding its trades — so cash into Invest is a
      transfer. Moves that pointed at the account itself point at Invest.
   3. Positions read off a first screenshot are marked `opening`: they
      were held before the app saw the account, and their cost never left
      its cash.
   4. A transfer written as one row gets its other side, so both balances
      know about it. */

export const addingMoney = internalMutation({
  args: { ownerId: v.string() },
  returns: v.object({
    institutions: v.number(),
    split: v.number(),
    opening: v.number(),
    paired: v.number(),
  }),
  handler: async (ctx, { ownerId }) => {
    const done = { institutions: 0, split: 0, opening: 0, paired: 0 }
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)

    for (const a of accounts) {
      if (a.institution !== undefined) continue
      const product = productIn(a.name) ?? productIn(a.domain)
      if (product) {
        await ctx.db.patch(a._id, { institution: product.institution })
        done.institutions++
      }
    }

    for (const a of accounts) {
      if (!(a.kinds.includes('bank') && a.kinds.includes('broker'))) continue
      const fresh = await ctx.db.get(a._id)
      const investId = await ctx.db.insert('accounts', {
        ownerId,
        name: `${a.name} Invest`,
        kinds: ['broker'],
        currencies: ['EUR'],
        domain: a.domain,
        institution: fresh?.institution,
        order: a.order + 0.5,
      })
      await ctx.db.patch(a._id, {
        kinds: a.kinds.filter((k) => k !== 'broker'),
      })
      const trades = await ctx.db
        .query('trades')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', a._id),
        )
        .take(2000)
      for (const t of trades) await ctx.db.patch(t._id, { accountId: investId })
      const logs = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', a._id),
        )
        .take(5000)
      for (const l of logs) {
        if (l.kind === 'move' && l.meta?.otherAccountId === a._id) {
          await ctx.db.patch(l._id, {
            meta: { ...l.meta, otherAccountId: investId },
          })
        }
      }
      done.split++
    }

    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .take(2000)
    for (const t of trades) {
      if (t.importId !== undefined && t.opening === undefined) {
        await ctx.db.patch(t._id, { opening: true })
        done.opening++
      }
    }

    const moves = (
      await ctx.db
        .query('logs')
        .withIndex('by_owner_area_time', (q) =>
          q.eq('ownerId', ownerId).eq('area', 'money'),
        )
        .take(5000)
    ).filter((l) => l.kind === 'move')
    for (const l of moves) {
      const otherId = l.meta?.otherAccountId
      if (otherId === undefined || l.meta?.pairOf !== undefined) continue
      if ((await transferPair(ctx, ownerId, l)) !== null) continue
      const other = await ctx.db.get(otherId)
      const unit = l.unit ?? 'eur'
      if (
        other === null ||
        other.ownerId !== ownerId ||
        other._id === l.accountId ||
        !other.currencies.includes(unit.toUpperCase())
      )
        continue
      await ctx.db.insert('logs', {
        ownerId,
        kind: 'move',
        area: 'money',
        occurredAt: l.occurredAt,
        value: -(l.value ?? 0),
        unit,
        text: l.text,
        accountId: other._id,
        meta: {
          merchant: l.meta?.merchant,
          raw: l.meta?.raw,
          intakeId: l.meta?.intakeId,
          otherAccountId: l.accountId,
          pairOf: l._id,
        },
      })
      done.paired++
    }
    return done
  },
})
