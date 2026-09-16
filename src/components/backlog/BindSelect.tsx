import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'

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

  return (
    <select
      aria-label={`What ${task.title} is for`}
      value={value}
      onChange={(e) => change(e.target.value)}
      className="w-[10rem] truncate rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[11.5px] text-ink-400"
    >
      <option value="">unbound</option>
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
    </select>
  )
}
