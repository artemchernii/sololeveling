import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { ArrowUp, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { AreaBadge } from '@/components/AreaBadge'
import type { Area } from '@/lib/capture-parser'
import { localToday } from '@/lib/today'

export const Route = createFileRoute('/_app/backlog')({
  component: Backlog,
})

/* PLAN.md §3: the only place unpicked tasks live, and the only place their
   number is allowed to appear. Nothing here may be surfaced on the dashboard —
   "47 open tasks" on a morning screen is the number that makes people close
   the app (§3c.3). */
function Backlog() {
  const today = localToday()
  const tasks = useQuery(api.tasks.listBacklog, {})
  const picked = useQuery(api.tasks.listToday, { today })

  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const setArea = useMutation(api.tasks.setArea)
  const removeTask = useMutation(api.tasks.remove)

  const [title, setTitle] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  const full = (picked?.length ?? 0) >= 3

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    await createTask({ title: trimmed })
    setTitle('')
  }

  async function pick(taskId: Parameters<typeof pickForToday>[0]['taskId']) {
    try {
      await pickForToday({ taskId, today })
      setRefusal(null)
    } catch (e) {
      /* The limit is enforced in the mutation, not here — the UI disables the
         button as a courtesy, and this is what happens when the courtesy and
         the rule disagree. */
      setRefusal(
        e instanceof ConvexError && e.data === 'TODAY_FULL'
          ? 'Today is full. Finish one or drop one.'
          : 'That did not work.',
      )
    }
  }

  return (
    <div className="glass flex flex-col gap-4 rounded-[22px] p-6">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Backlog</div>
        <div className="label-caps">
          {tasks === undefined ? '' : `${tasks.length} waiting`}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/[0.07] pb-3">
        <Plus className="size-3.5 text-ink-600" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="Something to do, eventually"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </div>

      {tasks === undefined ? (
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : tasks.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Empty. Everything you have written down is either done or on today.
        </p>
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <div
              key={task._id}
              className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0"
            >
              <span className="flex-1 text-[13px] text-foreground">
                {task.title}
              </span>

              <AreaBadge
                area={task.area}
                onChange={(area: Area) =>
                  void setArea({ taskId: task._id, area })
                }
              />

              <button
                type="button"
                disabled={full}
                onClick={() => void pick(task._id)}
                title={
                  full ? 'Today is full. Finish one or drop one.' : undefined
                }
                className="flex items-center gap-1.5 rounded-[7px] border border-white/10 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300 disabled:cursor-default disabled:border-white/[0.06] disabled:text-ink-700 disabled:hover:text-ink-700"
              >
                <ArrowUp className="size-3" />
                Today
              </button>

              <button
                type="button"
                aria-label={`Delete ${task.title}`}
                onClick={() => void removeTask({ taskId: task._id })}
                className="text-ink-700 transition-colors hover:text-ink-400"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {refusal ? (
        <p className="text-[13px] text-ink-400">{refusal}</p>
      ) : full ? (
        <p className="text-[13px] text-ink-500">
          Today is full. Finish one or drop one.
        </p>
      ) : null}
    </div>
  )
}
