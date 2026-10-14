import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import type { Id } from './_generated/dataModel'

/* Where a save's buys sit (14 Oct). His iShares Physical Gold
   screenshots were read right and saved under iShares Digital Security,
   and ADD BUYS still said "9 buys saved · iShares Physical Gold": the
   screen trusted the file's count. This reads the trades the batch's
   files wrote (by importId) and says which thing each sits on — counts
   of rows, nothing worked out. */

/* Files in one save. */
const FILES = 40
/* Trades of one account between a file's first and last day. */
const ROWS = 2000

export const batch = query({
  args: { batchId: v.id('batches') },
  returns: v.array(
    v.object({
      symbol: v.string(),
      name: v.string(),
      type: v.string(),
      buys: v.number(),
      sells: v.number(),
      /** What its files read them as: "iShares Physical Gold" read,
          iShares Digital Security saved. */
      read: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const b = await ctx.db.get(args.batchId)
    if (b === null || b.ownerId !== ownerId) return []
    const intakes = await ctx.db
      .query('intakes')
      .withIndex('by_owner_batch', (q) =>
        q.eq('ownerId', ownerId).eq('batchId', args.batchId),
      )
      .take(FILES)
    const count = new Map<
      Id<'instruments'>,
      { buys: number; sells: number; read: Set<string> }
    >()
    for (const i of intakes) {
      const accountId = i.accountId
      const days = (i.trades ?? []).map((t) => t.occurredAt)
      if (accountId === undefined || days.length === 0) continue
      const from = Math.min(...days)
      const to = Math.max(...days)
      const trades = (
        await ctx.db
          .query('trades')
          .withIndex('by_owner_account_time', (q) =>
            q
              .eq('ownerId', ownerId)
              .eq('accountId', accountId)
              .gte('occurredAt', from)
              .lte('occurredAt', to),
          )
          .take(ROWS)
      ).filter((t) => t.importId === i._id)
      for (const t of trades) {
        const c = count.get(t.instrumentId) ?? {
          buys: 0,
          sells: 0,
          read: new Set<string>(),
        }
        if (t.side === 'sell') c.sells += 1
        else c.buys += 1
        const printed = i.trades?.find((r) => r.occurredAt === t.occurredAt)
        const c0 = printed?.candidates.at(printed.preferred ?? 0)
        if (printed) c.read.add(c0?.name ?? printed.name)
        count.set(t.instrumentId, c)
      }
    }
    const out = []
    for (const [instrumentId, c] of count) {
      const ins = await ctx.db.get(instrumentId)
      if (ins === null || ins.ownerId !== ownerId) continue
      out.push({
        symbol: ins.symbol,
        name: ins.name,
        type: ins.type,
        buys: c.buys,
        sells: c.sells,
        read: [...c.read],
      })
    }
    return out
  },
})
