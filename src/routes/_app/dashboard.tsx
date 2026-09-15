import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useUser } from '@clerk/tanstack-react-start'

import { api } from '../../../convex/_generated/api'
import { ActionsLogged } from '@/components/dashboard/ActionsLogged'
import { Principles } from '@/components/dashboard/Principles'
import { QuestList } from '@/components/dashboard/QuestList'
import { StateStrip } from '@/components/dashboard/StateStrip'
import { TodayCard } from '@/components/dashboard/TodayCard'
import { WeekGlance } from '@/components/dashboard/WeekGlance'
import { YearBar } from '@/components/dashboard/YearBar'
import { localToday } from '@/lib/today'
import { useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/dashboard')({
  component: Today,
})

/* Today — PLAN.md §3: greeting, LEVEL with its year, focus and a principle;
   TODAY beside TODAY'S THREE; CURRENT STATE; THIS MONTH; THIS WEEK.

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
  const firstName = user?.firstName ?? user?.username ?? 'you'

  return (
    /* Mobile order (§3): greeting → the three → TODAY → this month → this
       week → state. One source of markup, reordered: a phone-shaped copy of
       this screen is a second version of the same page, and they drift. */
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

      <div className="order-3 lg:order-2">
        <TodayCard
          tasks={quests}
          events={quests === undefined ? [] : (events ?? [])}
          date={now}
        />
      </div>

      <div className="order-2 lg:order-3">
        <QuestList tasks={quests} today={today} />
      </div>

      <div className="order-6 lg:order-4 lg:col-span-2">
        <StateStrip today={now.getTime()} />
      </div>

      <div className="order-4 lg:order-5 lg:col-span-2">
        <ActionsLogged today={now.getTime()} />
      </div>

      <div className="order-5 lg:order-6 lg:col-span-2">
        <WeekGlance today={now.getTime()} />
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
