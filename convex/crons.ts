import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

/* Source 4's readings (R3c). Hourly: often enough that "last week" is right
   the morning you look, rare enough to stay far inside GitHub's limits. */
crons.interval(
  'check GitHub commits',
  { hours: 1 },
  internal.github.checkAll,
  {},
)

/* Source 4's market readings (Finances F4). Daily, after New York closes
   (22:30 UTC), so the stored price is the day's close for every ticker he
   holds, US and European. */
crons.daily(
  'read market prices',
  { hourUTC: 22, minuteUTC: 30 },
  internal.market.readAll,
  {},
)

/* Dropped files are kept 90 days to open again, then erased (3 Oct).
   What was read from them stays. */
crons.daily(
  'erase files past 90 days',
  { hourUTC: 3, minuteUTC: 0 },
  internal.intake.eraseOld,
  {},
)

export default crons
