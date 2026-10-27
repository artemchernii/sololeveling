import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useUser } from '@clerk/tanstack-react-start'

import { api } from '../../../convex/_generated/api'
import { MonthSix, useMonth } from '@/components/dashboard/MonthSix'
import { WeekCard } from '@/components/dashboard/WeekCard'
import { Principles } from '@/components/dashboard/Principles'
import { TaskBar } from '@/components/dashboard/TaskBar'
import type { Pick } from '@/components/dashboard/TaskBar'
import type { ICONS } from '@/components/dashboard/AreaIcon'
import { YearBar } from '@/components/dashboard/YearBar'
import { langShort } from '@/lib/languages/catalog'
import { localToday } from '@/lib/today'
import { useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/dashboard')({
  component: Today,
})

/* Today — PLAN.md §3: greeting, LEVEL with its year, focus and a principle;
   one live TODAY card with TODAY'S THREE in it; THIS MONTH as his six
   (17 Oct, mockup design/today-mockup/month.html).

   Every number on it comes from convex/aggregate.ts. This file composes them
   and computes none. Two kinds of bar, each with a real denominator: the year
   of LEVEL (a calendar fact) and a month tile's target (a goal's
   targetValue, §1). */
function Today() {
  const { user } = useUser()
  const now = new Date()
  const today = localToday(now)

  /* Rows, not occurrences: a series that began in March is one row that the
     mapper expands into whatever falls inside today (§3b.6). */
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const events = useQuery(api.events.listInRange, {
    from: dayStart.getTime(),
    to: dayEnd.getTime(),
  })

  const tasks = useQuery(api.tasks.listToday, { today })
  const projects = useQuery(api.projects.listLive, {})

  /* The two day cards arrive together, and only once both reads are in: a
     skeleton and the state that replaces it are different heights, so cards
     landing one after another stepped the page twice on every load (Artem
     called it flickering, 16 Sep). The weekly review already works this way
     — one page about one day, arriving as one. Held on top of that, so a
     page that opens without its data still shows the skeleton long enough to
     be seen (§3d.2). */
  const dayReady = tasks !== undefined && events !== undefined
  const quests = useHeld(dayReady ? tasks : undefined)

  const focus = projects?.find((p) => p.status === 'focus')
  const firstName = user?.firstName ?? user?.username ?? 'HUNTER'

  const areas = useQuery(api.areas.list, {})
  const languageAreas = areas?.filter((a) => a.track === 'language')
  const languages = languageAreas?.map((a) => a.slug)
  /* PT and ENG apart (25 Oct): a badge per language area. */
  const langs = (languageAreas ?? []).map((a) => ({
    slug: a.slug,
    short: langShort(a),
  }))
  const lang = languages?.[0] ?? 'portuguese'
  const month = useMonth(now, languages)
  const goals = useQuery(api.goals.listActive, {})
  const focusTasks = useQuery(
    api.tasks.listByProject,
    focus ? { projectId: focus._id } : 'skip',
  )
  const iconFor = (area: string | undefined): keyof typeof ICONS | undefined =>
    area === undefined
      ? undefined
      : languages?.includes(area)
        ? 'language'
        : area === 'body' ||
            area === 'social' ||
            area === 'projects' ||
            area === 'money'
          ? area
          : undefined

  /* What the next empty slot offers besides today's events: a goal behind
     its month, the focus project's next open task. */
  const sum = (k: 'langs' | 'workout') =>
    month.counts?.[k].days.reduce((a, b) => a + b, 0) ?? 0
  const behind: Array<Pick> = (goals ?? []).flatMap((g) => {
    const k =
      g.tile === 'portuguese' ? 'langs' : g.tile === 'body' ? 'workout' : null
    if (k === null || g.targetValue === undefined || sum(k) >= g.targetValue)
      return []
    return [{ title: g.title, area: g.area, icon: iconFor(g.area) }]
  })
  const nextTask = focusTasks?.find(
    (t) => t.status === 'open' && t.todayFor !== today,
  )
  const picks: Array<Pick> = [
    ...behind,
    ...(nextTask
      ? [
          {
            title: nextTask.title,
            area: nextTask.area,
            icon: iconFor(nextTask.area),
            taskId: nextTask._id,
          },
        ]
      : []),
  ]

  return (
    /* One column on a phone, the same order: greeting → TODAY → this
       month. */
    <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2">
      {/* Who and when on the left, the principle card on the right: the six
          used to sit under the greeting as a list, which pushed the day's
          cards below the fold and read as a wall (16 Sep). */}
      <div className="order-1 flex flex-col gap-4 lg:col-span-2 lg:flex-row lg:items-stretch lg:gap-8">
        <div className="flex flex-1 flex-col justify-center gap-2">
          <h1 className="text-[34px] leading-tight font-light text-foreground">
            {greeting(now)}, {firstName.toUpperCase()}.
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* LEVEL is my age, from the birthday in lib/year.ts. It is a
                joke, and it stays honest by being one: it goes up on 14
                December and never because of what I did this week. */}
            <YearBar date={now} />
            {/* Nothing until projects arrive: "No project in focus" is a
                claim, and a loading screen does not get to make one
                (§3d.2). It holds the line's height while it waits, so the
                page does not step down when the answer lands. */}
            {projects === undefined ? (
              <span aria-hidden className="label-caps invisible">
                Current focus
              </span>
            ) : (
              <>
                <span className="text-ink-800">·</span>
                {focus ? (
                  <>
                    <span className="label-caps text-lav-400">
                      Current focus
                    </span>
                    <span className="label-caps text-foreground">
                      {focus.title}
                    </span>
                  </>
                ) : (
                  <span className="label-caps">No project in focus</span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="lg:w-[46%] lg:max-w-[560px] lg:shrink-0">
          <Principles />
        </div>
      </div>

      <div className="order-2 lg:col-span-2">
        <WeekCard
          now={now}
          languages={languages}
          langs={langs.length > 0 ? langs : [{ slug: lang, short: 'PT' }]}
          bar={
            quests === undefined ? null : (
              <TaskBar
                tasks={quests}
                events={events ?? []}
                today={today}
                picks={picks}
                iconFor={iconFor}
                now={now}
              />
            )
          }
        />
      </div>

      <div className="order-3 lg:col-span-2">
        <MonthSix
          month={month}
          now={now}
          langs={langs.length > 0 ? langs : [{ slug: lang, short: 'PT' }]}
        />
      </div>
    </div>
  )
}

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
