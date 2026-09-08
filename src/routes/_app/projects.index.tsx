import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { ChainCard } from '@/components/chains/ChainCard'
import { AREAS } from '@/components/AreaBadge'
import type { Area } from '@/lib/capture-parser'

export const Route = createFileRoute('/_app/projects/')({
  component: Chains,
})

/* The chains grid (PLAN.md §3). One focus chain at the top with its full
   anatomy; the rest as title and next action (§3c.2).
 
   "New chain" is one form: a goal and its first project together, because a
   project without a goal above it is the thing this app exists to prevent. */
function Chains() {
  const chains = useQuery(api.projects.listLive, {})
  const counts = useQuery(api.aggregate.entityCounts, {})
  const openTasks = useQuery(api.tasks.listBacklog, {})
  const setFocus = useMutation(api.projects.setFocus)

  const focus = chains?.find((c) => c.status === 'focus')
  const rest = chains?.filter((c) => c.status !== 'focus') ?? []

  function tasksFor(project: Doc<'projects'>) {
    return (openTasks ?? []).filter((t) => t.projectId === project._id)
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <NewChain />

      {chains === undefined ? (
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : chains.length === 0 ? (
        <div className="glass rounded-[22px] p-6">
          <p className="text-[13px] text-ink-500">
            No chains yet. A chain is a goal with work hanging off it &mdash;
            start one above.
          </p>
        </div>
      ) : (
        <>
          {focus ? (
            <ChainCard
              project={focus}
              counts={counts?.tasksByProject[focus._id]}
              nextTask={tasksFor(focus)[0]}
              openTasks={tasksFor(focus)}
              onFocus={() => void setFocus({ projectId: focus._id })}
            />
          ) : (
            <div className="glass rounded-[22px] p-5">
              <p className="text-[13px] text-ink-500">
                Nothing in focus. Pick the one chain that matters this week.
              </p>
            </div>
          )}

          {rest.length > 0 ? (
            <div className="grid gap-[18px] md:grid-cols-2">
              {rest.map((project) => (
                <ChainCard
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
        </>
      )}
    </div>
  )
}

function NewChain() {
  const createGoal = useMutation(api.goals.create)
  const createProject = useMutation(api.projects.create)

  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [project, setProject] = useState('')
  const [area, setArea] = useState<Area>('business')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (goal.trim().length === 0 || project.trim().length === 0) {
      setError('A chain needs both a goal and a first project.')
      return
    }
    try {
      const goalId = await createGoal({ title: goal.trim(), area })
      await createProject({
        goalId,
        title: project.trim(),
        deadline: deadline.length > 0 ? deadline : undefined,
      })
      setGoal('')
      setProject('')
      setDeadline('')
      setError(null)
      setOpen(false)
    } catch {
      setError('That did not work.')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex items-center gap-2 self-start rounded-[14px] px-4 py-2.5 text-[12.5px] text-ink-300 transition-colors hover:text-foreground"
      >
        <Plus className="size-3.5" />
        New chain
      </button>
    )
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="label-caps">New chain</div>

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
            className="rounded-[6px] border border-white/10 bg-black/20 px-2 py-1 text-[12px] text-ink-300"
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
            className="rounded-[6px] border border-white/10 bg-black/20 px-2 py-1 font-mono text-[12px] text-ink-300"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[12px] text-ink-600 transition-colors hover:text-ink-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            className="rounded-[7px] border border-lav-500/60 px-3 py-1 text-[12px] text-lav-300 transition-colors hover:bg-lav-900/60"
          >
            Start it
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
    <div className="flex flex-col gap-1 border-b border-white/[0.07] pb-2">
      <span className="label-caps">{label}</span>
      {children}
    </div>
  )
}
