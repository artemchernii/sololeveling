import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id, TableNames } from './_generated/dataModel'
import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireUser } from './auth'

/**
 * R8 · S3b, "delete my account and data" (docs/specs/2026-10-27-delete-
 * account.md, mockup design/firstrun-mockup/delete.html). Guests only —
 * his pick, 27 Oct: Artem never has the button and the server refuses him
 * too. Every table goes through its owner index; `intakeTrades` hangs off
 * its intake and goes with it; the profile goes last, so the person stays a
 * guest until nothing else of theirs is left.
 */

/* Each table and the index whose first field is ownerId. `profiles` is not
   here: it is deleted after everything else. */
const OWNED: ReadonlyArray<[TableNames, string]> = [
  ['areas', 'by_owner_order'],
  ['goals', 'by_owner_status'],
  ['milestones', 'by_owner_goal'],
  ['projects', 'by_owner_status'],
  ['commits', 'by_owner_project_time'],
  ['attachments', 'by_owner_note'],
  ['vaultSheets', 'by_owner_area'],
  ['readings', 'by_owner_attachment'],
  ['tasks', 'by_owner_status'],
  ['events', 'by_owner_start'],
  ['drills', 'by_owner_area'],
  ['logs', 'by_owner_time'],
  ['stateSnapshots', 'by_owner_key_time'],
  ['notes', 'by_owner_kind'],
  ['accounts', 'by_owner_order'],
  ['bankLinks', 'by_owner_account'],
  ['recurring', 'by_owner'],
  ['instruments', 'by_owner_symbol'],
  ['trades', 'by_owner_time'],
  ['ledgers', 'by_owner_account_instrument_part'],
  ['removedTrades', 'by_owner_instrument'],
  ['holdings', 'by_owner_account'],
  ['prices', 'by_owner_instrument_time'],
  ['priceYears', 'by_owner_instrument_year'],
  ['fundamentals', 'by_owner_instrument_asOf'],
  ['sectorAverages', 'by_owner_industry_year'],
  ['fxRates', 'by_owner_currency_time'],
  ['intakes', 'by_owner'],
  ['batches', 'by_owner'],
  ['csvLayouts', 'by_owner_header'],
  ['payees', 'by_owner_key'],
  ['merchantRules', 'by_owner_key'],
  ['principles', 'by_owner_order'],
  ['reviews', 'by_owner_period_start'],
  ['pushSubscriptions', 'by_owner'],
  ['moneyAlerts', 'by_owner'],
  ['notifications', 'by_owner_and_sent'],
  ['askReplies', 'by_owner_and_answered'],
  ['closeJobs', 'by_owner'],
  ['weekReads', 'by_owner_week'],
  ['marketReads', 'by_owner_month'],
  ['aiSpend', 'by_owner_month'],
]

/* A row as this file reads it: the fields that hold a file or a job. */
type Row = {
  _id: string
  logoId?: string
  storageId?: string
  storageIds?: Array<string>
  remindJob?: string
  jobId?: string
}

/* The tables are walked by name, which Convex's per-table types cannot
   follow; every read here is still `withIndex` on ownerId. */
function owned(
  ctx: QueryCtx | MutationCtx,
  table: TableNames,
  index: string,
  ownerId: string,
) {
  const db = ctx.db as unknown as {
    query: (t: string) => {
      withIndex: (
        i: string,
        f: (q: { eq: (field: string, value: string) => unknown }) => unknown,
      ) => { take: (n: number) => Promise<Array<Row>> }
    }
  }
  return db.query(table).withIndex(index, (q) => q.eq('ownerId', ownerId))
}

function filesOf(row: Row): Array<string> {
  return [
    ...(row.logoId ? [row.logoId] : []),
    ...(row.storageId ? [row.storageId] : []),
    ...(row.storageIds ?? []),
  ]
}

async function profileOf(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return await ctx.db
    .query('profiles')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .unique()
}

const isGuest = (p: { asOwner?: boolean } | null) =>
  p !== null && p.asOwner !== true

/* A query reads at most 4096 rows; past this the count says "or more". */
const COUNT_CAP = 4000

/**
 * What the button would delete: rows (with `intakeTrades`) and stored
 * files. Nothing is read for someone who is not a guest.
 */
export const counts = query({
  args: {},
  returns: v.object({
    guest: v.boolean(),
    rows: v.number(),
    files: v.number(),
    more: v.boolean(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const profile = await profileOf(ctx, ownerId)
    if (!isGuest(profile))
      return { guest: false, rows: 0, files: 0, more: false }
    let rows = 1
    let files = 0
    for (const [table, index] of OWNED) {
      const left = COUNT_CAP - rows
      if (left <= 0) return { guest: true, rows, files, more: true }
      const found = await owned(ctx, table, index, ownerId).take(left)
      rows += found.length
      for (const r of found) files += filesOf(r).length
      if (table === 'intakes')
        for (const intake of found)
          rows += (
            await ctx.db
              .query('intakeTrades')
              .withIndex('by_intake', (q) =>
                q.eq('intakeId', intake._id as never),
              )
              .take(COUNT_CAP)
          ).length
    }
    return { guest: true, rows, files, more: rows >= COUNT_CAP }
  },
})

/** DELETE ALL. Refused for anyone who is not a guest. */
export const deleteAll = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    if (!isGuest(await profileOf(ctx, ownerId))) throw new Error('NOT_A_GUEST')
    await ctx.scheduler.runAfter(0, internal.account.wipe, { ownerId })
    return null
  },
})

/* Rows deleted per run, so a full account never meets the write limits;
   the run schedules the next until nothing is left. */
const BATCH = 300

export const wipe = internalMutation({
  args: { ownerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    let budget = BATCH
    for (const [table, index] of OWNED) {
      if (budget <= 0) break
      const rows = await owned(ctx, table, index, ownerId).take(budget)
      for (const row of rows) {
        if (budget <= 0) break
        if (table === 'intakes') {
          /* Its trades first; the intake only once none is left, so a
             big statement split over runs never orphans a trade. */
          const trades = await ctx.db
            .query('intakeTrades')
            .withIndex('by_intake', (q) => q.eq('intakeId', row._id as never))
            .take(budget)
          for (const t of trades) await ctx.db.delete(t._id)
          budget -= trades.length
          if (budget <= 0) break
        }
        for (const file of filesOf(row)) await ctx.storage.delete(file as never)
        for (const job of [row.remindJob, row.jobId]) {
          if (job === undefined) continue
          const id = job as Id<'_scheduled_functions'>
          const scheduled = await ctx.db.system.get(id)
          if (scheduled !== null && scheduled.state.kind === 'pending')
            await ctx.scheduler.cancel(id)
        }
        await ctx.db.delete(row._id as never)
        budget -= 1
      }
    }
    if (budget <= 0) {
      await ctx.scheduler.runAfter(0, internal.account.wipe, { ownerId })
      return null
    }
    const profile = await profileOf(ctx, ownerId)
    if (profile !== null) await ctx.db.delete(profile._id)
    return null
  },
})
