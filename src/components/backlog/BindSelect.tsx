import { useMutation } from 'convex/react'
import { Target } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { ChipSelect } from './ChipSelect'

/* One picker for what a backlog task answers to: a project (which brings its
   goal), a goal on its own, or nothing. A native select, because this is
   picked once per task and a custom menu would be slower on a phone. Monthly
   tile targets are goals too, but nobody files a task under "Workouts each
   month", so the caller leaves them out. */
export function BindSelect({
  task,
  projects,
  goals,
}: {
  task: Doc<'tasks'>
  projects: Array<Doc<'projects'>>
  goals: Array<Doc<'goals'>>
}) {
  const setProject = useMutation(api.tasks.setProject)
  const setGoal = useMutation(api.tasks.setGoal)

  const value = task.projectId
    ? `p:${task.projectId}`
    : task.goalId
      ? `g:${task.goalId}`
      : ''

  function change(next: string) {
    if (next === '') {
      /* setProject(null) clears the goal with the project. */
      void setProject({ taskId: task._id, projectId: null })
    } else if (next.startsWith('p:')) {
      void setProject({
        taskId: task._id,
        projectId: next.slice(2) as Id<'projects'>,
      })
    } else {
      void setGoal({ taskId: task._id, goalId: next.slice(2) as Id<'goals'> })
    }
  }

  const chosen = task.projectId
    ? projects.find((p) => p._id === task.projectId)?.title
    : task.goalId
      ? goals.find((g) => g._id === task.goalId)?.title
      : undefined

  /* Said when bound, a faint "project" on hover when not: an empty picker
     on every row was the grey that made the list look like a form. Unset,
     it goes last in the line, so while it is hidden it leaves no gap
     between the chips that are there. */
  return (
    <ChipSelect
      label={`What ${task.title} is for`}
      value={value}
      text={chosen ?? 'project'}
      onChange={change}
      icon={<Target className="size-3 shrink-0" />}
      className={
        chosen
          ? 'bg-lift/[0.06] text-ink-300 hover:text-foreground'
          : 'order-last text-ink-600 hover:text-ink-300 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100'
      }
    >
      <BindOptions projects={projects} goals={goals} />
    </ChipSelect>
  )
}

/** The options every "what is this for" picker offers. */
export function BindOptions({
  projects,
  goals,
}: {
  projects: Array<Doc<'projects'>>
  goals: Array<Doc<'goals'>>
}) {
  return (
    <>
      <option value="">No project or goal</option>
      {projects.length > 0 ? (
        <optgroup label="Projects">
          {projects.map((p) => (
            <option key={p._id} value={`p:${p._id}`}>
              {p.title}
            </option>
          ))}
        </optgroup>
      ) : null}
      {goals.length > 0 ? (
        <optgroup label="Goals">
          {goals.map((g) => (
            <option key={g._id} value={`g:${g._id}`}>
              {g.title}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  )
}
