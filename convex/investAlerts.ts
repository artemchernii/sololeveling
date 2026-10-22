import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, internalQuery } from './_generated/server'
import type { ActionCtx } from './_generated/server'
import { cannedEarnings, earningsOf } from './insightsMine'
import { notifyOwner } from './push'
import { notificationShare } from './schema'
import { UNPRICED } from '../src/lib/market'
import { kindOf } from '../src/lib/logo'
import {
  bigDay,
  bigWords,
  callTurn,
  callWords,
  earnSoon,
  plainCompany,
  reportWords,
  reported,
  soonWords,
} from '../src/lib/investAlert'
import type { Words } from '../src/lib/investAlert'
import { dayStart } from '../src/lib/remindAt'

/* N3 (22 Oct; spec docs/specs/2026-10-22-n3-investment-alerts.md). Run
   by the 09:00 money job after its own alerts — no job of its own. For
   each share held now: its stored closes of the last year and latest
   fundamentals; for a company, its results days fetched from Yahoo and
   never stored (CLAUDE.md, 22 Oct). What rings is in src/lib/investAlert. */

const DAY = 86_400_000
const MAX_TODAY = 30

const facts = v.object({
  instrumentId: v.id('instruments'),
  symbol: v.string(),
  name: v.string(),
  type: v.string(),
  currency: v.string(),
  closes: v.array(v.object({ asOf: v.number(), price: v.number() })),
  reading: v.union(
    v.null(),
    v.object({
      asOf: v.number(),
      targetMean: v.optional(v.number()),
      revenueGrowth: v.optional(v.number()),
      ratingMean: v.optional(v.number()),
    }),
  ),
})

/** One held share's closes and reading — one query each, like MINE's
    `callFor`: a year of closes is ~250 rows. Only the owner's. */
export const shareFacts = internalQuery({
  args: { ownerId: v.string(), id: v.id('instruments'), now: v.number() },
  returns: v.union(v.null(), facts),
  handler: async (ctx, { ownerId, id, now }) => {
    const inst = await ctx.db.get(id)
    if (inst === null || inst.ownerId !== ownerId) return null
    if (inst.type === UNPRICED) return null
    const rows = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('instrumentId', id)
          .gte('asOf', now - 366 * DAY),
      )
      .take(400)
    const f =
      inst.type === 'EQUITY'
        ? await ctx.db
            .query('fundamentals')
            .withIndex('by_owner_instrument_asOf', (q) =>
              q.eq('ownerId', ownerId).eq('instrumentId', id),
            )
            .order('desc')
            .first()
        : null
    return {
      instrumentId: id,
      symbol: inst.symbol,
      name: inst.name,
      type: inst.type,
      currency: rows.at(-1)?.currency ?? inst.currency,
      closes: rows.map((r) => ({ asOf: r.asOf, price: r.price })),
      reading: f && {
        asOf: f.asOf,
        targetMean: f.target?.mean,
        revenueGrowth: f.revenueGrowth,
        ratingMean: f.rating?.mean,
      },
    }
  },
})

const alert = v.object({
  kind: v.union(
    v.literal('earnings'),
    v.literal('call_change'),
    v.literal('big_day'),
  ),
  title: v.string(),
  body: v.string(),
  url: v.string(),
  share: notificationShare,
})
type Alert = Infer<typeof alert>

/** This morning's share alerts for one owner, then the bell and push. */
export async function investMorning(
  ctx: ActionCtx,
  ownerId: string,
  now: number,
) {
  const held = await ctx.runQuery(internal.aggregate.heldInstruments, {
    ownerId,
  })
  const shares = (
    await Promise.all(
      held.map((id) =>
        ctx.runQuery(internal.investAlerts.shareFacts, { ownerId, id, now }),
      ),
    )
  ).flatMap((f) => (f === null ? [] : [f]))
  const companies = shares.filter((s) => kindOf(s) === 'stock')
  const earnings = await (
    process.env.E2E === '1'
      ? cannedEarnings(companies, now)
      : earningsOf(companies, now)
  ).catch(() => null)
  const days = new Map((earnings?.rows ?? []).map((e) => [e.symbol, e]))

  const alerts: Array<Alert> = []
  for (const s of shares) {
    const company = plainCompany(s.name)
    const push = (kind: Alert['kind'], w: Words) =>
      alerts.push({
        kind,
        ...w,
        url: `/finances?room=portfolio&position=${s.instrumentId}`,
        share: { symbol: s.symbol, type: s.type, name: s.name },
      })
    const e = days.get(s.symbol)
    if (e && e.next !== null && earnSoon(e.next, now))
      push('earnings', soonWords(company, s.symbol.split('.')[0], e.next))
    const r = reported(s.closes, e?.last ?? null, now)
    if (r) push('earnings', reportWords(company, r, s.currency))
    const t = callTurn(s.closes, s.reading, now)
    if (t) push('call_change', callWords(company, t))
    const b = bigDay(s.closes, now)
    if (b) push('big_day', bigWords(company, b, s.currency))
  }
  if (alerts.length > 0)
    await ctx.runMutation(internal.investAlerts.send, { ownerId, alerts })
}

/** Writes the bell's rows and pushes — one each: a second run the same
    day skips what today's bell already has. */
export const send = internalMutation({
  args: { ownerId: v.string(), alerts: v.array(alert) },
  returns: v.number(),
  handler: async (ctx, { ownerId, alerts }) => {
    const today = await ctx.db
      .query('notifications')
      .withIndex('by_owner_and_sent', (q) =>
        q.eq('ownerId', ownerId).gte('sentAt', dayStart(Date.now())),
      )
      .take(MAX_TODAY)
    const had = new Set(today.map((n) => `${n.kind}|${n.title}`))
    let sent = 0
    for (const a of alerts) {
      if (had.has(`${a.kind}|${a.title}`)) continue
      had.add(`${a.kind}|${a.title}`)
      await notifyOwner(ctx, { ownerId, ...a })
      sent++
    }
    return sent
  },
})
