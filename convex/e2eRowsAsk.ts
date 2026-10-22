import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

/* Browser tests of R7 Ask AI on the test backend: one month of rows from
   `from` (a local midnight, the 1st) — workouts, Portuguese classes,
   expenses, ticks and a project's commits. A failed answer is armed with
   e2eMarketRead.arm('fail'), the same switch ASK uses. */

const DAY = 86_400_000
const H = 3_600_000

export const month = mutation({
  args: { from: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const day = (d: number, h = 12) => args.from + (d - 1) * DAY + h * H
    const log = (
      d: number,
      kind: 'workout' | 'session' | 'expense' | 'task_done',
      area: string,
      text: string,
      value?: number,
      unit?: string,
    ) =>
      ctx.db.insert('logs', {
        ownerId,
        kind,
        area,
        occurredAt: day(d),
        text,
        value,
        unit,
      })
    for (const [d, t] of [
      [2, 'Gym · push'],
      [5, 'Run'],
      [9, 'Gym · legs'],
    ] as const)
      await log(d, 'workout', 'body', t, 60, 'min')
    for (const d of [4, 11])
      await log(d, 'session', 'portuguese', 'Class', 90, 'min')
    await log(1, 'expense', 'money', 'Pingo Doce', 48.2, 'eur')
    await log(22, 'expense', 'money', 'Renda', 650, 'eur')
    await log(30, 'task_done', 'life', 'Send invoice')

    const p = await ctx.db.insert('projects', {
      ownerId,
      title: 'Oreum',
      status: 'active',
    })
    for (const [d, m] of [
      [2, 'feat: first run'],
      [3, 'fix: auth'],
      [3, 'feat: feed'],
    ] as const)
      await ctx.db.insert('commits', {
        ownerId,
        projectId: p,
        repo: 'artem/oreum',
        sha: `${d}-${m}`,
        message: m,
        url: 'https://github.com/artem/oreum',
        authoredAt: day(d, 10),
        fetchedAt: day(d, 10),
        isMerge: false,
      })
    return null
  },
})
