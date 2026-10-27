import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { movedSince } from './reads/moves'
import { guard } from './e2e'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

/* Canned readings for a transfer matched before saving (12 Oct,
   docs/specs/2026-10-11-transfer-match.md), from his rows of 3–6 Oct.
   Like convex/e2e.ts, it refuses anywhere but the test backend. */

const DAY = 86_400_000

async function balance(
  ctx: MutationCtx,
  ownerId: string,
  accountId: Id<'accounts'>,
  value: number,
  recordedAt: number,
  pending?: number,
) {
  const key = `balance:${accountId}:EUR`
  for (const s of await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q.eq('ownerId', ownerId).eq('key', key),
    )
    .take(20))
    await ctx.db.delete(s._id)
  await ctx.db.insert('stateSnapshots', {
    ownerId,
    area: 'money',
    key,
    value,
    unit: 'eur',
    recordedAt,
    source: 'screenshot',
    pending,
  })
}

/* `added`: Revolut's file wrote ActivoBank's side of the €700 top-up;
   ActivoBank's screenshot shows it three days later as a card payment.
   `fee`: ActivoBank sent Trade Republic €505.20, its file shows €500.63.
   `drop`: Revolut's file and ActivoBank's screenshot in one drop. */
export const read = mutation({
  args: {
    as: v.union(
      v.literal('added'),
      v.literal('unnamed'),
      v.literal('fee'),
      v.literal('drop'),
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
    const activo = accounts.find((a) => a.name === 'ActivoBank')
    const revolut = accounts.find((a) => a.name === 'Revolut')
    if (!activo || !revolut) throw new Error('reset first')
    const now = Date.now()
    const at = (ago: number) => now - ago * DAY - 3_600_000
    const file = (accountId: Id<'accounts'>) =>
      ctx.db.insert('intakes', {
        ownerId,
        accountId,
        storageIds: [],
        status: 'done',
        kind: 'transactions',
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
      occurredAt: at(ago),
      merchant,
      raw,
      amount,
      currency: 'EUR',
      pending: false,
      self,
    })
    const dropped = (
      accountId: Id<'accounts'>,
      title: string,
      transactions: Array<ReturnType<typeof row>>,
      value: number,
      image: boolean,
    ) =>
      ctx.db.insert('intakes', {
        ownerId,
        accountId,
        batchId,
        storageIds: [],
        status: 'ready',
        kind: 'transactions',
        title,
        institution: title,
        readAt: now,
        transactions,
        balance: { currency: 'EUR', value, asOf: now - 3_600_000 },
        files: [
          image
            ? { name: 'IMG_9282.PNG', size: 400_000, contentType: 'image/png' }
            : { name: 'statement.csv', size: 9_000, contentType: 'text/csv' },
        ],
      })
    /* `unnamed`: the top-up's line names no account (19 Oct, his BPI
       screenshot: "Diversos", an IBAN and nothing else). */
    const screenshot = (first: number, broker = true, unnamed = false) =>
      dropped(
        activo._id,
        'ActivoBank',
        [
          row(0, 'Transfer to Andrei Pavlov', 'TRF P/ ANDREI PAVLOV', -25),
          ...(broker
            ? [row(5, 'Trade Republic', 'COMPRA 2789 TRADE REPUBLIC', -505.2)]
            : []),
          unnamed
            ? row(5, 'Diversos', 'TRF SEPA+ INST 23 P/ PT50000000000001', -700)
            : row(
                5,
                'COMPRA 2789 REVOLUT',
                'COMPRA 2789 REVOLUT 8134 DUBLIN',
                -700,
              ),
          row(6, 'Veiga e Seabra', 'COMPRA 2789 EST SERVICO VEIGA', -37.86),
        ],
        first,
        true,
      )

    if (args.as === 'added' || args.as === 'unnamed') {
      await balance(ctx, ownerId, activo._id, 153.21, at(8), -1205.2)
      const csv = await file(revolut._id)
      const base = {
        ownerId,
        area: 'money' as const,
        kind: 'move' as const,
        occurredAt: at(8) - 3_600_000,
        unit: 'eur',
        text: 'Top-up by *2789',
      }
      const out = await ctx.db.insert('logs', {
        ...base,
        value: -700,
        accountId: activo._id,
        meta: {
          merchant: 'Top-up by *2789',
          raw: 'Top-up by *2789',
          intakeId: csv,
          otherAccountId: revolut._id,
        },
      })
      await ctx.db.insert('logs', {
        ...base,
        value: 700,
        accountId: revolut._id,
        meta: {
          merchant: 'Top-up by *2789',
          intakeId: csv,
          otherAccountId: activo._id,
          pairOf: out,
        },
      })
      await screenshot(90.35, true, args.as === 'unnamed')
      return batchId
    }

    if (args.as === 'drop') {
      await balance(ctx, ownerId, activo._id, 853.21, at(10))
      await balance(ctx, ownerId, revolut._id, 389.2, at(10))
      /* What the test account's own rows moved since, so the file's
         balance is the one its rows make. */
      const moved =
        (
          await movedSince(
            ctx,
            ownerId,
            revolut,
            'EUR',
            at(10),
            now + 5 * 3_600_000,
          )
        ).cents / 100
      await dropped(
        revolut._id,
        'Revolut',
        [row(8, 'Top-up by *2789', 'Top-up by *2789', 700, true)],
        Math.round((389.2 + moved + 700) * 100) / 100,
        false,
      )
      await screenshot(90.35, false)
      return batchId
    }

    const tr =
      accounts.find((a) => a.name === 'Trade Republic')?._id ??
      (await ctx.db.insert('accounts', {
        ownerId,
        name: 'Trade Republic',
        kinds: ['broker'],
        currencies: ['EUR'],
        domain: 'traderepublic.com',
        institution: 'trade-republic',
        ibanTails: [],
        cardTails: [],
        order: 3,
      }))
    await balance(ctx, ownerId, tr, 12.4, at(15))
    await ctx.db.insert('logs', {
      ownerId,
      area: 'money',
      kind: 'move',
      occurredAt: at(5),
      value: -505.2,
      unit: 'eur',
      text: 'Trade Republic',
      accountId: activo._id,
      meta: {
        merchant: 'Trade Republic',
        raw: 'COMPRA 2789 TRADE REPUBLIC',
        intakeId: await file(activo._id),
        otherAccountId: tr,
      },
    })
    await dropped(
      tr,
      'Trade Republic',
      [row(9, 'Deposit', 'Deposit', 500.63)],
      513.03,
      false,
    )
    return batchId
  },
})
