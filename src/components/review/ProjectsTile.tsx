import { Check, GitBranch } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { ProjectLogo } from '@/components/projects/ProjectLogo'
import {
  Badge,
  Caps,
  CountUp,
  Tile,
  dateLabel,
} from '@/components/review/parts'

type Project = FunctionReturnType<
  typeof api.aggregate.weekReview
>['projects'][number]

/* Projects (mockup real.html): a row per live project, from its commits —
   "I wont log every hour, maybe make commits". This week's count of its
   weekly target, last week's, the days, the two newest messages, and its
   tasks as this week and the last one done. A project with no commits
   either week is one slim row. */
export function ProjectsTile({
  projects,
  today,
  most,
}: {
  projects: ReadonlyArray<Project>
  today: number
  /** The busiest day's commits across the week, so every bar shares a scale. */
  most: number
}) {
  return (
    <Tile
      name="Projects"
      to="/projects"
      area="var(--area-projects)"
      icon={<GitBranch />}
      index={2}
      span="col-span-2 lg:col-span-2 lg:row-span-2"
    >
      {projects.map((p) =>
        p.thisWeek === 0 && p.lastWeek === 0 ? (
          <div
            key={p._id}
            data-testid="project-quiet"
            className="flex items-center justify-between gap-2 rounded-[10px] border border-lift/[0.09] bg-lift/[0.03] p-2.5 opacity-55"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ProjectLogo
                url={p.logoUrl}
                title={p.title}
                area={p.area}
                size={22}
              />
              <Caps className="truncate text-ink-200">{p.title}</Caps>
            </span>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-300">
              0 COMMITS · was 0
            </span>
          </div>
        ) : (
          <div
            key={p._id}
            data-testid="project"
            className="flex flex-col gap-[7px] rounded-[10px] border border-lift/[0.09] bg-lift/[0.03] p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <ProjectLogo
                  url={p.logoUrl}
                  title={p.title}
                  area={p.area}
                  size={26}
                />
                <Caps className="truncate text-ink-200">{p.title}</Caps>
              </span>
              {p.focus ? (
                <Badge className="bg-lav-400/10 text-lav-400">FOCUS</Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <span className="text-[30px] leading-none font-light tracking-tight tabular-nums">
                <CountUp to={p.thisWeek} testId="commits" />
              </span>
              <Caps className="pb-1">
                {p.target !== null ? `of ${p.target} COMMITS` : 'COMMITS'}
              </Caps>
              {p.target !== null && p.thisWeek >= p.target ? (
                <Badge className="motion-pop mb-0.5 bg-state-good/10 text-state-good">
                  <Check className="size-3" strokeWidth={3} /> TARGET
                </Badge>
              ) : null}
            </div>
            {p.target !== null ? (
              <div className="h-[5px] overflow-hidden rounded-[3px] bg-lift/[0.07]">
                <b
                  style={{
                    width: `${Math.min(1, p.thisWeek / p.target) * 100}%`,
                  }}
                  className="bento-fill block h-full rounded-[3px] bg-(--area-projects)"
                />
              </div>
            ) : null}
            <span className="font-mono text-[10.5px] text-ink-500">
              was {p.lastWeek} last week
            </span>
            <div className="grid h-[26px] grid-cols-7 items-end gap-[3px]">
              {p.days.map((n, k) => (
                <i
                  key={k}
                  style={{
                    height: `${n ? Math.max(8, (n / most) * 100) : 8}%`,
                    animationDelay: `${k * 60}ms`,
                  }}
                  className={`bento-grow min-h-0.5 rounded-[2px] ${n ? 'bg-(--area-projects)' : 'bg-lift/[0.07]'} ${today >= 0 && k > today ? 'opacity-30' : ''}`}
                />
              ))}
            </div>
            {p.messages.length > 0 ? (
              <div className="flex flex-col gap-[3px]">
                {p.messages.map((m, k) => (
                  <span key={k} className="truncate text-[11.5px] text-ink-300">
                    {m}
                  </span>
                ))}
              </div>
            ) : null}
            {p.lastDoneAt !== null ? (
              <span className="font-mono text-[10.5px] text-ink-300">
                TASKS · {p.tasksDone} this week · last done{' '}
                {dateLabel(p.lastDoneAt)}
              </span>
            ) : null}
          </div>
        ),
      )}
    </Tile>
  )
}
