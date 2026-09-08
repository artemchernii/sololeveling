import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { Check } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import type { Area } from '@/lib/capture-parser'

/* PLAN.md §3 item 5. At most three; when the slots are full the "add"
   affordance is replaced by a sentence rather than left there disabled.
 
   No backlog count anywhere on this screen (§3c.3) — that number lives on its
   own page or nowhere. The link below says "Backlog", never "47 waiting". */

export function QuestList({
  tasks,
  onCompleted,
}: {
  tasks: Array<Doc<'tasks'>> | undefined
  onCompleted: (task: Doc<'tasks'>) => void
}) {
  const complete = useMutation(api.tasks.complete)
  const setArea = useMutation(api.tasks.setArea)

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Today&rsquo;s quests</div>
        <div className="label-caps">{tasks ? `${tasks.length} of 3` : ''}</div>
      </div>

      {tasks === undefined ? (
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : tasks.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing picked yet. Three is the whole day &mdash; choose them on{' '}
          <Link to="/quests" className="text-lav-300">
            Quests
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <div
              key={task._id}
              className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0"
            >
              <button
                type="button"
                aria-label={`Complete ${task.title}`}
                onClick={async () => {
                  await complete({ taskId: task._id })
                  onCompleted(task)
                }}
                className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-white/15 text-transparent transition-colors hover:border-lav-500 hover:text-lav-300"
              >
                <Check className="size-3" />
              </button>

              <span className="flex-1 text-[13px] text-foreground">
                {task.title}
              </span>

              <AreaBadge
                area={task.area}
                onChange={(area: Area) =>
                  void setArea({ taskId: task._id, area })
                }
              />

              {task.durationMin ? (
                <span className="font-mono text-[11px] text-ink-600">
                  {task.durationMin} min
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {tasks && tasks.length >= 3 ? (
        <p className="text-[12.5px] text-ink-400">
          Today is full. Finish one or drop one.
        </p>
      ) : null}
    </div>
  )
}
