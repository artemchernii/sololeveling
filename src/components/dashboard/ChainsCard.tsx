import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'

/* PLAN.md §3 item 2, right column: goal → focus project → done/total · next
   action, with a FOCUS / LIVE / IDLE tag.
 
   Counts come from entityCounts(); "next action" is the first open task on the
   chain. §3c.2 keeps the non-focus rows to a line — no task lists here either. */

export function ChainsCard() {
  const chains = useQuery(api.projects.listLive, {})
  const goals = useQuery(api.goals.listActive, {})
  const counts = useQuery(api.aggregate.entityCounts, {})
  const openTasks = useQuery(api.tasks.listBacklog, {})

  const ordered = [...(chains ?? [])].sort((a, b) =>
    a.status === 'focus' ? -1 : b.status === 'focus' ? 1 : 0,
  )

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Chains</div>
        <div className="label-caps">
          {chains ? `${chains.length} live` : ''}
        </div>
      </div>

      {chains === undefined ? (
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : ordered.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          No chains yet.{' '}
          <Link to="/projects" className="text-lav-300">
            Start one
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col">
          {ordered.map((chain) => {
            const goal = goals?.find((g) => g._id === chain.goalId)
            const count = counts?.tasksByProject[chain._id]
            const next = (openTasks ?? []).find(
              (t) => t.projectId === chain._id,
            )

            return (
              <div
                key={chain._id}
                className="flex flex-col gap-1 border-b border-white/[0.05] py-2.5 last:border-b-0"
              >
                {goal ? <div className="label-caps">{goal.title}</div> : null}

                <div className="flex items-baseline gap-2">
                  <Link
                    to="/projects/$id"
                    params={{ id: chain._id }}
                    className="text-[13px] text-foreground transition-colors hover:text-lav-300"
                  >
                    {chain.title}
                  </Link>
                  {count ? (
                    <span className="font-mono text-[11px] text-ink-600">
                      {count.done} of {count.total} tasks
                    </span>
                  ) : null}
                  <Tag status={chain.status} hasOpen={next !== undefined} />
                </div>

                <div className="text-[12.5px] text-ink-500">
                  {next ? (
                    <>
                      <span className="label-caps mr-2">Next</span>
                      {next.title}
                    </>
                  ) : (
                    'No next action.'
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* FOCUS is the only tag that gets the accent (§3): one lavender, reserved for
   live and focus things. IDLE means a live chain with nothing open on it —
   which is information, not a scolding. */
function Tag({ status, hasOpen }: { status: string; hasOpen: boolean }) {
  const label = status === 'focus' ? 'focus' : hasOpen ? 'live' : 'idle'
  const focus = label === 'focus'
  return (
    <span
      className={`label-caps ml-auto shrink-0 rounded-[4px] px-1.5 py-0.5 ${
        focus ? 'bg-lav-900/70 text-lav-300' : 'bg-white/5'
      }`}
    >
      {label}
    </span>
  )
}
