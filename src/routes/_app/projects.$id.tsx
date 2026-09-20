import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { GoalTimeline } from '@/components/goals/GoalTimeline'
import { SaveGlyph, useSave } from '@/components/Saving'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import type { Area } from '@/lib/capture-parser'
import { ProjectNotes } from '@/components/projects/ProjectNotes'
import { deadlineLabel, durationLabel } from '@/lib/format'
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
  /* The goal above it, for the FOR card. An empty string normalizes to null
     and comes back null, so there is nothing to draw until the project is. */
  const goal = useQuery(api.goals.get, { goalId: project?.goalId ?? '' })
  const tasks = useQuery(api.tasks.listByProject, { projectId })
  const counts = useQuery(api.aggregate.entityCounts, {})
  /* Month bounds on the client, as the dashboard computes them: the server
     does not know what month it is where you are. */
  const now = new Date()
  const time = useQuery(api.aggregate.projectTime, {
    projectId,
    start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
  })

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
        <div className="grid gap-[18px] md:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="glass flex flex-col gap-3 rounded-[22px] p-6"
            >
              <Skeleton className="h-2.5 w-12" />
              <SkeletonRows rows={3} />
            </div>
          ))}
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
          {time === undefined ? null : time.sessions === 0 ? (
            <span>no time logged this month</span>
          ) : (
            <span>
              {durationLabel(time.minutes)} this month · {time.sessions}{' '}
              {time.sessions === 1 ? 'session' : 'sessions'}
            </span>
          )}
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

      {/* What this project answers to, and where that goal has got to. */}
      {goal ? (
        <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="label-caps">For</span>
              <Link
                to="/goals"
                hash={`goal-${goal._id}`}
                className="text-[14px] text-foreground transition-colors hover:text-lav-300"
              >
                {goal.title}
              </Link>
            </div>
            {/* A project's goal used to be written once and never again: the
                only way to refile one was to delete it, and its tasks, notes
                and logged time went with it. */}
            <MoveToGoal projectId={projectId} currentGoalId={goal._id} />
          </div>
          <GoalTimeline goal={goal} />
        </div>
      ) : null}

      {/* What is left beside what was written down. */}
      <div className="grid items-start gap-[18px] md:grid-cols-2">
        <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
          <div className="label-caps">Open</div>

          {open.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              Nothing open. Either this project is done or it is waiting on you
              to decide what is next.
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

        <ProjectNotes projectId={projectId} />
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

/* Refile a project under a different goal. A select rather than a dialog:
   there is one thing to choose and it is a list of goals you already have.
   Monthly tile targets are left out — a project does not hang on "4 sessions
   a month" any more than it hangs on a tally. */
function MoveToGoal({
  projectId,
  currentGoalId,
}: {
  projectId: Id<'projects'>
  currentGoalId: Id<'goals'>
}) {
  const goals = useQuery(api.goals.listActive, {})
  const setGoal = useMutation(api.projects.setGoal)

  const choices = (goals ?? []).filter((g) => g.tile === undefined)
  if (choices.length < 2) return null

  return (
    <label className="flex items-center gap-2">
      <span className="label-caps">Move to</span>
      <select
        value={currentGoalId}
        aria-label="Move this project to another goal"
        onChange={(e) =>
          void setGoal({ projectId, goalId: e.target.value as Id<'goals'> })
        }
        className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-400"
      >
        {choices.map((g) => (
          <option key={g._id} value={g._id}>
            {g.title}
          </option>
        ))}
      </select>
    </label>
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
