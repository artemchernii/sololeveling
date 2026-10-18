import { v } from 'convex/values'

import { requireUser } from './auth'
import { guard } from './e2e'
import { mutation } from './_generated/server'

/* Mock steps for a connected bank (docs/specs/2026-10-11-bank-connections.md).
   Test backend only: each opens with requireUser, then the guard. */

/** The bank's approval ran out a minute ago, on every link the test user
    has: what a card shows months after connecting. */
export const end = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const links = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const link of links)
      await ctx.db.patch(link._id, { validUntil: Date.now() - 60_000 })
    return null
  },
})

/** The mock ActivoBank becomes a bank the app can connect: convex/bankApi.ts
    answers for it. Its own step, so no other test's account changes. */
export const reachable = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const a of accounts)
      if (a.name === 'ActivoBank')
        await ctx.db.patch(a._id, { institution: 'activo' })
    return null
  },
})

/** The canned bank's next answer for the connected mock ActivoBank, and
    its last answer made five hours old — so opening Finances asks again.
    `twin` also puts the top-up Revolut's file wrote here yesterday. */
export const answer = mutation({
  args: {
    as: v.union(
      v.literal('two'),
      v.literal('twin'),
      v.literal('many'),
      /* Trading 212's (convex/t212Api.ts). */
      v.literal('traded'),
      v.literal('shares'),
      v.literal('paid'),
      v.literal('deposit'),
      v.literal('early'),
      v.literal('first'),
      v.literal('frozen'),
      v.literal('cash'),
      v.literal('refused'),
      v.literal('down'),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const links = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const link of links) {
      if (link.status !== 'linked' || link.uids === undefined) continue
      await ctx.db.patch(link._id, {
        uids: link.uids.map((u) => ({
          ...u,
          uid: `${u.uid.split(':')[0]}:${args.as}`,
        })),
        checkedAt: Date.now() - 5 * 3_600_000,
      })
      /* Pingo Doce, filed once from a statement under its short name: the
         bank's "COMPRA 2789 PINGO DOCE LISBOA" is the same payee. */
      if (args.as === 'two')
        await ctx.db.insert('merchantRules', {
          ownerId,
          key: 'pingo doce',
          category: 'groceries',
          updatedAt: Date.now(),
        })
      if (args.as === 'twin')
        await ctx.db.insert('logs', {
          ownerId,
          area: 'money',
          kind: 'move',
          occurredAt: Date.now() - 86_400_000,
          value: -700,
          unit: 'eur',
          text: 'Top-up by *2789',
          accountId: link.accountId,
          meta: { merchant: 'Top-up by *2789', raw: 'Top-up by *2789' },
        })
      /* Trading 212's first answer after a file: the buy of three days ago
         is the file's already. */
      if (args.as === 'first' && link.via === 't212') {
        let nvda = null
        for (const h of await ctx.db
          .query('holdings')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ownerId).eq('accountId', link.accountId),
          )
          .take(20)) {
          const inst = await ctx.db.get(h.instrumentId)
          if (inst?.symbol === 'NVDA') nvda = inst
        }
        if (nvda !== null)
          await ctx.db.insert('trades', {
            ownerId,
            accountId: link.accountId,
            instrumentId: nvda._id,
            side: 'buy',
            shares: 1,
            priceEur: 140,
            occurredAt: Date.now() - 72 * 3_600_000,
          })
      }
    }
    /* The €500 Trading 212 says came in, as Revolut's statement saved it:
       a move to an account it did not name. */
    if (args.as === 'deposit') {
      const revolut = (
        await ctx.db
          .query('accounts')
          .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
          .take(50)
      ).find((a) => a.name === 'Revolut')
      if (revolut !== undefined)
        await ctx.db.insert('logs', {
          ownerId,
          area: 'money',
          kind: 'move',
          occurredAt: Date.now() - 20 * 3_600_000,
          value: -500,
          unit: 'eur',
          text: 'To Trading 212',
          accountId: revolut._id,
          meta: { merchant: 'Trading 212', raw: 'To Trading 212' },
        })
    }
    return null
  },
})

/** A Trading 212 account as its last file left it, three days ago: €1,280.30
    free, 8 Nvidia at €150 and 1 ASML at €640 — what the canned Trading 212
    of convex/t212Api.ts answers first. */
export const t212 = mutation({
  args: {},
  returns: v.id('accounts'),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const at = Date.now() - 3 * 86_400_000
    const accountId = await ctx.db.insert('accounts', {
      ownerId,
      name: 'Trading 212',
      kinds: ['broker'],
      currencies: ['EUR'],
      domain: 'trading212.com',
      institution: 'trading-212',
      ibanTails: [],
      cardTails: [],
      order: 9,
    })
    await ctx.db.insert('stateSnapshots', {
      ownerId,
      area: 'money',
      key: `balance:${accountId}:EUR`,
      value: 1280.3,
      unit: 'eur',
      recordedAt: at,
      source: 'statement',
    })
    for (const [symbol, name, isin, shares, price] of [
      ['NVDA', 'NVIDIA Corporation', 'US67066G1040', 8, 150],
      ['ASML.AS', 'ASML Holding N.V.', 'NL0010273215', 1, 640],
    ] as const) {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId,
        symbol,
        name,
        exchange: 'e2e',
        currency: 'EUR',
        type: 'EQUITY',
        isin,
      })
      await ctx.db.insert('holdings', {
        ownerId,
        accountId,
        instrumentId,
        shares,
        asOf: at,
      })
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price,
        currency: 'EUR',
        asOf: at,
        fetchedAt: at,
        source: 'e2e',
      })
    }
    return accountId
  },
})
