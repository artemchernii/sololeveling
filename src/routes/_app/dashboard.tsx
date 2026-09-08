import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useUser } from '@clerk/tanstack-react-start'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { ActionsLogged } from '@/components/dashboard/ActionsLogged'
import { ChainsCard } from '@/components/dashboard/ChainsCard'
import { QuestList } from '@/components/dashboard/QuestList'
import { StateStrip } from '@/components/dashboard/StateStrip'
import { TodayCard } from '@/components/dashboard/TodayCard'
import { localToday } from '@/lib/today'

export const Route = createFileRoute('/_app/dashboard')({
  component: Dashboard,
})

/* The morning screen, in PLAN.md §3's order: greeting and focus, TODAY beside
   CHAINS, CURRENT STATE, THIS MONTH, TODAY'S QUESTS.
 
   Every number on it comes from convex/aggregate.ts. This file composes them —
   it renders "2 of 4" from two source values — but it computes none of them,
   and there is no bar anywhere, because nothing here has a goals.targetValue
   behind it. */
function Dashboard() {
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

  const quests = useQuery(api.tasks.listToday, { today })
  const chains = useQuery(api.projects.listLive, {})

  const [justDone, setJustDone] = useState<Doc<'tasks'> | null>(null)

  const focus = chains?.find((c) => c.status === 'focus')
  const firstName = user?.firstName ?? user?.username ?? 'you'

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] leading-tight font-light text-foreground">
          {greeting(now)}, {firstName.toUpperCase()}.
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* LEVEL 32 is my age. It is a joke, and it stays honest by being one:
              it is not derived from anything and it never goes up because of
              what I did this week. */}
          <span className="label-caps">Level 32</span>
          <span className="text-ink-800">·</span>
          {focus ? (
            <>
              <span className="label-caps text-lav-400">Current focus</span>
              <span className="label-caps text-foreground">{focus.title}</span>
            </>
          ) : (
            <span className="label-caps">No chain in focus</span>
          )}
        </div>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <TodayCard tasks={quests} events={events ?? []} date={now} />
        <ChainsCard />
      </div>

      <StateStrip today={now.getTime()} />

      <ActionsLogged today={now.getTime()} />

      <QuestList tasks={quests} onCompleted={setJustDone} />

      {justDone ? (
        <FollowUp task={justDone} onDone={() => setJustDone(null)} />
      ) : null}
    </div>
  )
}

/* §3b.1 again, and for the same reason as on Quests: completing a task removes
   it from the list, so the prompt cannot live inside the row it belongs to. */
function FollowUp({
  task,
  onDone,
}: {
  task: Doc<'tasks'>
  onDone: () => void
}) {
  const kind =
    task.area === 'body'
      ? 'workout'
      : task.area === 'portuguese'
        ? 'session'
        : null
  if (!kind) {
    onDone()
    return null
  }

  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-[22px] p-4 text-[12.5px]">
      <span className="text-ink-400">{task.title}</span>
      <span className="text-ink-600">
        &mdash; done. Log it as a {kind} on Quests, or let it go.
      </span>
      <button
        type="button"
        onClick={onDone}
        className="ml-auto text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
      >
        Dismiss
      </button>
    </div>
  )
}

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
