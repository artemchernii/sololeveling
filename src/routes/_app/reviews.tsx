import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { ActivityTile } from '@/components/review/ActivityTile'
import { BodyTile } from '@/components/review/BodyTile'
import { FinancesTile } from '@/components/review/FinancesTile'
import { FocusTile } from '@/components/review/FocusTile'
import { LanguagesTile } from '@/components/review/LanguagesTile'
import { NoteTile } from '@/components/review/NoteTile'
import { WeekBar } from '@/components/review/WeekBar'
import { Skeleton } from '@/components/Skeleton'
import { useDayStarts } from '@/components/track/useDayStarts'
import { useHeld } from '@/lib/loading'
import { addDays, addWeeks, startOfWeek, weekKey } from '@/lib/weeks'

export const Route = createFileRoute('/_app/reviews')({
  component: Reviews,
})

/* Review, the bento (14 Oct; docs/specs/2026-10-14-review-bento.md, mockup
   design/review-mockup/index.html). "A small review of everything Solo
   Leveling has … very informative, colorful and see my progress." Every
   number is read here from aggregate.ts and handed to a tile; no tile
   computes one. */
function Reviews() {
  const today = useDayStarts(1).at(-1) as number
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const isThisWeek = weekKey(weekStart) === weekKey(new Date(today))
  const key = weekKey(weekStart)

  const start = weekStart.getTime()
  const end = addWeeks(weekStart, 1).getTime()
  const lastStart = addWeeks(weekStart, -1).getTime()
  const dayStarts = Array.from({ length: 14 }, (_, i) =>
    addDays(weekStart, i - 7).getTime(),
  )
  /* Last Sunday's end, then each day of this week up to today. */
  const dayEnds = Array.from(
    { length: 8 },
    (_, i) => addDays(weekStart, i).getTime() - 1,
  ).filter((t) => t < today + 86_400_000)

  const areas = useQuery(api.areas.list, {})
  const languages = (areas ?? []).filter((a) => a.track === 'language')
  const slugs = languages.map((a) => a.slug)
  const week = useQuery(
    api.aggregate.weekReview,
    areas === undefined ? 'skip' : { dayStarts, end, languages: slugs },
  )
  const money = useQuery(api.aggregate.moneySums, { start, end })
  const lastMoney = useQuery(api.aggregate.moneySums, {
    start: lastStart,
    end: start,
  })
  const worth = useQuery(api.aggregate.worthHistory, { dayEnds })
  const weight = useQuery(api.aggregate.stateHistory, {
    key: 'weight',
    start: start - 90 * 86_400_000,
    end,
  })
  const levels = useQuery(
    api.aggregate.languageLevels,
    areas === undefined ? 'skip' : { slugs },
  )
  const targets = useQuery(api.goals.weeklyTargets, {})
  const review = useQuery(api.reviews.forWeek, { periodStart: key })

  const all =
    week && money && lastMoney && worth && weight && levels && targets
      ? { week, money, lastMoney, worth, weight, levels, targets }
      : undefined
  /* One page about one week, arriving as one, and held again when you page
     to another week — never last week's numbers under this week's name. */
  const data = useHeld(all, key)

  return (
    <div className="flex flex-col gap-2.5">
      <WeekBar
        weekStart={weekStart}
        closed={review?.closedAt !== undefined}
        week={data?.week}
        isThisWeek={isThisWeek}
        onMove={(n) => setWeekStart(addWeeks(weekStart, n))}
      />
      {data === undefined ? (
        <BentoSkeleton />
      ) : (
        <div
          key={key}
          className="grid grid-flow-dense grid-cols-2 gap-2.5 lg:grid-cols-6"
        >
          <FinancesTile
            money={data.money}
            lastMoney={data.lastMoney}
            worth={data.worth}
            dayEnds={dayEnds}
          />
          <BodyTile
            week={data.week.week}
            lastWorkouts={data.week.lastWeek.workouts}
            weight={data.weight.rows}
            weekStart={start}
            targets={data.targets}
          />
          <LanguagesTile
            languages={languages}
            week={data.week.week.languages}
            levels={data.levels}
          />
          <ActivityTile week={data.week} languageSlug={slugs.at(0)} />
          {data.week.focus ? (
            <FocusTile focus={data.week.focus} weekStart={start} end={end} />
          ) : null}
          <NoteTile
            periodStart={key}
            review={review ?? null}
            span={
              data.week.focus
                ? 'col-span-2 lg:col-span-4'
                : 'col-span-2 lg:col-span-6'
            }
          />
        </div>
      )}
    </div>
  )
}

/* The bento's shape while it loads: four big tiles and the bottom row. */
function BentoSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid grid-cols-2 gap-2.5 lg:grid-cols-6"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="glass col-span-2 flex h-[300px] flex-col gap-3 rounded-[14px] p-3.5 lg:col-span-3"
        >
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-8 w-1/3" />
        </div>
      ))}
      <div className="glass col-span-2 h-[150px] rounded-[14px] lg:col-span-2" />
      <div className="glass col-span-2 h-[150px] rounded-[14px] lg:col-span-4" />
    </div>
  )
}
