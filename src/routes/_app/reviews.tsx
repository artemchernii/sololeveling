import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { CloseWeek } from '@/components/review/CloseWeek'
import { KpiTiles } from '@/components/review/KpiTiles'
import { MovementTable } from '@/components/review/MovementTable'
import { localToday } from '@/lib/today'
import {
  addWeeks,
  startOfWeek,
  weekKey,
  weekStartsEndingWith,
} from '@/lib/weeks'

export const Route = createFileRoute('/_app/reviews')({
  component: Reviews,
})

/* PLAN.md §3, the weekly review: "the week, as it actually went." KPI tiles,
   twelve weeks of movement, one principle, the sentence, close.
 
   Every number here comes from aggregate.weekCounts. This file composes them —
   a delta is a subtraction of two source values — and computes none. */
function Reviews() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  const starts = weekStartsEndingWith(weekStart, 12)
  const weeks = useQuery(api.aggregate.weekCounts, {
    starts,
    end: addWeeks(weekStart, 1).getTime(),
  })

  const key = weekKey(weekStart)
  const review = useQuery(api.reviews.forWeek, { periodStart: key })
  const principles = useQuery(api.principles.list, {})

  /* Deterministic, not random: the same line all week, a different line next
     week. A principle that changes when you refresh is decoration. */
  const principle =
    principles && principles.length > 0
      ? principles[
          Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000)) %
            principles.length
        ]
      : undefined

  const thisWeek = weeks?.[weeks.length - 1]
  const lastWeek = weeks?.[weeks.length - 2]
  const isCurrentWeek = key === weekKey(new Date())

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] text-foreground">Weekly review</h1>
          <p className="label-caps">
            Week of{' '}
            {weekStart.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="rounded-[7px] bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-white/10"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-[7px] bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-white/10"
          >
            This week
          </button>
          <button
            type="button"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="rounded-[7px] bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-white/10 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      <KpiTiles week={thisWeek} previous={lastWeek} />

      <MovementTable weeks={weeks ?? []} />

      {principle ? (
        <div className="glass rounded-[22px] p-5">
          <div className="label-caps">This week’s principle</div>
          <p className="mt-2 text-[17px] font-light text-foreground">
            {principle.text}
          </p>
        </div>
      ) : principles && principles.length === 0 ? (
        /* Nothing is seeded automatically (§3b.5), so this is a real state on
           a fresh deployment rather than an error. */
        <div className="glass rounded-[22px] p-5">
          <div className="label-caps">This week’s principle</div>
          <p className="mt-2 text-[13px] text-ink-500">
            No principles yet. They are seeded once from the CLI — your ownerId
            is on Settings.
          </p>
        </div>
      ) : null}

      <CloseWeek weekKey={key} review={review} />

      <p className="text-[11.5px] text-ink-700">
        Reviewing the week of {key}. Today is {localToday()}.
      </p>
    </div>
  )
}
