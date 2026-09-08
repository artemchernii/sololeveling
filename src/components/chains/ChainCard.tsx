import { Link } from '@tanstack/react-router'

import type { Doc } from '../../../convex/_generated/dataModel'
import { deadlineLabel } from '@/lib/format'

/* PLAN.md §3 draws a full card: title, "11 of 17 tasks", "ends 30 Sep · 23
   days", three open tasks, NEXT →. §3c.2 then says non-focus chains render as
   title and next action only, "no task lists, no counts competing for
   attention".
 
   §3c.2 wins, because it is the later and more specific rule and it is the one
   doing real work: the whole point of a focus chain is that it looks different
   from the others. So the focus chain gets §3's anatomy and everything else
   gets two lines. */

export type ChainCounts = { done: number; total: number; open: number }

export function ChainCard({
  project,
  counts,
  nextTask,
  openTasks,
  onFocus,
}: {
  project: Doc<'projects'>
  counts: ChainCounts | undefined
  nextTask: Doc<'tasks'> | undefined
  openTasks: Array<Doc<'tasks'>>
  onFocus: () => void
}) {
  const isFocus = project.status === 'focus'

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-start justify-between gap-3">
        <Link
          to="/projects/$id"
          params={{ id: project._id }}
          className="text-[15px] text-foreground transition-colors hover:text-lav-300"
        >
          {project.title}
        </Link>
        <StatusTag status={project.status} />
      </div>

      {isFocus ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] text-ink-600">
            {/* Counted in aggregate.ts and rendered here — never computed in a
                component, and never turned into a percentage (§1). */}
            {counts ? (
              <span>
                {counts.done} of {counts.total} tasks
              </span>
            ) : null}
            {project.deadline ? (
              <span>{deadlineLabel(project.deadline)}</span>
            ) : (
              <span>no end date</span>
            )}
          </div>

          {openTasks.length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
              {openTasks.slice(0, 3).map((task) => (
                <div key={task._id} className="text-[12.5px] text-ink-400">
                  {task.title}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-600">
              Nothing open. This chain is waiting on you to decide what is next.
            </p>
          )}
        </>
      ) : (
        /* §3c.2: title and next action. Nothing else may compete. */
        <div className="text-[12.5px] text-ink-500">
          {nextTask ? (
            <>
              <span className="label-caps mr-2">Next</span>
              {nextTask.title}
            </>
          ) : (
            'No next action.'
          )}
        </div>
      )}

      {!isFocus ? (
        <button
          type="button"
          onClick={onFocus}
          className="self-start rounded-[7px] border border-white/10 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300"
        >
          Make this the focus
        </button>
      ) : null}
    </div>
  )
}

/* The lavender accent is reserved for live and focus things (§3), so FOCUS is
   the only tag that gets it. */
function StatusTag({ status }: { status: Doc<'projects'>['status'] }) {
  const focus = status === 'focus'
  return (
    <span
      className={`label-caps shrink-0 rounded-[4px] px-1.5 py-0.5 ${
        focus ? 'bg-lav-900/70 text-lav-300' : 'bg-white/5'
      }`}
    >
      {status}
    </span>
  )
}
