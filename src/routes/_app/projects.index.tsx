import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AREAS } from '@/components/AreaBadge'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { SaveLabel, useSave } from '@/components/Saving'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import type { Area } from '@/lib/capture-parser'
import { useArrived, useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/projects/')({
  component: Projects,
})

/* The projects grid (PLAN.md §3). One focus project at the top with its full
   anatomy; the rest as title and next action (§3c.2).

   "New project" is one form: a goal and the project together, because a
   project without a goal above it is the thing this app exists to prevent.
   They were called chains until 15 Sep; only the word changed. */
function Projects() {
  const projects = useHeld(useQuery(api.projects.listLive, {}))
  const arrived = useArrived(projects)
  const counts = useQuery(api.aggregate.entityCounts, {})
  const openTasks = useQuery(api.tasks.listBacklog, {})
  const setFocus = useMutation(api.projects.setFocus)

  const focus = projects?.find((p) => p.status === 'focus')
  const rest = projects?.filter((p) => p.status !== 'focus') ?? []

  function tasksFor(project: Doc<'projects'>) {
    return (openTasks ?? []).filter((t) => t.projectId === project._id)
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <NewProject />

      {projects === undefined ? (
        /* The focus card with its open tasks, then two quiet ones (§3c.2). */
        <div role="status" aria-label="Loading" className="contents">
          <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
            <div className="flex h-[23px] items-center">
              <Skeleton className="h-3.5 w-1/3" />
            </div>
            <Skeleton className="h-2.5 w-1/4" />
            <SkeletonRows rows={3} />
          </div>
          <div className="grid gap-[18px] md:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="glass flex flex-col gap-3 rounded-[22px] p-5"
              >
                <div className="flex h-[23px] items-center">
                  <Skeleton className="h-3.5 w-2/5" />
                </div>
                <Skeleton className="w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className={`glass rounded-[22px] p-6 ${arrived}`}>
          <p className="text-[13px] text-ink-500">
            No projects yet. A project is work under a goal &mdash; start one
            above.
          </p>
        </div>
      ) : (
        /* Same gap as the page, so this wrapper changes no spacing — it is
           here to fade the projects in over their skeleton as one. */
        <div className={`flex flex-col gap-[18px] ${arrived}`}>
          {focus ? (
            <ProjectCard
              project={focus}
              counts={counts?.tasksByProject[focus._id]}
              nextTask={tasksFor(focus)[0]}
              openTasks={tasksFor(focus)}
              onFocus={() => void setFocus({ projectId: focus._id })}
            />
          ) : (
            <div className="glass rounded-[22px] p-5">
              <p className="text-[13px] text-ink-500">
                Nothing in focus. Pick the one project that matters this week.
              </p>
            </div>
          )}

          {rest.length > 0 ? (
            <div className="grid gap-[18px] md:grid-cols-2">
              {rest.map((project) => (
                <ProjectCard
                  key={project._id}
                  project={project}
                  counts={counts?.tasksByProject[project._id]}
                  nextTask={tasksFor(project)[0]}
                  openTasks={tasksFor(project)}
                  onFocus={() => void setFocus({ projectId: project._id })}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function NewProject() {
  const createGoal = useMutation(api.goals.create)
  const createProject = useMutation(api.projects.create)

  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [project, setProject] = useState('')
  const [area, setArea] = useState<Area>('business')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const starting = useSave()

  async function submit() {
    if (starting.busy) return
    if (goal.trim().length === 0 || project.trim().length === 0) {
      setError('A project needs a goal above it and a title.')
      return
    }
    try {
      await starting.run(async () => {
        const goalId = await createGoal({ title: goal.trim(), area })
        await createProject({
          goalId,
          title: project.trim(),
          deadline: deadline.length > 0 ? deadline : undefined,
        })
      })
      setError(null)
    } catch {
      setError('That did not work.')
    }
  }

  /* The form closes once the tick has been seen, and only then clears — the
     project has already appeared below it by then. */
  function finish() {
    starting.settle()
    setGoal('')
    setProject('')
    setDeadline('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex items-center gap-2 self-start rounded-[14px] px-4 py-2.5 text-[12.5px] text-ink-300 transition-colors hover:text-foreground"
      >
        <Plus className="size-3.5" />
        New project
      </button>
    )
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="label-caps">New project</div>

      <Field label="Goal — what this is ultimately for">
        <input
          autoFocus
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="A profitable business"
          className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </Field>

      <Field label="First project — the work that moves it">
        <input
          value={project}
          onChange={(e) => setProject(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Oreum"
          className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="label-caps">Area</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as Area)}
            className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-300"
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="label-caps">Ends</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[12px] text-ink-300"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={
              starting.status === 'saved' ? finish : () => setOpen(false)
            }
            className="text-[12px] text-ink-600 transition-colors hover:text-ink-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={starting.busy}
            onClick={() => void submit()}
            className="rounded-[7px] border border-lav-500/60 px-3 py-1 text-[12px] text-lav-300 transition-colors hover:bg-lav-900/60"
          >
            <SaveLabel status={starting.status} onSettled={finish}>
              Start it
            </SaveLabel>
          </button>
        </div>
      </div>

      {error ? <p className="text-[12.5px] text-ink-400">{error}</p> : null}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-lift/[0.07] pb-2">
      <span className="label-caps">{label}</span>
      {children}
    </div>
  )
}
