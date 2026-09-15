import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useUser } from '@clerk/tanstack-react-start'

import { api } from '../../../convex/_generated/api'
import { ActionsLogged } from '@/components/dashboard/ActionsLogged'
import { PrincipleLine } from '@/components/dashboard/PrincipleLine'
import { QuestList } from '@/components/dashboard/QuestList'
import { StateStrip } from '@/components/dashboard/StateStrip'
import { TodayCard } from '@/components/dashboard/TodayCard'
import { YearBar } from '@/components/dashboard/YearBar'
import { localToday } from '@/lib/today'
import { useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/dashboard')({
  component: Today,
})

/* Today — PLAN.md §3 (15 Sep): greeting, focus and a principle; TODAY beside
   TODAY'S THREE; CURRENT STATE; THIS MONTH. The chains card and the Business
   and Career cells are gone: projects were counted twice, and Career had
   nothing to count.

   Every number on it comes from convex/aggregate.ts. This file composes them
   and computes none, and there is no bar anywhere yet — R2 adds the year bar
   (a calendar fact) and targets on the tiles (goals.targetValue, §1). */
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

  /* Held at the source, so TODAY and the three leave their skeletons
     together rather than one card at a time. */
  const quests = useHeld(useQuery(api.tasks.listToday, { today }))
  const projects = useQuery(api.projects.listLive, {})

  const focus = projects?.find((p) => p.status === 'focus')
  const firstName = user?.firstName ?? user?.username ?? 'you'

  return (
    /* Mobile order (§3): greeting → the three → TODAY → this month → state.
       One source of markup, reordered: a phone-shaped copy of this screen is
       a second version of the same page, and they drift. */
    <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2">
      <div className="order-1 flex flex-col gap-2 lg:col-span-2">
        <h1 className="text-[34px] leading-tight font-light text-foreground">
          {greeting(now)}, {firstName.toUpperCase()}.
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* LEVEL is my age, from the birthday in lib/year.ts. It is a joke,
              and it stays honest by being one: it goes up on 14 December and
              never because of what I did this week. */}
          <YearBar date={now} />
          {/* Nothing until projects arrive: "No project in focus" is a claim,
              and a loading screen does not get to make one (§3d.2). */}
          {projects === undefined ? null : (
            <>
              <span className="text-ink-800">·</span>
              {focus ? (
                <>
                  <span className="label-caps text-lav-400">Current focus</span>
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
        <PrincipleLine date={now} />
      </div>

      <div className="order-3 lg:order-2">
        <TodayCard tasks={quests} events={events ?? []} date={now} />
      </div>

      <div className="order-2 lg:order-3">
        <QuestList tasks={quests} today={today} />
      </div>

      <div className="order-5 lg:order-4 lg:col-span-2">
        <StateStrip today={now.getTime()} />
      </div>

      <div className="order-4 lg:order-5 lg:col-span-2">
        <ActionsLogged today={now.getTime()} />
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
