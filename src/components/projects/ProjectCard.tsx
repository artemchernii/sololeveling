import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { CalendarDays, Target, TriangleAlert } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { DeadlineChip, StatusBadge } from '@/components/projects/Chips'
import { ProjectVitals } from '@/components/projects/ProjectVitals'
import { ProjectLogo } from '@/components/projects/ProjectLogo'
import type { Area } from '@/lib/capture-parser'
import { areaVars } from '@/lib/areas'
import { daysUntil, isOverdue, shortDate } from '@/lib/format'

/* PLAN.md §3 draws a full card: title, "11 of 17 tasks", "ends 30 Sep · 23
   days", three open tasks, NEXT →. §3c.2 then says non-focus projects render
   as title and next action only, "no task lists, no counts competing for
   attention" — the later and more specific rule, and the one doing real work,
   because the whole point of a focus project is that it looks different.

   21 Sep, rebuilt. Artem: "project page is new updated and this card is old."
   Measured at 1600px before changing it, and he was right in a way a
   screenshot understates — the card ran 258→1576, and every piece of content
   ended by 617. **938 pixels, 71% of the card, held one 49px badge.** The
   same fault he has boxed twice on the project page.

   Four things were stale, and each had the same cause — this card was written
   before the page it opens:

   - The deadline was grey mono text where the page draws a warn pill, and the
     focus badge was a flat box where the page has a live one. Both now come
     from `Chips.tsx`, so there is one treatment of each fact.
   - The open tasks were three bare strings. A task row on the project page
     carries its due date and its state; here they said nothing, and nothing
     even said they were the open ones.
   - The colour was the goal's. "I said already that this GOAL - PROJECT bind
     is canceled." A project has its own `area` now, set on the card itself.
   - The width went unused. The card is two columns above `lg`: what the
     project is on the left, what is open on the right. Both ends reached, and
     the card is shorter rather than taller for it. */

export type ProjectCounts = { done: number; total: number; open: number }

export function ProjectCard({
  project,
  logoUrl,
  counts,
  nextTask,
  openTasks,
  onFocus,
}: {
  project: Doc<'projects'>
  logoUrl: string | null
  counts: ProjectCounts | undefined
  nextTask: Doc<'tasks'> | undefined
  openTasks: Array<Doc<'tasks'>>
  onFocus: () => void
}) {
  const setArea = useMutation(api.projects.setArea)
  const isFocus = project.status === 'focus'
  const area = project.area

  return (
    <div
      style={area ? areaVars(area) : undefined}
      className="glass group relative flex flex-col gap-4 overflow-hidden rounded-[22px] p-5"
    >
      {/* The area edge, as an element rather than `border-l`: .glass sets the
          `border` shorthand, which is emitted in the same layer and resets all
          four sides, so a border utility on a glass panel silently loses. */}
      {area ? (
        <span
          aria-hidden
          className="motion-edge pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-(--area)/70"
        />
      ) : null}
      {/* A wash, not a fill: enough to tint the corner the edge starts from,
          far too faint to compete with the lavender that means focus. */}
      {area ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-r from-(--area)/[0.06] to-transparent to-45%"
        />
      ) : null}

      {/* The card is the link. Everything that is itself clickable sits above
          it on z-10; everything else is just surface you can press. */}
      <Link
        to="/projects/$id"
        params={{ id: project._id }}
        aria-label={project.title}
        className="absolute inset-0"
      />

      <div className="pointer-events-none relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectLogo url={logoUrl} title={project.title} area={area} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[15px] text-foreground transition-colors group-hover:text-lav-300">
              {project.title}
            </span>
            <span className="pointer-events-auto relative z-10 flex items-center gap-2">
              <AreaBadge
                area={area}
                onChange={(next: Area) =>
                  void setArea({ projectId: project._id, area: next })
                }
              />
              <DeadlineChip project={project} />
            </span>
          </div>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {isFocus ? (
        /* Two columns above lg, because the card is 1300px wide and was
           using 600 of them. The numbers do not get wider from the room —
           the tasks come up beside them instead, and the card gets shorter. */
        <div className="relative grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="pointer-events-none">
            <ProjectVitals
              projectId={project._id}
              done={counts?.done}
              total={counts?.total}
            />
          </div>

          <div className="pointer-events-none rounded-[14px] border border-lift/[0.07] bg-sink/20 p-3.5">
            <div className="label-caps mb-2 flex items-baseline justify-between gap-3">
              <span>open</span>
              {counts !== undefined ? <span>{counts.open}</span> : null}
            </div>
            {openTasks.length > 0 ? (
              <div className="flex flex-col">
                {openTasks.slice(0, 3).map((task) => (
                  <TaskLine key={task._id} task={task} />
                ))}
                {counts !== undefined && counts.open > 3 ? (
                  <span className="pt-2 font-mono text-[11px] text-ink-700">
                    +{counts.open - 3} more on the project
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-600">
                Nothing open. This project is waiting on you to decide what is
                next.
              </p>
            )}
          </div>
        </div>
      ) : (
        /* §3c.2: title and next action. Nothing else may compete. */
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="pointer-events-none min-w-0 flex-1 text-[12.5px] text-ink-500">
            {nextTask ? (
              <>
                <span className="label-caps mr-2">Next</span>
                {nextTask.title}
              </>
            ) : (
              'No next action.'
            )}
          </div>
          <button
            type="button"
            onClick={onFocus}
            className="motion-press relative z-10 flex shrink-0 items-center gap-1.5 rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300"
          >
            <Target className="size-3" />
            Make this the focus
          </button>
        </div>
      )}
    </div>
  )
}

/* An open task as the project page draws one: the title, and only the fields
   that are set. It was the bare title here, on a card whose whole job is to
   tell you where a project stands. */
function TaskLine({ task }: { task: Doc<'tasks'> }) {
  const due = task.dueDate
  const late = due !== undefined && isOverdue(due)
  const soon = !late && due !== undefined && daysUntil(due) <= 7

  return (
    <div className="flex items-baseline gap-2.5 border-b border-lift/[0.05] py-1.5 last:border-b-0">
      <span className="size-[5px] shrink-0 translate-y-[-2px] rounded-full bg-lift/25" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-300">
        {task.title}
      </span>
      {due !== undefined ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 font-mono text-[11px] ${
            late
              ? 'text-state-danger'
              : soon
                ? 'text-state-warn'
                : 'text-ink-600'
          }`}
        >
          {late ? (
            <TriangleAlert className="size-3" />
          ) : (
            <CalendarDays className="size-3" />
          )}
          {shortDate(due)}
        </span>
      ) : null}
    </div>
  )
}
