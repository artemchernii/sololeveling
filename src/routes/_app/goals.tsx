import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { deadlineLabel } from '@/lib/format'

export const Route = createFileRoute('/_app/goals')({
  component: Goals,
})

/* Goals are what chains answer to. They are created on the Projects page, in
   the same form as their first project — a goal with no work under it is a
   wish, and this app is not for those. This page is where they are reviewed,
   and where one is finally called done or dropped. */
function Goals() {
  const goals = useQuery(api.goals.listActive, {})
  const chains = useQuery(api.projects.listLive, {})
  const setStatus = useMutation(api.goals.setStatus)
  const removeGoal = useMutation(api.goals.remove)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-[18px]">
      {goals === undefined ? (
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : goals.length === 0 ? (
        <div className="glass rounded-[22px] p-6">
          <p className="text-[13px] text-ink-500">
            No goals yet. They are created with their first chain, on the
            Projects page.
          </p>
        </div>
      ) : (
        goals.map((goal) => (
          <div
            key={goal._id}
            className="glass flex flex-col gap-3 rounded-[22px] p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[18px] font-light text-foreground">
                {goal.title}
              </h2>
              <span className="label-caps">{goal.area}</span>
            </div>

            <Target goal={goal} />

            <div className="flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-ink-600">
              <span>
                {(chains ?? []).filter((c) => c.goalId === goal._id).length}{' '}
                chains
              </span>
              {goal.deadline ? (
                <span>{deadlineLabel(goal.deadline)}</span>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-white/[0.07] pt-3">
              <button
                type="button"
                onClick={() =>
                  void setStatus({ goalId: goal._id, status: 'done' })
                }
                className="rounded-[7px] border border-white/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300"
              >
                Reached it
              </button>
              <button
                type="button"
                onClick={() =>
                  void setStatus({ goalId: goal._id, status: 'dropped' })
                }
                className="rounded-[7px] border border-white/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-white/20 hover:text-ink-200"
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
                    /* A goal with chains under it refuses, and names them.
                       ConvexError carries that sentence in .data; a plain
                       Error would arrive wrapped in a stack trace. */
                    setError(
                      e instanceof ConvexError
                        ? String(e.data)
                        : 'That did not work.',
                    )
                  }
                }}
                className="rounded-[7px] border border-white/10 px-2.5 py-1 text-[11.5px] text-ink-600 transition-colors hover:border-white/20 hover:text-ink-300"
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
