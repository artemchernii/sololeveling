import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { DayStrip } from '@/components/track/DayStrip'
import { areaVars } from '@/lib/areas'
import {
  blockLabels,
  dayBlocks,
  dayStartsBack,
  RECENT_DAYS,
  STRIP_WEEKS,
} from '@/lib/day-strip'

/* How often — the thing he actually asked this page for (21 Sep): "what is
   most important is consistency".

   One row per category his logs carry, discovered from the rows rather than
   listed here, so a kind invented in the capture chip appears with no code
   change. `12 of the last 30 days` is a count of days with something on them,
   from aggregate.categoryDays. There is no streak: a streak zeroes on a missed
   day, which punishes a fact rather than reporting it. */
export function Consistency() {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.aggregate.categoryDays, {
    area: 'body',
    kinds: ['workout', 'intake'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })
  const labels = blockLabels(dayBlocks(dayStarts))

  return (
    <section style={areaVars('body')} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-caps">consistency</h2>
        {result !== undefined && !result.complete ? (
          /* Said out loud rather than drawn as empty squares: a strip that
             stopped early would be missing its NEWEST days, and an empty
             square there is indistinguishable from "did not go" — the same
             failure the commit heatmap guards against. */
          <span className="font-mono text-[11px] text-ink-500">
            older days not all stored
          </span>
        ) : null}
      </div>

      {result === undefined ? null : result.rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing logged under Body yet. Press{' '}
          <span className="font-mono text-ink-300">⌘L</span> and type{' '}
          <span className="font-mono text-ink-300">gym</span>,{' '}
          <span className="font-mono text-ink-300">stretch</span> or{' '}
          <span className="font-mono text-ink-300">supp</span> — the strip
          starts the day you do.
        </p>
      ) : (
        /* One scroll container for the labels and every row, the same bargain
           CommitHeatmap makes for its own label row and grid: at phone width
           the strip's 12 weeks are wider than the screen, and only this
           section should pay for that in a scrollbar — never the page. A
           label row with no overflow of its own, stretched by a column flex
           parent, would overflow past its ancestor uncontained; wrapping the
           whole block is what keeps that overflow local. */
        <div className="overflow-x-auto">
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-[7px] pl-[104px]">
              {labels.map((label, b) => (
                <span
                  key={b}
                  className="label-caps w-[95px] shrink-0 overflow-visible whitespace-nowrap"
                >
                  {label}
                </span>
              ))}
            </div>

            {result.rows.map((row) => (
              <div
                key={`${row.kind}-${row.category ?? 'other'}`}
                className="flex items-center gap-3"
              >
                <span className="label-caps w-[92px] shrink-0 truncate">
                  {row.category ?? 'other'}
                </span>
                <DayStrip
                  dayStarts={dayStarts}
                  days={row.days}
                  noun={row.kind === 'intake' ? 'dose' : 'session'}
                />
                <span className="shrink-0 font-mono text-[11px] text-ink-500">
                  {row.activeRecent} of the last {RECENT_DAYS} days
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
