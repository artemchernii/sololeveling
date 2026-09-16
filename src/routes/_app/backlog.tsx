import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { ArrowUp, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { AreaBadge } from '@/components/AreaBadge'
import { BindSelect } from '@/components/backlog/BindSelect'
import { DoneList } from '@/components/backlog/DoneList'
import { ScheduleTask } from '@/components/backlog/ScheduleTask'
import { SaveGlyph, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import type { Area } from '@/lib/capture-parser'
import { agoLabel, shortDate } from '@/lib/format'
import { localToday } from '@/lib/today'
import { useArrived, useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/backlog')({
  component: Backlog,
})

/* PLAN.md §3: the only place unpicked tasks live, and the only place their
   number is allowed to appear. Nothing here may be surfaced on the dashboard —
   "47 open tasks" on a morning screen is the number that makes people close
   the app (§3c.3).

   Two tabs since 17 Sep: Open, what is waiting; Done, what was ticked — so a
   finished task has a place once its day on Today ends. */
function Backlog() {
  const [view, setView] = useState<'open' | 'done'>('open')
  const today = localToday()
  const tasks = useHeld(useQuery(api.tasks.listBacklog, { today }))
  const arrived = useArrived(tasks)
  const picked = useQuery(api.tasks.listToday, { today })
  const projects = useQuery(api.projects.listLive, {})
  const goals = useQuery(api.goals.listActive, {})
  const goalsToBind = (goals ?? []).filter((g) => g.tile === undefined)

  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const setArea = useMutation(api.tasks.setArea)
  const removeTask = useMutation(api.tasks.remove)

  const [title, setTitle] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const adding = useSave()

  const full = (picked?.length ?? 0) >= 3

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || adding.status === 'saving') return
    await adding.run(() => createTask({ title: trimmed }))
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
        <div role="tablist" aria-label="Backlog" className="flex gap-4">
          {(['open', 'done'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`label-caps transition-colors ${
                view === v ? 'text-foreground' : 'hover:text-ink-300'
              }`}
            >
              {v === 'open' ? 'Backlog' : 'Done'}
            </button>
          ))}
        </div>
        <div className="label-caps">
          {view === 'done' || tasks === undefined
            ? ''
            : `${tasks.length} waiting`}
        </div>
      </div>

      {view === 'done' ? (
        <DoneList projects={projects ?? []} goals={goalsToBind} />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-lift/[0.07] pb-3">
            <SaveGlyph
              status={adding.status}
              onSettled={adding.settle}
              idle={<Plus className="size-3.5" />}
              className="text-ink-600"
            />
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
            <SkeletonRows rows={4} line="h-[61px]" />
          ) : tasks.length === 0 ? (
            <p className={`text-[13px] text-ink-500 ${arrived}`}>
              Empty. Everything you have written down is either done or on
              today.
            </p>
          ) : (
            <div className={`flex flex-col ${arrived}`}>
              {tasks.map((task) => (
                <div
                  key={task._id}
                  className="flex flex-col gap-1.5 border-b border-lift/[0.05] py-2.5 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
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
                        full
                          ? 'Today is full. Finish one or drop one.'
                          : undefined
                      }
                      className="flex items-center gap-1.5 rounded-[7px] border border-lift/10 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300 disabled:cursor-default disabled:border-lift/[0.06] disabled:text-ink-700 disabled:hover:text-ink-700"
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

                  {/* What is known about it: how long it has waited, what it is
                  for, and when — if anyone has said. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-ink-600">
                      added {agoLabel(task._creationTime)}
                    </span>
                    {/* Chosen for a day that ended without it being ticked. */}
                    {task.todayFor ? (
                      <span className="font-mono text-[11px] text-ink-500">
                        · picked {shortDate(task.todayFor)}, not done
                      </span>
                    ) : null}
                    <BindSelect
                      task={task}
                      projects={projects ?? []}
                      goals={goalsToBind}
                    />
                    <ScheduleTask task={task} />
                  </div>
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
        </>
      )}
    </div>
  )
}
