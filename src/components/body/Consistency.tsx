import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { DayStrips } from '@/components/track/DayStrip'
import { TrackPanel } from '@/components/track/TrackPanel'
import { dayStartsBack, RECENT_DAYS, STRIP_WEEKS } from '@/lib/day-strip'

/* How often — the thing he actually asked this page for (21 Sep): "what is
   most important is consistency".

   One row per category his logs carry, discovered from the rows rather than
   listed here, so a kind invented in the capture chip appears with no code
   change. A routine's ticked exercises land on their routine's row (25 Sep,
   categoryDays keys by category). `12 of the last 30 days` is a count of
   days with something on them, from aggregate.categoryDays. There is no
   streak: a streak zeroes on a missed day, which punishes a fact rather than
   reporting it. */
export function Consistency({ delay = 0 }: { delay?: number }) {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.aggregate.categoryDays, {
    area: 'body',
    kinds: ['workout', 'intake', 'exercise'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })

  return (
    <TrackPanel
      area="body"
      title="consistency"
      delay={delay}
      aside={
        result !== undefined && !result.complete ? (
          /* Said out loud rather than drawn as empty squares: a strip that
             stopped early would be missing its NEWEST days, and an empty
             square there is indistinguishable from "did not go". */
          <span className="font-mono text-[11px] text-ink-500">
            older days not all stored
          </span>
        ) : null
      }
    >
      {result === undefined ? null : result.rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing logged under Body yet. Press DID on a routine above, or{' '}
          <span className="font-mono text-ink-300">⌘L</span> and type{' '}
          <span className="font-mono text-ink-300">gym</span>,{' '}
          <span className="font-mono text-ink-300">stretch</span> or{' '}
          <span className="font-mono text-ink-300">supp</span> — the strip
          starts the day you do.
        </p>
      ) : (
        <DayStrips
          dayStarts={dayStarts}
          rows={result.rows.map((row) => ({
            key: `${row.kind}-${row.category ?? 'other'}`,
            label: row.category ?? 'unsorted',
            days: row.days,
            aside: `${row.activeRecent} of the last ${RECENT_DAYS} days`,
            noun: row.kind === 'intake' ? 'dose' : 'log',
          }))}
        />
      )}
    </TrackPanel>
  )
}
