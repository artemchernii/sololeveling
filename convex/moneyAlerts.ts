import { v } from 'convex/values'

import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { moneySoon } from './aggregate'
import { pull } from './bankRows'
import { notifyOwner } from './push'
import { dueBetween, payingRow, salaryBill } from '../src/lib/ahead'
import {
  APPROVAL_MARKS,
  MISSING_DAYS,
  SALARY_AFTER,
  SALARY_BEFORE,
  approvalWords,
  daysTo,
  missingWords,
  nextMorning,
  salaryWords,
} from '../src/lib/moneyAlert'
import { dayStart } from '../src/lib/remindAt'

/* N2 (17 Oct; spec docs/specs/2026-10-17-n2-finances-alerts.md). One job
   per owner, each morning at 09:00 Lisbon: it asks the bank for the
   accounts that matter today, then sends what is still true — A a bill
   two days out its account cannot pay, B a bank approval 7 or 1 days
   from its end, C the salary in. Then it schedules tomorrow's. A job a
   day, not a cron (N1b: the free plan's reads). */

const DAY = 86_400_000
const NOON = 12 * 3_600_000
const MAX_LINKS = 20

/** Start the owner's morning job, or keep the one there. Never two. */
export async function keepMorning(ctx: MutationCtx, ownerId: string) {
  const at = nextMorning(Date.now())
  const row = await ctx.db
    .query('moneyAlerts')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .unique()
  if (row !== null) {
    const job = await ctx.db.system.get(row.jobId)
    const pending = job?.state.kind === 'pending'
    if (pending && row.at === at) return
    if (pending) await ctx.scheduler.cancel(row.jobId)
  }
  const jobId = await ctx.scheduler.runAt(at, internal.moneyAlerts.morning, {
    ownerId,
  })
  if (row === null) await ctx.db.insert('moneyAlerts', { ownerId, jobId, at })
  else await ctx.db.patch(row._id, { jobId, at })
}

/** Once after the deploy: a job for every owner with a device on. */
export const startAll = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const owners = new Set(
      (await ctx.db.query('pushSubscriptions').take(200)).map((s) => s.ownerId),
    )
    for (const ownerId of owners) await keepMorning(ctx, ownerId)
    return owners.size
  },
})

export const morning = internalAction({
  args: { ownerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    const now = Date.now()
    const { read, today } = await ctx.runQuery(internal.moneyAlerts.toRead, {
      ownerId,
      now,
    })
    for (const accountId of read) {
      try {
        await pull(ctx, ownerId, accountId, today)
      } catch {
        /* A bank that does not answer: decide on the last balance. */
      }
    }
    await ctx.runMutation(internal.moneyAlerts.send, { ownerId, now })
    return null
  },
})

export const toRead = internalQuery({
  args: { ownerId: v.string(), now: v.number() },
  returns: v.object({ today: v.number(), read: v.array(v.id('accounts')) }),
  handler: async (ctx, { ownerId, now }) => {
    const d = await decide(ctx, ownerId, now, undefined)
    return { today: d.today, read: d.read }
  },
})

export const send = internalMutation({
  args: { ownerId: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { ownerId, now }) => {
    /* Tomorrow's job first, so the row is there to remember the salary. */
    await keepMorning(ctx, ownerId)
    const row = await ctx.db
      .query('moneyAlerts')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .unique()
    const d = await decide(ctx, ownerId, now, row?.salaryFor)
    for (const m of d.missing) {
      await notifyOwner(ctx, {
        ownerId,
        kind: 'money_missing',
        ...missingWords(m),
        url: '/finances?room=flow',
        tag: `missing:${m.billId}:${m.t}`,
      })
    }
    for (const a of d.approvals) {
      await notifyOwner(ctx, {
        ownerId,
        kind: 'bank_approval',
        ...approvalWords(a.account, a.validUntil, a.days),
        url: '/finances',
        tag: `approval:${a.linkId}:${a.days}`,
      })
    }
    if (d.salary !== null) {
      await notifyOwner(ctx, {
        ownerId,
        kind: 'salary_in',
        ...salaryWords(d.salary.account, d.salary.amount, d.salary.t),
        url: '/finances',
        tag: `salary:${d.salary.due}`,
      })
      if (row !== null) await ctx.db.patch(row._id, { salaryFor: d.salary.due })
    }
    return null
  },
})

/** What this morning reads and says. `salaryFor`: the salary day already
    said, so a second morning with the same row says nothing. */
async function decide(
  ctx: QueryCtx,
  ownerId: string,
  now: number,
  salaryFor: number | undefined,
) {
  const today = dayStart(now)
  const date = new Date(today + NOON)
  const monthStart = dayStart(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12),
  )
  const back = (SALARY_BEFORE + SALARY_AFTER) * DAY
  const soon = await moneySoon(ctx, ownerId, {
    today,
    days: MISSING_DAYS,
    monthStart,
    since: today - back,
  })
  const links = await ctx.db
    .query('bankLinks')
    .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
    .take(MAX_LINKS)
  /* Enable Banking links that still answer; Trading 212 has no approval. */
  const live = links.filter(
    (l) =>
      l.via === undefined && l.validUntil !== undefined && l.validUntil > now,
  )
  const readable = new Set(live.map((l) => l.accountId as string))
  const name = (id: string) => soon.names.get(id) ?? 'Account'
  const read = new Set<Id<'accounts'>>()

  /* A: bills of the next two days are read for; the one two days out
     whose account cannot pay it rings. */
  const bills = soon.bills.filter((b) => b.endedAt === undefined)
  for (const { bill } of dueBetween(
    bills.filter((b) => b.kind === 'expense'),
    today + DAY,
    today + MISSING_DAYS * DAY,
  )) {
    if (bill.accountId && readable.has(bill.accountId))
      read.add(bill.accountId as Id<'accounts'>)
  }
  const missing = soon.events
    .filter(
      (e) =>
        e.short &&
        e.kind === 'expense' &&
        e.accountId !== undefined &&
        soon.free.has(e.accountId) &&
        daysTo(e.t, today) === MISSING_DAYS,
    )
    .map((e) => ({
      billId: e.billId,
      name: e.name,
      amount: e.amount,
      t: e.t,
      account: name(e.accountId as string),
      /* What the account has now, not after the bills before this one:
         the number he sees on the account. The gap is the month's, as
         on Flow. */
      held: soon.free.get(e.accountId as string) as number,
      missing: e.add ?? Math.round((e.amount - (e.held ?? 0)) * 100) / 100,
    }))

  /* B: an approval 7 or 1 days from its end. */
  const approvals = live
    .map((l) => ({
      linkId: l._id,
      account: name(l.accountId),
      validUntil: l.validUntil as number,
      days: daysTo(l.validUntil as number, today),
    }))
    .filter((a) => APPROVAL_MARKS.includes(a.days))

  /* C: the salary, from two days before its day to three after. Its
     account is read until a row pays it. */
  let salary: {
    due: number
    account: string
    amount: number
    t: number
  } | null = null
  const pay = salaryBill(bills)
  for (const { t: due, bill } of dueBetween(
    pay?.accountId === undefined ? [] : [pay],
    today - SALARY_AFTER * DAY,
    today + SALARY_BEFORE * DAY,
  )) {
    const paid = payingRow(
      bill,
      soon.rows.filter((r) => r.t >= due - SALARY_BEFORE * DAY),
    )
    if (paid === undefined) {
      if (readable.has(bill.accountId as string))
        read.add(bill.accountId as Id<'accounts'>)
      continue
    }
    if (salaryFor === due || salary !== null) continue
    salary = {
      due,
      account: name(bill.accountId as string),
      amount: paid.amount,
      t: paid.t,
    }
  }

  return { today, read: [...read], missing, approvals, salary }
}
