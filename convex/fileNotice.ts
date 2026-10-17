import { notifyOwner } from './push'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/* N1b (17 Oct). "I drop statement … lock phone … get notification": a
   dropped file finishing reading says so. A bulk drop says it once, when
   its last file finishes — six statements are one notification, not six. */

const MAX_BATCH = 100

const READ_TITLE = {
  transactions: 'Statement read',
  holdings: 'Holdings read',
  trades: 'Trades read',
} as const

export async function fileNotice(ctx: MutationCtx, intakeId: Id<'intakes'>) {
  const intake = await ctx.db.get(intakeId)
  if (intake === null) return
  if (intake.status !== 'ready' && intake.status !== 'failed') return
  const { ownerId } = intake

  if (intake.batchId !== undefined) {
    const batchId = intake.batchId
    const files = await ctx.db
      .query('intakes')
      .withIndex('by_owner_batch', (q) =>
        q.eq('ownerId', ownerId).eq('batchId', batchId),
      )
      .take(MAX_BATCH)
    if (files.some((f) => f.status === 'reading')) return
    const read = files.filter((f) => f.status === 'ready').length
    const failed = files.filter((f) => f.status === 'failed').length
    await notifyOwner(ctx, {
      ownerId,
      kind: failed > 0 && read === 0 ? 'file_failed' : 'file_read',
      title: `${files.length} files read`,
      body: failed > 0 ? `${read} read · ${failed} not read` : `${read} read`,
      url: '/finances',
    })
    return
  }

  const who = intake.institution ?? intake.title ?? 'File'
  if (intake.status === 'failed') {
    await notifyOwner(ctx, {
      ownerId,
      kind: 'file_failed',
      title: 'File not read',
      body: who,
      url: '/finances',
    })
    return
  }
  const kind = intake.kind ?? 'transactions'
  const rows =
    kind === 'holdings'
      ? (intake.positions?.length ?? 0)
      : kind === 'trades'
        ? (intake.trades?.length ?? 0)
        : (intake.transactions?.length ?? 0)
  await notifyOwner(ctx, {
    ownerId,
    kind: 'file_read',
    title: READ_TITLE[kind],
    body: `${who} · ${rows} ${rows === 1 ? 'row' : 'rows'}`,
    url: '/finances',
  })
}
