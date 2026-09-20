import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { CircleCheck, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
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
  /* The goal above it, for the header's goal line. An empty string
     normalizes to null and comes back null, so there is nothing to draw
     until the project is. */
  const goal = useQuery(api.goals.get, { goalId: project?.goalId ?? '' })
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
        goal={goal}
        counts={count}
        logoUrl={project.logoUrl}
      />

      {/* What is left beside what was written down. */}
      <div className="grid items-start gap-[18px] md:grid-cols-2">
        <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
          <div className="label-caps">Tasks</div>

          {open.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              Nothing open. Either this project is done or it is waiting on you
              to decide what is next.
            </p>
          ) : (
            <div className="flex flex-col">
              {open.map((task) => (
                <TaskRow key={task._id} task={task} />
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
        <ProjectCommits projectId={projectId} area={goal?.area} />

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
                <div
                  key={task._id}
                  className="flex items-start gap-2.5 border-b border-lift/[0.05] py-1.5 last:border-b-0"
                >
                  <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-state-good" />
                  {/* The time runs on from the title rather than being pinned
                      to the far edge: right-aligned, two short titles left a
                      hole all the way across the card. */}
                  <span className="min-w-0 text-[12.5px] text-ink-300">
                    {task.title}
                    {task.completedAt !== undefined ? (
                      <span className="pl-2 font-mono text-[11px] text-ink-600">
                        {whenLabel(task.completedAt)}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* Refile a project under a different goal. A select rather than a dialog:
   there is one thing to choose and it is a list of goals you already have.
   Monthly tile targets are left out — a project does not hang on "4 sessions
   a month" any more than it hangs on a tally. */
