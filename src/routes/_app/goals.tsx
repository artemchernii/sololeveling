import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalShelf } from '@/components/goals/GoalShelf'
import { NewGoal } from '@/components/goals/NewGoal'
import { Skeleton } from '@/components/Skeleton'
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

  /* A monthly target is a goal row too (goals.setTileTarget), but it is a
     number on a Today tile, not a thing walked towards: it stays there. */
  const longTerm = (goals ?? []).filter((g) => g.tile === undefined)

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
      ) : (
        <>
          {/* Goals only (24 Sep). Monthly targets were shown here too, as
              a copy of the six Today tiles — the same numbers in two places.
              They live on Today, where they are seen every morning; this
              page is for things walked towards in steps. */}
          <section className="flex flex-col gap-3">
            <h2 className="label-caps px-1">Goals</h2>
            {longTerm.length === 0 ? (
              <div className={`glass rounded-[22px] p-6 ${arrived}`}>
                <p className="text-[13px] text-ink-500">
                  No goal yet — something to walk towards, in steps. Start one
                  above.
                </p>
              </div>
            ) : (
              longTerm.map((goal) => (
                /* The id is what a milestone on the calendar links to. */
                <div key={goal._id} id={`goal-${goal._id}`}>
                  <GoalCard goal={goal} />
                </div>
              ))
            )}
          </section>
        </>
      )}
      {goals === undefined ? null : <GoalShelf />}
    </div>
  )
}
