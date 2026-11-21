import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { csvTitle, skippedNote } from '../../src/lib/csvLayout'
import { TR_INSTITUTION } from '../../src/lib/trCsv'
import type { TrCsvReading } from '../../src/lib/trCsv'
import { Tickers } from './tickers'

/* Trade Republic's own export, read in code (src/lib/trCsv.ts): its
   money rows and its orders in one statement, as its PDF is read — the
   orders reach the check and are saved as trades. No model, nothing paid. */
export async function finishTrCsv(
  ctx: ActionCtx,
  intakeId: Id<'intakes'>,
  reading: TrCsvReading,
) {
  const title = csvTitle(TR_INSTITUTION, {
    kind: 'transactions',
    transactions: reading.transactions,
    trades: reading.trades,
    splits: [],
    skipped: reading.skipped,
    closings: {},
    first: reading.first,
    last: reading.last,
    tickers: 0,
  })
  await ctx.runMutation(internal.intake.progress, {
    intakeId,
    stage: 'rows',
    kind: 'transactions',
    institution: TR_INSTITUTION,
    title,
  })
  const tickers = new Tickers()
  const trades = []
  for (const t of reading.trades)
    trades.push({ ...t, ...(await tickers.find(t.name, t.isin)) })
  await ctx.runMutation(internal.intake.finish, {
    intakeId,
    kind: 'transactions',
    title,
    institution: TR_INSTITUTION,
    transactions: reading.transactions,
    trades,
    costUsd: 0,
    note: skippedNote(reading.skipped),
    model: 'Trade Republic’s own columns',
  })
}
