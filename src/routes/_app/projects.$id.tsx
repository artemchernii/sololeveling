import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { CircleCheck, Plus, RotateCcw, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { useSave } from '@/components/Saving'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import { ProjectCommits } from '@/components/projects/ProjectCommits'
import { AddField } from '@/components/AddField'
import { ProjectHeader } from '@/components/projects/ProjectHeader'
import { TaskRow } from '@/components/projects/TaskRow'
import { ProjectNotes } from '@/components/projects/ProjectNotes'
import { useArrived, useHeld } from '@/lib/loading'
import { whenLabel } from '@/lib/format'

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
    /* One write, not create-then-attach: tasks.create takes the project and
       resolves the goal from it. The old pair left the task unattached for a
       beat, which meant it flashed into the backlog on its way here. */
    await adding.run(() => createTask({ title: trimmed, projectId }))
    setTitle('')
  }

  return (
    <div className={`flex flex-col gap-[18px] ${arrived}`}>
      <ProjectHeader
        project={project}
        counts={count}
        logoUrl={project.logoUrl}
        tasks={tasks}
      />

      {/* What is left beside what was written down. */}
      <div className="grid items-start gap-[18px] md:grid-cols-2">
        <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
          <div className="flex items-baseline justify-between gap-3">
            <div className="label-caps">Tasks</div>
            {open.length > 0 ? (
              <span className="font-mono text-[11px] text-ink-700">
                {open.length}
              </span>
            ) : null}
          </div>

          {open.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              Nothing open. Either this project is done or it is waiting on you
              to decide what is next.
            </p>
          ) : (
            <div className="flex flex-col">
              {open.map((task) => (
                /* No area badge here: a task made on this project already
                    carries the project's own area, so the badge could
                    only be pressed to make the answer wrong (20 Sep). */
                <TaskRow key={task._id} task={task} showArea={false} />
              ))}
            </div>
          )}

          <AddField
            value={title}
            onChange={setTitle}
            onSubmit={() => void add()}
            placeholder="Another task for this project"
            status={adding.status}
            onSettled={adding.settle}
            idle={<Plus className="size-3.5" />}
          />
        </div>

        <ProjectNotes projectId={projectId} />
      </div>

      {/* GitHub and Done share a row (20 Sep, fourth pass). He boxed the
          empty right-hand third of each: both were full-width cards holding
          content that stopped well short of the edge, and Done's short titles
          left a hole all the way across to the timestamp. Side by side, the
          width one does not need is the width the other uses. */}
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,5fr)_minmax(0,2fr)]">
        <ProjectCommits projectId={projectId} area={project.area} />

        {closed.length > 0 ? (
          /* What was finished, newest first (20 Sep). It was a stack of
             identical grey lines with no tick and no date — the one card on
             the page that is nothing but good news, rendered as the dimmest
             thing on it. */
          <div className="glass flex flex-col gap-2 rounded-[22px] p-6">
            <div className="flex items-baseline gap-2">
              <div className="label-caps">Done</div>
              <span className="font-mono text-[11px] text-state-good">
                {closed.length}
              </span>
            </div>
            {[...closed]
              .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
              .map((task) => (
                <DoneRow key={task._id} task={task} />
              ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* A finished task, and the two ways back (20 Sep). Ticking one is a claim, and
   a claim can be wrong: undo puts it back on the list, and the cross removes
   it outright. Both were already mutations — `tasks.reopen` and `tasks.remove`
   — with nothing on this page that reached them. The controls stay hidden
   until the row is hovered or focused, so the card still reads as a quiet
   list of things that went right. */
function DoneRow({ task }: { task: Doc<'tasks'> }) {
  const reopen = useMutation(api.tasks.reopen)
  const removeTask = useMutation(api.tasks.remove)

  return (
    <div className="group flex items-start gap-2.5 border-b border-lift/[0.05] py-1.5 last:border-b-0">
      <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-state-good" />
      <span className="min-w-0 flex-1 text-[12.5px] text-ink-300">
        {task.title}
        {task.completedAt !== undefined ? (
          <span className="pl-2 font-mono text-[11px] text-ink-600">
            {whenLabel(task.completedAt)}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          aria-label={`Put ${task.title} back on the list`}
          title="Back to open"
          onClick={() => void reopen({ taskId: task._id })}
          className="motion-press grid size-5 place-items-center rounded-[6px] text-ink-700 transition-colors hover:bg-lift/8 hover:text-lav-300"
        >
          <RotateCcw className="size-3" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${task.title}`}
          title="Delete"
          onClick={() => void removeTask({ taskId: task._id })}
          className="motion-press grid size-5 place-items-center rounded-[6px] text-ink-700 transition-colors hover:bg-state-danger/15 hover:text-state-danger"
        >
          <X className="size-3" />
        </button>
      </span>
    </div>
  )
}
