import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { BodyTile } from '@/components/review/BodyTile'
import { FinancesTile } from '@/components/review/FinancesTile'
import { LanguagesTile } from '@/components/review/LanguagesTile'
import { NoteTile } from '@/components/review/NoteTile'
import { ProjectsTile } from '@/components/review/ProjectsTile'
import { WeekBar } from '@/components/review/WeekBar'
import { Skeleton } from '@/components/Skeleton'
import { useDayStarts } from '@/components/track/useDayStarts'
import { useHeld } from '@/lib/loading'
import { addDays, addWeeks, startOfWeek, weekKey } from '@/lib/weeks'

export const Route = createFileRoute('/_app/reviews')({
  component: Reviews,
})

/* Review (15 Oct; spec docs/specs/2026-10-14-review-bento.md, mockup
   design/review-mockup/real.html, "way better"). The week on what the app
   gets by itself — bank rows, worth, commits — with the hand logs beside
   four weeks of them: "i dont want to end up with all 0 screen". Every
   number is read here from aggregate.ts and handed to a tile; a tile with
   nothing in four weeks is not drawn. */
function Reviews() {
  const today = useDayStarts(1).at(-1) as number
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const isThisWeek = weekKey(weekStart) === weekKey(new Date(today))
  const key = weekKey(weekStart)

  const end = addWeeks(weekStart, 1).getTime()
  const dayStarts = Array.from({ length: 14 }, (_, i) =>
    addDays(weekStart, i - 7).getTime(),
  )
  const todayIndex = isThisWeek ? dayStarts.slice(7).indexOf(today) : -1
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
    areas === undefined
      ? 'skip'
      : {
          dayStarts,
          end,
          fourWeeksStart: addWeeks(weekStart, -3).getTime(),
          languages: slugs,
        },
  )
  const worth = useQuery(api.aggregate.worthHistory, { dayEnds })
  const levels = useQuery(
    api.aggregate.languageLevels,
    areas === undefined ? 'skip' : { slugs },
  )
  const review = useQuery(api.reviews.forWeek, { periodStart: key })

  const all = week && worth && levels ? { week, worth, levels } : undefined
  /* One page about one week, arriving as one, and held again when you page
     to another week — never last week's numbers under this week's name. */
  const data = useHeld(all, key)

  /* No live project, no commit chips: a row of zeros says nothing. */
  const commits =
    data && data.week.projects.length > 0
      ? Array.from({ length: 7 }, (_, k) =>
          data.week.projects.reduce((n, p) => n + p.days[k], 0),
        )
      : undefined
  const body = data?.week.body
  const showBody =
    body !== undefined &&
    (body.workouts4 > 0 ||
      (body.weight !== null &&
        body.weight.at >= addWeeks(weekStart, -3).getTime()))
  const spoken = languages.filter(
    (a) => (data?.week.languages.find((l) => l.slug === a.slug)?.four ?? 0) > 0,
  )
  const hasProjects = (data?.week.projects.length ?? 0) > 0
  const noteSpan = ['lg:col-span-2', 'lg:col-span-4', 'lg:col-span-6'][
    (showBody ? 0 : 1) + (spoken.length > 0 ? 0 : 1)
  ]

  return (
    <div className="flex flex-col gap-2.5">
      <WeekBar
        weekStart={weekStart}
        closed={review?.closedAt !== undefined}
        today={todayIndex}
        commits={commits}
        spent={data?.week.money.byDay}
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
            money={data.week.money}
            worth={data.worth}
            dayEnds={dayEnds}
            today={todayIndex}
            wasLabel={isThisWeek ? 'LAST WEEK' : 'WEEK BEFORE'}
            span={
              hasProjects
                ? 'col-span-2 lg:col-span-4 lg:row-span-2'
                : 'col-span-2 lg:col-span-6'
            }
          />
          {hasProjects ? (
            <ProjectsTile
              projects={data.week.projects}
              today={todayIndex}
              most={Math.max(1, ...(commits ?? []))}
            />
          ) : null}
          {showBody ? <BodyTile body={data.week.body} /> : null}
          {spoken.length > 0 ? (
            <LanguagesTile
              languages={spoken}
              week={data.week.languages}
              levels={data.levels}
            />
          ) : null}
          <NoteTile
            periodStart={key}
            review={review ?? null}
            span={`col-span-2 ${noteSpan}`}
          />
        </div>
      )}
    </div>
  )
}

/* The bento's shape while it loads: Finances and Projects, then the row. */
function BentoSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid grid-cols-2 gap-2.5 lg:grid-cols-6"
    >
      {['lg:col-span-4', 'lg:col-span-2'].map((span) => (
        <div
          key={span}
          className={`glass col-span-2 flex h-[460px] flex-col gap-3 rounded-[14px] p-3.5 ${span}`}
        >
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-8 w-1/3" />
        </div>
      ))}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="glass col-span-2 h-[130px] rounded-[14px] lg:col-span-2"
        />
      ))}
    </div>
  )
}
