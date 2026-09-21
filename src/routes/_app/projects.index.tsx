import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { Github, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AREAS } from '@/components/AreaBadge'
import { areaVars } from '@/lib/areas'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { SaveLabel, useSave } from '@/components/Saving'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import type { Area } from '@/lib/capture-parser'
import { useArrived, useHeld } from '@/lib/loading'
import { localToday } from '@/lib/today'
import { parseRepo } from '../../../convex/repo'

export const Route = createFileRoute('/_app/projects/')({
  component: Projects,
})

/* The projects grid (PLAN.md §3). One focus project at the top with its full
   anatomy; the rest as title and next action (§3c.2).

   "New project" is one field and a kind. It used to create a goal and the
   project together, because a project without a goal above it could not
   exist — that bind was cut on 21 Sep.
   They were called chains until 15 Sep; only the word changed. */
function Projects() {
  const projects = useHeld(useQuery(api.projects.listLive, {}))
  const arrived = useArrived(projects)
  const counts = useQuery(api.aggregate.entityCounts, {})
  const openTasks = useQuery(api.tasks.listBacklog, { today: localToday() })
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
              logoUrl={focus.logoUrl}
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
                  logoUrl={project.logoUrl}
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
  const createProject = useMutation(api.projects.create)

  const [open, setOpen] = useState(false)
  const [project, setProject] = useState('')
  /* What kind of thing it is, his to pick and nothing derives it (21 Sep).
     This slot used to be "which goal is this for?" — a project answered to a
     goal and could not exist without one. It answers to nothing now. */
  const [area, setArea] = useState<Area>('projects')
  const [deadline, setDeadline] = useState('')
  const [repo, setRepo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const starting = useSave()

  async function submit() {
    if (starting.busy) return
    if (project.trim().length === 0) {
      setError('A project needs a title.')
      return
    }
    try {
      await starting.run(async () => {
        await createProject({
          area,
          title: project.trim(),
          deadline: deadline.length > 0 ? deadline : undefined,
          githubRepo: repo.trim() || undefined,
        })
      })
      setError(null)
    } catch (e) {
      /* A repo that is not owner/name refuses and says so; .data carries
         that sentence, as it does on Goals. */
      setError(e instanceof ConvexError ? String(e.data) : 'That did not work.')
    }
  }

  /* The form closes once the tick has been seen, and only then clears — the
     project has already appeared below it by then. */
  function finish() {
    starting.settle()
    setArea('projects')
    setProject('')
    setDeadline('')
    setRepo('')
    setOpen(false)
  }

  if (!open) {
    return (
      /* No `.glass` here any more (21 Sep): "when I hover button it looks a
         bit weird — the border is flickering."

         It was, and the cause is specific. Measured, the button is
         127.42 × 41.375px — fractional — and `.glass` puts
         `backdrop-filter: blur(18px)` on it, which promotes it to its own
         composited layer. Hovering repaints it, the backdrop re-samples, and
         a 1px border on a half-pixel edge shimmers. Backdrop blur belongs on
         panels, not on a control this size, so this one gets a real surface
         instead — and the accent it always should have had. */
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-press group flex items-center gap-2 self-start rounded-full border border-lift/12 bg-lift/[0.04] px-4 py-2 text-[12.5px] text-ink-300 transition-colors hover:border-lav-500/50 hover:bg-lav-900/40 hover:text-lav-200"
      >
        <Plus className="size-3.5 transition-transform duration-(--motion-base) group-hover:rotate-90" />
        New project
      </button>
    )
  }

  const parsedRepo = parseRepo(repo)
  const repoTyped = repo.trim().length > 0

  return (
    /* Rebuilt 21 Sep: "New project looks a bit outdate, no colors no motion,
       no fun… Kind I think by default is projects. select is kinda too wide,
       ugly. Maybe we can make github link cooler."

       Three changes, each answering one of those. The kind is a row of the
       area colours rather than a 1200px-wide select of the same ten words in
       grey — picking one is now the one moment on this form where the app
       shows you what colour the thing will be. The repo field reads what you
       paste as you paste it, using the same `parseRepo` the server will use,
       and says `owner/name` back. And the panel arrives rather than
       appearing. */
    <div
      style={areaVars(area)}
      className="glass motion-arrive relative flex flex-col gap-4 overflow-hidden rounded-[22px] p-6"
    >
      <span
        aria-hidden
        className="motion-edge pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-(--area)"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-r from-(--area)/[0.06] to-transparent to-45%"
      />

      <div className="label-caps relative">New project</div>

      <div className="relative flex flex-col gap-4">
        <Field label="Project">
          <input
            autoFocus
            value={project}
            onChange={(e) => setProject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
            placeholder="Oreum"
            className="w-full rounded-[10px] border border-lift/10 bg-sink/20 px-3 py-2 text-[14px] text-foreground outline-none transition-colors placeholder:text-ink-700 hover:border-lift/20 focus:border-lav-500/60 focus:bg-lav-900/20"
          />
        </Field>

        <Field label="Kind">
          <div className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => {
              const on = a === area
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setArea(a)}
                  aria-pressed={on}
                  style={areaVars(a)}
                  className={`motion-press rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] uppercase ring-1 transition-colors ${
                    on
                      ? 'bg-(--area)/20 text-(--area) ring-(--area)/45'
                      : 'text-ink-600 ring-lift/10 hover:text-(--area) hover:ring-(--area)/30'
                  }`}
                >
                  {a}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Repo — optional">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/name, or the repo's github.com link"
              className="min-w-0 flex-1 rounded-[10px] border border-lift/10 bg-sink/20 px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-ink-700 hover:border-lift/20 focus:border-lav-500/60 focus:bg-lav-900/20"
            />
            {/* What the server will make of it, while you are still typing.
                It used to refuse after you pressed Start it. */}
            {repoTyped ? (
              parsedRepo ? (
                <span className="motion-pop inline-flex items-center gap-1.5 rounded-full bg-state-good/12 px-2.5 py-1 font-mono text-[11.5px] text-state-good ring-1 ring-state-good/30 ring-inset">
                  <Github className="size-3" />
                  {parsedRepo}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11.5px] text-ink-600 ring-1 ring-lift/10 ring-inset">
                  <Github className="size-3" />
                  not a repo yet
                </span>
              )
            ) : null}
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="label-caps">Ends</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-[10px] border border-lift/10 bg-sink/20 px-2.5 py-1.5 font-mono text-[12px] text-ink-300 outline-none transition-colors hover:border-lift/20 focus:border-lav-500/60"
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={
                starting.status === 'saved' ? finish : () => setOpen(false)
              }
              className="motion-press rounded-[9px] px-3 py-1.5 text-[12px] text-ink-500 transition-colors hover:bg-lift/5 hover:text-ink-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={starting.busy}
              onClick={() => void submit()}
              className="motion-press rounded-[9px] bg-lav-900/70 px-4 py-1.5 text-[12.5px] text-lav-100 ring-1 ring-lav-500/60 ring-inset transition-colors hover:bg-lav-800"
            >
              <SaveLabel status={starting.status} onSettled={finish}>
                Start it
              </SaveLabel>
            </button>
          </div>
        </div>

        {error ? (
          <p className="motion-arrive text-[12.5px] text-state-danger">
            {error}
          </p>
        ) : null}
      </div>
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
