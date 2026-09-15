import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { SaveGlyph, useSave } from '@/components/Saving'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import type { Area } from '@/lib/capture-parser'
import { deadlineLabel } from '@/lib/format'
import { useArrived, useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/projects/$id')({
  component: Project,
})

/* One project, end to end: what it answers to, what is left, what is next.
   This is where a project is actually built — tasks attached, focus set, and
   finally closed. */
function Project() {
  const { id } = Route.useParams()
  const projectId = id as Id<'projects'>

  const project = useHeld(useQuery(api.projects.get, { projectId }))
  const arrived = useArrived(project)
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
  const adding = useSave()

  if (project === undefined) {
    /* The header card and the open list, as shape (§3d.2). */
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex flex-col gap-[18px]"
      >
        <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
          <Skeleton className="h-2.5 w-16" />
          <div className="flex h-[29px] items-center">
            <Skeleton className="h-5 w-2/5" />
          </div>
          <Skeleton className="h-2.5 w-1/4" />
          <div className="flex h-[38px] items-end border-t border-lift/[0.07]">
            <Skeleton className="h-[26px] w-3/5 rounded-[7px]" />
          </div>
        </div>
        <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
          <Skeleton className="h-2.5 w-12" />
          <SkeletonRows rows={3} />
        </div>
      </div>
    )
  }

  if (project === null) {
    return (
      <div className="glass rounded-[22px] p-6">
        <p className="text-[13px] text-ink-500">No such project.</p>
      </div>
    )
  }

  const count = counts?.tasksByProject[projectId]
  const open = (tasks ?? []).filter((t) => t.status === 'open')
  const closed = (tasks ?? []).filter((t) => t.status !== 'open')

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || adding.status === 'saving') return
    await adding.run(async () => {
      const taskId = await createTask({ title: trimmed })
      await setProject({ taskId, projectId })
    })
    setTitle('')
  }

  return (
    <div className={`flex flex-col gap-[18px] ${arrived}`}>
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <Link
          to="/projects"
          className="label-caps flex items-center gap-1.5 self-start transition-colors hover:text-ink-300"
        >
          <ArrowLeft className="size-3" />
          Projects
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

        <div className="flex flex-wrap gap-2 border-t border-lift/[0.07] pt-3">
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
            Complete the project
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
            Nothing open. Either this project is done or it is waiting on you to
            decide what is next.
          </p>
        ) : (
          <div className="flex flex-col">
            {open.map((task) => (
              <div
                key={task._id}
                className="flex items-center gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0"
              >
                <button
                  type="button"
                  aria-label={`Complete ${task.title}`}
                  onClick={() => void complete({ taskId: task._id })}
                  className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-lift/15 text-transparent transition-colors hover:border-lav-500 hover:text-lav-300"
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

        <div className="flex items-center gap-2 border-t border-lift/[0.07] pt-3">
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
            placeholder="Another task for this project"
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
      className="rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lift/20 hover:text-ink-200"
    >
      {children}
    </button>
  )
}
