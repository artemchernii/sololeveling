import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  CalendarDays,
  GitCommitHorizontal,
  Target,
  TriangleAlert,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { DeadlineChip, StatusBadge } from '@/components/projects/Chips'
import { ProjectVitals } from '@/components/projects/ProjectVitals'
import { ProjectLogo } from '@/components/projects/ProjectLogo'
import type { Area } from '@/lib/capture-parser'
import { areaVars } from '@/lib/areas'
import { daysUntil, isOverdue, shortDate, whenLabel } from '@/lib/format'

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
   - The width went unused. The card is three columns above `lg`: what the
     project is, what he last did, and what is open. Both ends reached, and
     the card is shorter rather than taller for it. The middle column came a
     round later — see `LatestCommits`. */

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

  /* Asked here rather than inside the column, because the grid's shape
     depends on the answer: with three tracks and two children the open block
     lands in track two and leaves 340px empty on the right — the fault this
     change exists to fix, reintroduced by the fix. */
  const recent = useQuery(api.github.listRecent, { projectId: project._id })
  const latest = (recent ?? []).slice(0, 2)

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

      {isFocus ? null : (
        <div className="pointer-events-none relative">
          <Identity
            project={project}
            logoUrl={logoUrl}
            area={area}
            setArea={(next) =>
              void setArea({ projectId: project._id, area: next })
            }
          />
        </div>
      )}

      {isFocus ? (
        /* The left track is `max-content`, not `1fr` (21 Sep, second pass).
           Measured: the tracks were 604 / 300 / 340, and the vitals used 459
           of their 604 while standing 46px tall against neighbours of 155 —
           an L-shaped hole, 145px of width beside the numbers and 109px of
           height beneath them, with the two blocks beside it so narrow that
           every commit message truncated.

           Sizing the numbers to themselves gives both away at once: the slack
           beside them disappears, and the two cards split what it was holding
           instead of being capped at 300 and 340. */
        <div
          /* `grid-cols-1` is load-bearing below `lg`, not decoration: with no
             base template the single track sizes to max-content, and
             max-content ignores the wrapping of the vitals row — measured at
             375px it came out 427px wide inside a 337px card, so every
             commit message ran off the edge and was clipped by the card's
             `overflow-hidden` rather than truncated.

             Three columns from `lg`. They were briefly moved to `2xl`
             because the blocks truncate badly at 1024, and that was the
             wrong call: his window is under 1536, so the card he had just
             approved turned into a tall stack. "NO NO NO. WTF IS THIS."

             The truncation at narrow widths is real and stays on the list,
             but it is nowhere near as bad as taking away the layout he
             asked for. The track is `minmax(0,max-content)` so the numbers
             give ground rather than taking their width first. */
          className={`relative grid grid-cols-1 items-stretch gap-4 ${
            latest.length > 0
              ? 'lg:grid-cols-[minmax(0,max-content)_minmax(0,1fr)_minmax(0,1fr)]'
              : 'lg:grid-cols-[minmax(0,max-content)_minmax(0,1fr)]'
          }`}
        >
          {/* The name and the numbers are one column now (21 Sep): "move
              focus next to title so on the right side we have 2 blocks with
              tasks and latest."

              Moving the badge alone would have opened a new hole where it
              used to be — a header row reaching 1555 with nothing in it past
              the title. So the whole identity came down into the first
              column instead, the row above it is gone, and the right side is
              exactly the two blocks he asked for. */}
          <div className="pointer-events-none flex h-full flex-col justify-between gap-4">
            <Identity
              project={project}
              logoUrl={logoUrl}
              area={area}
              setArea={(next) =>
                void setArea({ projectId: project._id, area: next })
              }
            />
            <ProjectVitals
              projectId={project._id}
              done={counts?.done}
              total={counts?.total}
            />
          </div>

          {/* The middle column, and the reason the card is three (21 Sep).
              Measured: content stopped at x=738 and the open block began at
              1150, so 412px ran empty down the whole card. Artem: "I see a
              lot of dead space. How we fill it and organize it?"

              Filled with the one thing the card could not tell him — what he
              last did here. Stored rows from `commits`, the same ones the
              project page lists, not a new kind of number. It renders
              nothing at all when there is no repo or no commit, because a
              titled empty box is the graphic §3d says not to draw. */}
          {latest.length > 0 ? <LatestCommits latest={latest} /> : null}

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

/* The project's name and what kind of thing it is. A row of its own on a
   non-focus card; the head of the first column on the focus card, where the
   badge sits beside the title rather than a thousand pixels away from it. */
function Identity({
  project,
  logoUrl,
  area,
  setArea,
}: {
  project: Doc<'projects'>
  logoUrl: string | null
  area: Area | undefined
  setArea: (next: Area) => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ProjectLogo url={logoUrl} title={project.title} area={area} />
      <div className="flex min-w-0 flex-col gap-1">
        {/* The deadline rides with the name and the focus pill sits under it
            (21 Sep, his call: "move deadline next to project title, and focus
            where is deadline").

            It reads better than it sounds: the top line is what this project
            is and when it is due — the two facts you scan a list of projects
            for — and the line beneath is what kind of thing it is and how it
            stands, which are both states rather than identity. */}
        <span className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="truncate text-[15px] text-foreground transition-colors group-hover:text-lav-300">
            {project.title}
          </span>
          <DeadlineChip project={project} />
        </span>
        <span className="pointer-events-auto relative z-10 flex flex-wrap items-center gap-2">
          <AreaBadge area={area} onChange={setArea} />
          <StatusBadge status={project.status} />
        </span>
      </div>
    </div>
  )
}

/* What he last did here: the two most recent commits, from the rows the
   hourly check already stores. Absent, not empty, when the project has no
   repo — the column is not rendered and the grid drops to two. */
function LatestCommits({
  latest,
}: {
  latest: Array<{ sha: string; message: string; authoredAt: number }>
}) {
  return (
    <div className="pointer-events-none rounded-[14px] border border-lift/[0.07] bg-sink/20 p-3.5">
      <div className="label-caps mb-2 flex items-center gap-1.5">
        <GitCommitHorizontal className="size-3.5" />
        latest
      </div>
      <div className="flex flex-col">
        {latest.map((c) => (
          <div
            key={c.sha}
            className="flex flex-col gap-0.5 border-b border-lift/[0.05] py-1.5 last:border-b-0"
          >
            <span className="truncate text-[12.5px] text-ink-300">
              {c.message}
            </span>
            <span className="font-mono text-[11px] text-ink-700">
              {whenLabel(c.authoredAt)}
            </span>
          </div>
        ))}
      </div>
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
