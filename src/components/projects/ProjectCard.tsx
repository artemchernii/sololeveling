import { Link } from '@tanstack/react-router'

import type { Doc } from '../../../convex/_generated/dataModel'
import { ProjectVitals } from '@/components/projects/ProjectVitals'
import { ProjectLogo } from '@/components/projects/ProjectLogo'
import type { Area } from '@/lib/capture-parser'
import { areaVars } from '@/lib/areas'
import { deadlineLabel, isOverdue } from '@/lib/format'

/* PLAN.md §3 draws a full card: title, "11 of 17 tasks", "ends 30 Sep · 23
   days", three open tasks, NEXT →. §3c.2 then says non-focus projects render
   as title and next action only, "no task lists, no counts competing for
   attention".

   §3c.2 wins, because it is the later and more specific rule and it is the one
   doing real work: the whole point of a focus project is that it looks
   different from the others. So the focus project gets §3's anatomy and
   everything else gets two lines. (ChainCard until 15 Sep.)

   20 Sep: the focus card was a title and one grey line, and it read as
   unfinished. Three things changed, and each is worth its weight:

   - The whole card opens the project. It was the title only, which is a small
     target on a card this wide and gives no sign the rest is clickable. The
     link is an overlay rather than a wrapper, because a <button> inside an <a>
     is invalid and stops working.
   - Colour, from the goal's area (§3d: colour says what a thing is). A badge
     and a tinted left edge — not the whole surface, which would put nine
     possible hues against the lavender that means live and focus.
   - Numbers, in ProjectVitals: tasks, hours this month, commits this week. */

export type ProjectCounts = { done: number; total: number; open: number }

export function ProjectCard({
  project,
  area,
  goalTitle,
  logoUrl,
  counts,
  nextTask,
  openTasks,
  onFocus,
}: {
  project: Doc<'projects'>
  area: Area | undefined
  goalTitle: string | undefined
  logoUrl: string | null
  counts: ProjectCounts | undefined
  nextTask: Doc<'tasks'> | undefined
  openTasks: Array<Doc<'tasks'>>
  onFocus: () => void
}) {
  const isFocus = project.status === 'focus'
  const late = project.deadline !== undefined && isOverdue(project.deadline)

  return (
    <div
      style={area ? areaVars(area) : undefined}
      className="glass group relative flex flex-col gap-3 overflow-hidden rounded-[22px] p-5"
    >
      {/* The area edge, as an element rather than `border-l`: .glass sets the
          `border` shorthand, which is emitted in the same layer and resets all
          four sides, so a border utility on a glass panel silently loses. */}
      {area ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-(--area)/55"
        />
      ) : null}
      {/* A wash, not a fill: enough to tint the corner the edge starts from,
          far too faint to compete with the lavender that means focus. */}
      {area ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-r from-(--area)/[0.07] to-transparent to-55%"
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

      <div className="pointer-events-none flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectLogo url={logoUrl} title={project.title} area={area} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] text-foreground transition-colors group-hover:text-lav-300">
              {project.title}
            </span>
            {/* What it answers to, not what kind it is: the area badge said
                KNOWLEDGE beside a project and read as a filing (20 Sep). The
                area is still here — as the edge and the logo mark, which is
                what §3d asks colour to do. */}
            {goalTitle ? (
              <span className="label-caps truncate">{goalTitle}</span>
            ) : null}
          </div>
        </div>
        <StatusTag status={project.status} />
      </div>

      {isFocus ? (
        <>
          <div className="pointer-events-none">
            <ProjectVitals
              projectId={project._id}
              project={project}
              done={counts?.done}
              total={counts?.total}
            />
          </div>

          <div
            className={`pointer-events-none font-mono text-[11px] ${
              late ? 'text-ink-300' : 'text-ink-600'
            }`}
          >
            {project.deadline ? deadlineLabel(project.deadline) : 'no end date'}
          </div>

          {openTasks.length > 0 ? (
            <div className="pointer-events-none flex flex-col gap-1.5 border-t border-lift/[0.06] pt-3">
              {openTasks.slice(0, 3).map((task) => (
                <div key={task._id} className="text-[12.5px] text-ink-400">
                  {task.title}
                </div>
              ))}
            </div>
          ) : (
            <p className="pointer-events-none text-[12.5px] text-ink-600">
              Nothing open. This project is waiting on you to decide what is
              next.
            </p>
          )}
        </>
      ) : (
        /* §3c.2: title and next action. Nothing else may compete. */
        <div className="pointer-events-none text-[12.5px] text-ink-500">
          {nextTask ? (
            <>
              <span className="label-caps mr-2">Next</span>
              {nextTask.title}
            </>
          ) : (
            'No next action.'
          )}
        </div>
      )}

      {!isFocus ? (
        <button
          type="button"
          onClick={onFocus}
          className="relative z-10 self-start rounded-[7px] border border-lift/10 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300"
        >
          Make this the focus
        </button>
      ) : null}
    </div>
  )
}

/* The lavender accent is reserved for live and focus things (§3), so FOCUS is
   the only tag that gets it. */
function StatusTag({ status }: { status: Doc<'projects'>['status'] }) {
  const focus = status === 'focus'
  return (
    <span
      className={`label-caps shrink-0 rounded-[4px] px-1.5 py-0.5 ${
        focus ? 'bg-lav-900/70 text-lav-300' : 'bg-lift/5'
      }`}
    >
      {status}
    </span>
  )
}
