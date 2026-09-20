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

export default crons
