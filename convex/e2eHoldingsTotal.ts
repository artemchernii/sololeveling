import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

/* Broker screenshots as the reader returns them, in one drop, for the
   check against the printed total (11 Oct). Trade Republic's 20 positions
   and cash reach its total of €25,125.78; `cut` leaves the last one under
   the edge of the screen, `none` prints no total, `two` adds a Revolut
   screenshot that adds up beside the cut one. Mock numbers. */

const TR: ReadonlyArray<readonly [string, string, number, number]> = [
  ['VWCE.DE', 'Vanguard FTSE All-World', 42.1, 4812.4],
  ['AAPL', 'Apple Inc.', 12, 2461.92],
  ['IWDA.AS', 'iShares Core MSCI World', 18, 1742.04],
  ['SXR8.DE', 'iShares Core S&P 500', 3, 1598.91],
  ['MSFT', 'Microsoft Corporation', 4, 1502.36],
  ['GOOGL', 'Alphabet Inc.', 9, 1388.07],
  ['AMZN', 'Amazon.com, Inc.', 7, 1214.5],
  ['META', 'Meta Platforms, Inc.', 2, 1031.6],
  ['ASML', 'ASML Holding N.V.', 1.5, 968.25],
  ['KO', 'The Coca-Cola Company', 15, 884.1],
  ['SAP', 'SAP SE', 4, 812.3],
  ['V', 'Visa Inc.', 3, 742.8],
  ['NVDA', 'NVIDIA Corporation', 6, 742.18],
  ['TSLA', 'Tesla, Inc.', 3, 702.33],
  ['AMD', 'Advanced Micro Devices, Inc.', 5, 687.15],
  ['NFLX', 'Netflix, Inc.', 1, 618.44],
  ['SHEL', 'Shell plc', 20, 601.75],
  ['NVO', 'Novo Nordisk A/S', 10, 598.2],
  ['ADBE', 'Adobe Inc.', 1, 412.3],
  ['IGLN.L', 'iShares Physical Gold', 7.3654, 398.52],
]

export const screens = mutation({
  args: {
    as: v.union(
      v.literal('same'),
      v.literal('cut'),
      v.literal('none'),
      v.literal('two'),
    ),
  },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(10)
    const revolut = accounts.find((a) => a.name === 'Revolut')
    if (!revolut) throw new Error('reset first')
    const tr = await ctx.db.insert('accounts', {
      ownerId,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      domain: 'traderepublic.com',
      ibanTails: [],
      cardTails: [],
      order: accounts.length,
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
    const now = Date.now()
    const screen = (
      accountId: typeof tr,
      institution: string,
      file: string,
      rows: typeof TR,
      cashEur: number,
      totalEur: number | undefined,
    ) =>
      ctx.db.insert('intakes', {
        ownerId,
        batchId,
        accountId,
        storageIds: [],
        status: 'ready',
        kind: 'holdings',
        title: `${institution} screenshot`,
        institution,
        model: 'Claude Haiku 5.5',
        costUsd: 0.003,
        readAt: now,
        files: [{ name: file, size: 240_000, contentType: 'image/png' }],
        positions: rows.map(([symbol, name, shares, valueEur]) => ({
          name,
          shares,
          valueEur,
          preferred: 0,
          todayPriceEur: Math.round((valueEur / shares) * 100) / 100,
          todayAsOf: now,
          candidates: [
            {
              symbol,
              name,
              exchange: 'NMS',
              type: /iShares|Vanguard/.test(name) ? 'ETF' : 'EQUITY',
            },
          ],
        })),
        cashEur,
        totalEur,
      })
    if (args.as === 'two')
      await screen(
        revolut._id,
        'Revolut',
        'IMG_9302.png',
        [TR[1], TR[4]].map(
          ([s, n, sh], i) => [s, n, sh, [400, 380][i]] as const,
        ),
        120,
        900,
      )
    await screen(
      tr,
      'Trade Republic',
      'IMG_9301.png',
      args.as === 'cut' || args.as === 'two' ? TR.slice(0, 19) : TR,
      1205.66,
      args.as === 'none' ? undefined : 25125.78,
    )
    return batchId
  },
})
