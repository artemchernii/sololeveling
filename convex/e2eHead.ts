import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

const DAY = 86_400_000

/**
 * A fund held on Revolut whose name says where it invests — Vanguard
 * FTSE Developed Asia Pacific ex Japan, in USD — so a position's head
 * shows its region badge and its currency chip (14 Oct). Test backend
 * only (`guard`).
 */
export const asiaFund = mutation({
  args: {},
  returns: v.id('instruments'),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const revolut = (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .take(10)
    ).find((a) => a.name === 'Revolut')
    if (!revolut) throw new Error('reset first')
    const now = Date.now()
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId,
      symbol: 'VDPG.L',
      name: 'Vanguard FTSE Developed Asia Pacific ex Japan',
      exchange: 'LSE',
      currency: 'USD',
      type: 'ETF',
    })
    await ctx.db.insert('holdings', {
      ownerId,
      accountId: revolut._id,
      instrumentId,
      shares: 12,
      asOf: now,
    })
    await ctx.db.insert('prices', {
      ownerId,
      instrumentId,
      price: 31.2,
      currency: 'USD',
      asOf: now - DAY,
      fetchedAt: now,
      source: 'Yahoo Finance',
    })
    return instrumentId
  },
})
