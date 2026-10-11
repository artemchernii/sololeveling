import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard, history } from './e2e'

/* Mock states of an update for the browser tests (10 Oct) — a read held
   open, a read that failed, a save that stopped. Like convex/e2e.ts,
   every function refuses anywhere but the test backend. */

/* A broker that is only a broker beside Revolut, which is a bank too
   (10 Oct, broker cash): its one cash line is the broker's. */
export const addBroker = mutation({
  args: {},
  returns: v.id('accounts'),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const accountId = await ctx.db.insert('accounts', {
      ownerId,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      domain: 'traderepublic.com',
      institution: 'trade-republic',
      ibanTails: [],
      cardTails: [],
      order: 3,
    })
    await ctx.db.insert('stateSnapshots', {
      ownerId,
      area: 'money',
      key: `balance:${accountId}:EUR`,
      value: 300,
      unit: 'eur',
      recordedAt: Date.now() - 8 * 86_400_000,
      source: 'typed',
    })
    return accountId
  },
})

/* An update with a file still being read (10 Oct) — held there, so a
   test can try to close the window on it. `batchId` adds that file to an
   update that already has one read. */
export const holdRead = mutation({
  args: { batchId: v.optional(v.id('batches')) },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const batchId =
      args.batchId ??
      (await ctx.db.insert('batches', {
        ownerId,
        status: 'open',
        leftOut: [],
        quietMonths: [],
        moves: [],
        extras: [],
        dismissed: [],
      }))
    await ctx.db.insert('intakes', {
      ownerId,
      batchId,
      storageIds: [],
      status: 'reading',
      readingSince: Date.now(),
      progress: { stage: 'rows', rows: 12, have: 0, recent: [] },
      files: [
        {
          name: 'statement-sep.pdf',
          size: 90_000,
          contentType: 'application/pdf',
        },
      ],
    })
    return batchId
  },
})

const BLURRY = 'The picture is too blurry to read the numbers.'

/* The read held by holdRead comes back unreadable. */
export const failRead = mutation({
  args: { batchId: v.id('batches') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const intakes = await ctx.db
      .query('intakes')
      .withIndex('by_owner_batch', (q) =>
        q.eq('ownerId', ownerId).eq('batchId', args.batchId),
      )
      .collect()
    for (const i of intakes)
      if (i.status === 'reading')
        await ctx.db.patch(i._id, {
          status: 'failed',
          error: BLURRY,
          retryable: true,
          progress: undefined,
        })
    return null
  },
})

/* One more file in an update, read and found unreadable. */
export const badFile = mutation({
  args: { batchId: v.id('batches') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    await ctx.db.insert('intakes', {
      ownerId,
      batchId: args.batchId,
      storageIds: [],
      status: 'failed',
      error: BLURRY,
      retryable: true,
      files: [{ name: 'blurry.png', size: 240_000, contentType: 'image/png' }],
    })
    return null
  },
})

/* A save that stopped: the history's update left "applying", with nothing
   scheduled to carry it on. */
export const stuckApply = mutation({
  args: { days: v.array(v.number()) },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const batchId = await history(ctx, ownerId, args.days)
    await ctx.db.patch(batchId, {
      status: 'applying',
      applied: { intakes: 0, rows: 0, accounts: 1 },
    })
    return batchId
  },
})

/* His ActivoBank screenshot of 11 Oct, read and waiting in an update
   (check before saving): €153.21 held with −€1,205.20 pending, the −€700
   top-up already in. `twice`: nothing ties that top-up to another bank's
   file, so the screenshot's row of it looks new. `missing`: the
   screenshot prints €12 less than its rows make. */
export const readActivo = mutation({
  args: {
    as: v.union(v.literal('yours'), v.literal('twice'), v.literal('missing')),
  },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(10)
    const activo = accounts.find((a) => a.name === 'ActivoBank')
    const revolut = accounts.find((a) => a.name === 'Revolut')
    if (!activo || !revolut) throw new Error('reset first')
    const DAY = 86_400_000
    const now = Date.now()
    const held = now - 8 * DAY
    for (const s of await ctx.db
      .query('stateSnapshots')
      .withIndex('by_owner_key_time', (q) =>
        q.eq('ownerId', ownerId).eq('key', `balance:${activo._id}:EUR`),
      )
      .take(20))
      await ctx.db.delete(s._id)
    await ctx.db.insert('stateSnapshots', {
      ownerId,
      area: 'money',
      key: `balance:${activo._id}:EUR`,
      value: 153.21,
      unit: 'eur',
      recordedAt: held,
      source: 'screenshot',
      pending: -1205.2,
    })
    const csv = await ctx.db.insert('intakes', {
      ownerId,
      accountId: revolut._id,
      storageIds: [],
      status: 'done',
      kind: 'transactions',
    })
    await ctx.db.insert('logs', {
      ownerId,
      area: 'money',
      kind: 'move',
      occurredAt: held - 3_600_000,
      value: -700,
      unit: 'eur',
      text: 'Top-up by *2789',
      accountId: activo._id,
      meta: {
        merchant: 'Top-up by *2789',
        raw: 'Top-up by *2789',
        intakeId: args.as === 'twice' ? undefined : csv,
      },
    })
    const batchId = await ctx.db.insert('batches', {
      ownerId,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    const row = (
      ago: number,
      merchant: string,
      raw: string,
      amount: number,
      self = false,
    ) => ({
      occurredAt: now - ago * DAY - 3_600_000,
      merchant,
      raw,
      amount,
      currency: 'EUR',
      pending: false,
      self,
    })
    await ctx.db.insert('intakes', {
      ownerId,
      accountId: activo._id,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: 'ActivoBank',
      institution: 'ActivoBank',
      readAt: now,
      transactions: [
        row(0, 'Transfer to Andrei Pavlov', 'TRF P/ ANDREI PAVLOV', -25),
        row(5, 'Trade Republic', 'COMPRA 2789 TRADE REPUBLIC', -505.2, true),
        row(5, 'Revolut', 'COMPRA 2789 REVOLUT 8134 DUBLIN IE', -700, true),
        row(6, 'Veiga e Seabra', 'COMPRA 2789 EST SERVICO VEIGA', -37.86),
      ],
      balance: {
        currency: 'EUR',
        value: args.as === 'missing' ? 78.35 : 90.35,
        asOf: now - 3_600_000,
      },
      files: [
        { name: 'IMG_9282.PNG', size: 400_000, contentType: 'image/png' },
      ],
    })
    return batchId
  },
})

/* His Trade Republic on 11 Oct, for the account sheet (is the balance
   right): €1,042.46, then €1,543.09 a week later with no row between.
   `found`: ActivoBank's statement shows −€505.20 sent to it three days
   after — the same money less a €4.57 fee. `none`: no account shows it. */
export const sheetGap = mutation({
  args: { as: v.union(v.literal('found'), v.literal('none')) },
  returns: v.id('accounts'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(10)
    const activo = accounts.find((a) => a.name === 'ActivoBank')
    if (!activo) throw new Error('reset first')
    const DAY = 86_400_000
    const now = Date.now()
    const accountId = await ctx.db.insert('accounts', {
      ownerId,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      domain: 'traderepublic.com',
      institution: 'trade-republic',
      ibanTails: [],
      cardTails: [],
      order: 3,
    })
    for (const [ago, value] of [
      [15, 1042.46],
      [8, 1543.09],
    ])
      await ctx.db.insert('stateSnapshots', {
        ownerId,
        area: 'money',
        key: `balance:${accountId}:EUR`,
        value,
        unit: 'eur',
        recordedAt: now - ago * DAY,
        source: 'statement',
      })
    if (args.as === 'none') return accountId
    const file = await ctx.db.insert('intakes', {
      ownerId,
      accountId: activo._id,
      storageIds: [],
      status: 'done',
      kind: 'transactions',
    })
    await ctx.db.insert('logs', {
      ownerId,
      area: 'money',
      kind: 'move',
      occurredAt: now - 5 * DAY,
      value: -505.2,
      unit: 'eur',
      text: 'Trade Republic',
      accountId: activo._id,
      meta: {
        merchant: 'Trade Republic',
        raw: 'COMPRA 2789 TRADE REPUBLIC',
        intakeId: file,
        otherAccountId: accountId,
      },
    })
    return accountId
  },
})
