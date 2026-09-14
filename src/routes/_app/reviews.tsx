import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { PageTitle } from '@/components/PageTitle'
import { CloseWeek } from '@/components/review/CloseWeek'
import { KpiTiles } from '@/components/review/KpiTiles'
import { MovementTable } from '@/components/review/MovementTable'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import { useHeld } from '@/lib/loading'
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

  /* The review is one page about one week, so it arrives as one: nothing
     below the header shows until all three reads are in, held like any other
     first load — and held again when you page to another week. Showing parts
     as they land made the page grow twice, and MovementTable, handed an empty
     list while loading, said "two weeks of logs and this table starts saying
     something" about a week it had not read yet. Last week's numbers are never
     kept on screen under this week's heading. */
  const ready = useHeld(
    weeks !== undefined && review !== undefined && principles !== undefined
      ? true
      : undefined,
    key,
  )

  const thisWeek = weeks?.[weeks.length - 1]
  const lastWeek = weeks?.[weeks.length - 2]
  const isCurrentWeek = key === weekKey(new Date())

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle
          title="Weekly review"
          subtitle={
            <>
              Week of{' '}
              {weekStart.toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </>
          }
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="rounded-[7px] bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-lift/10"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-[7px] bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-lift/10"
          >
            This week
          </button>
          <button
            type="button"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="rounded-[7px] bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-lift/10 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      {ready ? null : <ReviewSkeleton />}
      {ready ? (
        <div key={key} className="motion-fade flex flex-col gap-[18px]">
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
                No principles yet. They are seeded once from the CLI — your
                ownerId is on Settings.
              </p>
            </div>
          ) : null}

          <CloseWeek weekKey={key} review={review} />
        </div>
      ) : null}

      <p className="text-[11.5px] text-ink-700">
        Reviewing the week of {key}. Today is {localToday()}.
      </p>
    </div>
  )
}

/* The page's four cards as shape (§3d.2): the six tiles, the twelve-week
   table, the principle, and the close-the-week form. */
function ReviewSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex flex-col gap-[18px]"
    >
      <div className="glass rounded-[22px] p-5">
        <Skeleton className="mb-4 h-2.5 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex h-[92px] flex-col justify-center gap-3 rounded-[16px] border border-lift/[0.06] bg-lift/[0.02] p-4"
            >
              <Skeleton className="h-2.5 w-1/3" />
              <Skeleton className="h-6 w-1/4" />
            </div>
          ))}
        </div>
      </div>
      <div className="glass rounded-[22px] p-5">
        <Skeleton className="mb-3 h-2.5 w-28" />
        <SkeletonRows rows={4} />
      </div>
      <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="glass flex h-[320px] flex-col gap-3 rounded-[22px] p-5">
        <Skeleton className="h-2.5 w-32" />
      </div>
    </div>
  )
}
