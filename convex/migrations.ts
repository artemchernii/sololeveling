import { v } from 'convex/values'

import { transferPair } from './logs'
import { internalMutation } from './_generated/server'
import { productIn } from '../src/lib/institutions'

/* One owner's money rows, moved into the "adding money" shape (27 Sep):
   run once per owner (`npx convex run migrations:addingMoney`), safe to
   run again — each step looks before it writes.

   1. An account learns its institution from its name or its logo's site.
   2. A "<bank> Invest" account (split off by this migration's first
      version, reversed the same day: "REVOLUT IS BANK AND BROKER") is
      joined back into its bank — its trades and rows move over, the
      Invest side of a bank → Invest transfer goes, and the bank is a
      broker too.
   3. Positions read off a first screenshot are marked `opening`: they
      were held before the app saw the account, and their cost never left
      its cash.
   4. A transfer written as one row gets its other side, so both balances
      know about it. */

export const addingMoney = internalMutation({
  args: { ownerId: v.string() },
  returns: v.object({
    institutions: v.number(),
    joined: v.number(),
    opening: v.number(),
    paired: v.number(),
  }),
  handler: async (ctx, { ownerId }) => {
    const done = { institutions: 0, joined: 0, opening: 0, paired: 0 }
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

    /* "<bank> Invest" back into its bank: one account, bank and broker.
       Read again — step 1 just taught them their institutions. */
    const known = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const inv of known) {
      if (!inv.name.endsWith(' Invest')) continue
      const bank = known.find(
        (x) =>
          x._id !== inv._id &&
          (x.institution === undefined
            ? false
            : x.institution === inv.institution) &&
          x.kinds.includes('bank'),
      )
      if (bank === undefined) continue
      const trades = await ctx.db
        .query('trades')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', inv._id),
        )
        .take(2000)
      for (const t of trades) await ctx.db.patch(t._id, { accountId: bank._id })
      const logs = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', inv._id),
        )
        .take(5000)
      for (const l of logs) {
        /* The Invest side of a bank → Invest transfer goes; the bank side
           stays as money into its own stocks. */
        if (l.kind === 'move' && l.meta?.otherAccountId === bank._id) {
          const pair = await transferPair(ctx, ownerId, l)
          if (pair !== null) {
            await ctx.db.patch(pair._id, {
              meta: {
                ...pair.meta,
                otherAccountId: bank._id,
                pairOf: undefined,
              },
            })
          }
          await ctx.db.delete(l._id)
          continue
        }
        await ctx.db.patch(l._id, { accountId: bank._id })
      }
      const pointing = await ctx.db
        .query('logs')
        .withIndex('by_owner_area_time', (q) =>
          q.eq('ownerId', ownerId).eq('area', 'money'),
        )
        .take(5000)
      for (const l of pointing) {
        if (l.meta?.otherAccountId === inv._id) {
          await ctx.db.patch(l._id, {
            meta: { ...l.meta, otherAccountId: bank._id },
          })
        }
      }
      for (const currency of inv.currencies) {
        const readings = await ctx.db
          .query('stateSnapshots')
          .withIndex('by_owner_key_time', (q) =>
            q
              .eq('ownerId', ownerId)
              .eq('key', `balance:${inv._id}:${currency}`),
          )
          .take(1000)
        for (const r of readings) await ctx.db.delete(r._id)
      }
      const fresh = await ctx.db.get(bank._id)
      if (fresh && !fresh.kinds.includes('broker')) {
        await ctx.db.patch(bank._id, { kinds: [...fresh.kinds, 'broker'] })
      }
      await ctx.db.delete(inv._id)
      done.joined++
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
