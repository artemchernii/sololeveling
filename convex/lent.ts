import type { MutationCtx } from './_generated/server'
import { LENT, isEuroAmount } from '../src/lib/money'
import { backFor } from '../src/lib/lent'

/** Files the money back for what he lent as paid back (src/lib/lent).
    Runs after he says "I lent it", and when Flow opens. Returns how many. */
export async function pairLent(ctx: MutationCtx, ownerId: string) {
  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_area_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('area', 'money')
        .gte('occurredAt', Date.now() - 400 * 86_400_000),
    )
    .order('desc')
    .take(5000)
  const rows = []
  for (const l of logs) {
    if ((l.kind !== 'expense' && l.kind !== 'income') || !isEuroAmount(l)) {
      continue
    }
    rows.push({
      id: l._id as string,
      kind: l.kind,
      amount: l.value,
      t: l.occurredAt,
      line: l.meta?.raw ?? l.meta?.merchant ?? l.text ?? '',
      lent: l.meta?.category === LENT,
    })
  }
  const ids = new Set(backFor(rows))
  for (const l of logs) {
    if (!ids.has(l._id)) continue
    await ctx.db.patch(l._id, { meta: { ...l.meta, category: LENT } })
  }
  return ids.size
}
