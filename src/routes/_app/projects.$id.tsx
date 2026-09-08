import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import type { Area } from '@/lib/capture-parser'
import { deadlineLabel } from '@/lib/format'

export const Route = createFileRoute('/_app/projects/$id')({
  component: Chain,
})

/* One chain, end to end: what it answers to, what is left, what is next. This
   is where a chain is actually built — tasks attached, focus set, and finally
   closed. */
function Chain() {
  const { id } = Route.useParams()
  const projectId = id as Id<'projects'>

  const project = useQuery(api.projects.get, { projectId })
  const tasks = useQuery(api.tasks.listByProject, { projectId })
  const counts = useQuery(api.aggregate.entityCounts, {})

  const createTask = useMutation(api.tasks.create)
  const setProject = useMutation(api.tasks.setProject)
  const setFocus = useMutation(api.projects.setFocus)
  const setStatus = useMutation(api.projects.setStatus)
  const complete = useMutation(api.tasks.complete)
  const setArea = useMutation(api.tasks.setArea)

  const removeProject = useMutation(api.projects.remove)
  const navigate = useNavigate()

  const [title, setTitle] = useState('')

  if (project === undefined) {
    return <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
  }

  if (project === null) {
    return (
      <div className="glass rounded-[22px] p-6">
        <p className="text-[13px] text-ink-500">No such chain.</p>
      </div>
    )
  }

  const count = counts?.tasksByProject[projectId]
  const open = (tasks ?? []).filter((t) => t.status === 'open')
  const closed = (tasks ?? []).filter((t) => t.status !== 'open')

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    const taskId = await createTask({ title: trimmed })
    await setProject({ taskId, projectId })
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <Link
          to="/projects"
          className="label-caps flex items-center gap-1.5 self-start transition-colors hover:text-ink-300"
        >
          <ArrowLeft className="size-3" />
          Chains
        </Link>

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[26px] font-light text-foreground">
            {project.title}
          </h1>
          <span className="label-caps">{project.status}</span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 font-mono text-[11px] text-ink-600">
          {count ? (
            <span>
              {count.done} of {count.total} tasks
            </span>
          ) : null}
          <span>
            {project.deadline ? deadlineLabel(project.deadline) : 'no end date'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-3">
          {project.status === 'focus' ? (
            <span className="label-caps rounded-[6px] bg-lav-900/70 px-2 py-1 text-lav-300">
              This is the focus
            </span>
          ) : (
            <Action onClick={() => void setFocus({ projectId })}>
              Make this the focus
            </Action>
          )}
          <Action
            onClick={() => void setStatus({ projectId, status: 'paused' })}
          >
            Pause
          </Action>
          <Action
            onClick={() => void setStatus({ projectId, status: 'completed' })}
          >
            Complete the chain
          </Action>
          <Action
            onClick={() => void setStatus({ projectId, status: 'archived' })}
          >
            Archive
          </Action>
          <Action
            onClick={async () => {
              await removeProject({ projectId })
              await navigate({ to: '/projects' })
            }}
          >
            <Trash2 className="mr-1 inline size-3" />
            Delete
          </Action>
        </div>
      </div>

      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <div className="label-caps">Open</div>

        {open.length === 0 ? (
          <p className="text-[13px] text-ink-500">
            Nothing open. Either this chain is done or it is waiting on you to
            decide what is next.
          </p>
        ) : (
          <div className="flex flex-col">
            {open.map((task) => (
              <div
                key={task._id}
                className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0"
              >
                <button
                  type="button"
                  aria-label={`Complete ${task.title}`}
                  onClick={() => void complete({ taskId: task._id })}
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
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <Plus className="size-3.5 text-ink-600" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
            placeholder="Another link in the chain"
            className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
          />
        </div>
      </div>

      {closed.length > 0 ? (
        <div className="glass flex flex-col gap-2 rounded-[22px] p-6">
          <div className="label-caps">Done</div>
          {closed.map((task) => (
            <div key={task._id} className="text-[12.5px] text-ink-600">
              {task.title}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Action({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[7px] border border-white/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-white/20 hover:text-ink-200"
    >
      {children}
    </button>
  )
}
