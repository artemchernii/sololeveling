import { v } from 'convex/values'

import { action } from '../_generated/server'
import { requireUser } from '../auth'
import { CROWD_SOURCE, CROWD_URL, parseCrowd } from '../../src/lib/crowd'

/* ON REDDIT: one ApeWisdom call when MARKET opens, never stored (his
   "DONT SAVE IT TO DB"). Not reached → `reached: false`, the tile alone
   says so. Canned on the test backend. */

const row = v.object({
  ticker: v.string(),
  name: v.string(),
  mentions: v.number(),
  was: v.union(v.number(), v.null()),
})

export const crowd = action({
  args: {},
  returns: v.object({
    source: v.string(),
    fetchedAt: v.number(),
    reached: v.boolean(),
    rows: v.array(row),
  }),
  handler: async (ctx) => {
    await requireUser(ctx)
    const fetchedAt = Date.now()
    if (process.env.E2E === '1')
      return {
        source: CROWD_SOURCE,
        fetchedAt,
        reached: true,
        rows: [
          { ticker: 'NVDA', name: 'NVIDIA', mentions: 1240, was: 410 },
          { ticker: 'TSLA', name: 'Tesla', mentions: 980, was: 1120 },
          { ticker: 'AVGO', name: 'Broadcom', mentions: 760, was: 150 },
          { ticker: 'AMD', name: 'AMD', mentions: 540, was: 390 },
          { ticker: 'PLTR', name: 'Palantir', mentions: 420, was: 610 },
        ],
      }
    try {
      const res = await fetch(CROWD_URL, { signal: AbortSignal.timeout(8000) })
      const rows = res.ok ? parseCrowd(await res.json()) : []
      return { source: CROWD_SOURCE, fetchedAt, reached: rows.length > 0, rows }
    } catch {
      return { source: CROWD_SOURCE, fetchedAt, reached: false, rows: [] }
    }
  },
})
