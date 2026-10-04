import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import { merchantKey } from '../src/lib/intake'
import { isLent } from '../src/lib/money'
import { paysBill } from '../src/lib/ahead'
import { payeeKey, rowKey } from '../src/lib/payee'
import { bankPhrase, knownShop, payeeIdOf } from '../src/lib/payees'
import { whyLine } from '../src/lib/why'

/**
 * Why a money row is where it is, in one plain line (src/lib/why): the
 * bill it pays, lent, his own filing, a known shop, or the reader's guess.
 */
export const row = query({
  args: { logId: v.id('logs') },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) return null
    const kind =
      log.kind === 'expense' || log.kind === 'income'
        ? log.kind
        : log.kind === 'move' || log.kind === 'transfer'
          ? 'move'
          : null
    if (kind === null || log.value === undefined) return null
    const line = log.meta?.raw ?? log.meta?.merchant ?? log.text ?? ''
    const name = log.meta?.payee ?? log.meta?.merchant ?? log.text ?? ''

    let bill = null
    if (kind !== 'move') {
      const bills = (
        await ctx.db
          .query('recurring')
          .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
          .take(100)
      ).filter((b) => b.refusedAt === undefined)
      const r = {
        id: log._id as string,
        kind,
        amount: log.value,
        t: log.occurredAt,
        key: rowKey(log),
        recurringId: log.meta?.recurringId,
      }
      const b = bills.find((x) =>
        paysBill(
          {
            id: x._id,
            name: x.name,
            kind: x.kind,
            amount: x.amount,
            cadence: x.cadence,
            day: x.day,
            key: x.matchKey ?? payeeKey(x.name),
            /* As the sums match it (aggregate's aheadBill): every few
               weeks still wants about the same amount. */
            varies: x.varies === true,
          },
          r,
        ),
      )
      if (b) {
        /* The name the row shows: his payee name, else what the bank's
           words mean or the shop, else the bill's own (4 Oct). */
        const his = await ctx.db
          .query('payees')
          .withIndex('by_owner_key', (q) =>
            q.eq('ownerId', ownerId).eq('key', payeeIdOf(line)),
          )
          .first()
        const known =
          b.foundAt !== undefined
            ? (bankPhrase(line)?.name ?? knownShop(payeeKey(line))?.name)
            : undefined
        bill = {
          name: his?.name ?? known ?? b.name,
          found: b.foundAt !== undefined,
          varies: b.varies === true,
          salary: b.kind === 'income',
        }
      }
    }

    const mk = merchantKey(log.meta?.merchant ?? log.text ?? '')
    const rule = mk
      ? await ctx.db
          .query('merchantRules')
          .withIndex('by_owner_key', (q) =>
            q.eq('ownerId', ownerId).eq('key', mk),
          )
          .first()
      : null
    const category = log.meta?.category ?? null
    return whyLine({
      kind,
      category,
      bill,
      lent: isLent(log),
      name,
      hisRule: rule !== null && rule.category === category,
      shop: knownShop(payeeKey(line))?.name ?? null,
    })
  },
})
