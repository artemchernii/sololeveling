import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { GoalTimeline } from '@/components/goals/GoalTimeline'
import { MilestoneEditor } from '@/components/goals/MilestoneEditor'
import { NewGoal } from '@/components/goals/NewGoal'
import { Skeleton } from '@/components/Skeleton'
import { deadlineLabel } from '@/lib/format'
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
  const projects = useQuery(api.projects.listLive, {})
  const setStatus = useMutation(api.goals.setStatus)
  const removeGoal = useMutation(api.goals.remove)
  const update = useMutation(api.goals.update)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-[18px]">
      <NewGoal />
      {goals === undefined ? (
        /* Two goal cards as shape: title, target, the meta line, the actions. */
        <div role="status" aria-label="Loading" className="contents">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="glass flex flex-col gap-3 rounded-[22px] p-6"
            >
              <div className="flex h-5 items-center">
                <Skeleton className={i === 0 ? 'h-4 w-2/5' : 'h-4 w-1/3'} />
              </div>
              <Skeleton className="w-1/5" />
              <Skeleton className="h-2.5 w-16" />
              <div className="flex h-[38px] items-end border-t border-lift/[0.07]">
                <Skeleton className="h-[26px] w-48 rounded-[7px]" />
              </div>
            </div>
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className={`glass rounded-[22px] p-6 ${arrived}`}>
          <p className="text-[13px] text-ink-500">No goals yet.</p>
        </div>
      ) : (
        goals.map((goal) => (
          <div
            key={goal._id}
            id={`goal-${goal._id}`}
            className={`glass flex flex-col gap-3 rounded-[22px] p-6 ${arrived}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[18px] font-light text-foreground">
                {goal.title}
              </h2>
              <span className="label-caps">{goal.area}</span>
            </div>

            <Target goal={goal} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-600">
              {(projects ?? [])
                .filter((p) => p.goalId === goal._id)
                .map((p) => (
                  <Link
                    key={p._id}
                    to="/projects/$id"
                    params={{ id: p._id }}
                    className="text-ink-400 transition-colors hover:text-lav-300"
                  >
                    {p.title}
                  </Link>
                ))}
              <label className="flex items-center gap-1.5">
                <span>
                  {goal.deadline ? deadlineLabel(goal.deadline) : 'no deadline'}
                </span>
                <input
                  type="date"
                  aria-label={`Deadline for ${goal.title}`}
                  value={goal.deadline ?? ''}
                  onChange={(e) =>
                    void update({
                      goalId: goal._id,
                      deadline: e.target.value || null,
                    })
                  }
                  className="w-[7.5rem] rounded-[6px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 text-[11px] text-ink-400"
                />
              </label>
            </div>

            {/* A monthly tile target is read against its tile's log count, not
                walked through in steps — so it gets no timeline. */}
            {goal.tile === undefined ? (
              <div className="flex flex-col gap-3 border-t border-lift/[0.07] pt-3">
                <GoalTimeline goal={goal} />
                <details className="group">
                  <summary className="label-caps cursor-pointer list-none transition-colors hover:text-ink-300">
                    Milestones
                  </summary>
                  <div className="pt-2">
                    <MilestoneEditor goalId={goal._id} />
                  </div>
                </details>
              </div>
            ) : null}

            <div className="flex gap-2 border-t border-lift/[0.07] pt-3">
              <button
                type="button"
                onClick={() =>
                  void setStatus({ goalId: goal._id, status: 'done' })
                }
                className="rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300"
              >
                Reached it
              </button>
              <button
                type="button"
                onClick={() =>
                  void setStatus({ goalId: goal._id, status: 'dropped' })
                }
                className="rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lift/20 hover:text-ink-200"
              >
                Drop it
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await removeGoal({ goalId: goal._id })
                    setError(null)
                  } catch (e) {
                    /* A goal with projects under it refuses, and names them.
                       ConvexError carries that sentence in .data; a plain
                       Error would arrive wrapped in a stack trace. */
                    setError(
                      e instanceof ConvexError
                        ? String(e.data)
                        : 'That did not work.',
                    )
                  }
                }}
                className="rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-600 transition-colors hover:border-lift/20 hover:text-ink-300"
              >
                Delete
              </button>
            </div>

            {error ? (
              <p className="text-[12.5px] text-ink-400">{error}</p>
            ) : null}
          </div>
        ))
      )}
    </div>
  )
}

/* PLAN.md §1: a bar renders only where targetValue gives a real denominator.
   A label with no number is shown as text, and a goal with neither shows
   nothing at all rather than a bar at zero. */
function Target({ goal }: { goal: Doc<'goals'> }) {
  if (goal.targetValue !== undefined && goal.unit) {
    return (
      <div className="font-mono text-[12px] text-ink-300">
        target {goal.targetValue} {goal.unit}
        {goal.tile ? ' a month' : ''}
      </div>
    )
  }

  if (goal.targetLabel) {
    return (
      <div className="font-mono text-[12px] text-ink-300">
        target {goal.targetLabel}
      </div>
    )
  }

  return (
    <p className="text-[12.5px] text-ink-600">
      No target. Not everything worth doing has a number.
    </p>
  )
}
