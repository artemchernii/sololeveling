import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { GoalCard } from '@/components/goals/GoalCard'
import { MonthTarget } from '@/components/goals/MonthTarget'
import { NewGoal } from '@/components/goals/NewGoal'
import { Skeleton } from '@/components/Skeleton'
import { daysLeftInMonth, monthRange } from '@/lib/month'
import { MONTH_TILES } from '@/lib/tiles'
import { useArrived, useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/goals')({
  component: Goals,
})

/* Goals are what work answers to. A goal can stand alone — "gain 5 kg of
   muscle" has milestones, not a project — or carry projects, which always
   have one above them (R3, 16 Sep). This page is where they are made,
   dated, stepped through, and finally called done or dropped. */
function Goals() {
  const goals = useHeld(useQuery(api.goals.listActive, {}))
  const arrived = useArrived(goals)

  /* 24 Sep: monthly targets and long-term goals were one list of identical
     cards. They are different things — a number that resets each month, and
     a thing you are walking towards — so they are two sections. */
  const monthly = (goals ?? []).filter((g) => g.tile !== undefined)
  const longTerm = (goals ?? []).filter((g) => g.tile === undefined)

  const now = new Date()
  const counts = useQuery(api.aggregate.monthCounts, monthRange(now.getTime()))
  const daysLeft = daysLeftInMonth(now)

  return (
    <div className="flex flex-col gap-[18px]">
      <NewGoal />
      {goals === undefined ? (
        /* Two goal cards as shape: title, chips, the steps. */
        <div role="status" aria-label="Loading" className="contents">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="glass flex flex-col gap-3 rounded-[22px] p-6"
            >
              <Skeleton className={i === 0 ? 'h-5 w-2/5' : 'h-5 w-1/3'} />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-[52px] w-full" />
            </div>
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className={`glass rounded-[22px] p-6 ${arrived}`}>
          <p className="text-[13px] text-ink-500">
            No goals yet. Name one above — a thing to walk towards, or a number
            to hit each month.
          </p>
        </div>
      ) : (
        <>
          {monthly.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="label-caps px-1">This month</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {monthly.map((goal) => (
                  <div key={goal._id} id={`goal-${goal._id}`}>
                    <MonthTarget
                      goal={goal}
                      tile={MONTH_TILES.find((t) => t.key === goal.tile)}
                      count={
                        counts && goal.tile ? counts[goal.tile].now : undefined
                      }
                      daysLeft={daysLeft}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {longTerm.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="label-caps px-1">Goals</h2>
              {longTerm.map((goal) => (
                /* The id is what a milestone on the calendar links to. */
                <div key={goal._id} id={`goal-${goal._id}`}>
                  <GoalCard goal={goal} />
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
