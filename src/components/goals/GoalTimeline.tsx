import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Skeleton } from '@/components/Skeleton'
import { shortDate } from '@/lib/format'
import { goalTimeline } from '@/lib/goal-timeline'
import type { TimelineNode } from '@/lib/goal-timeline'
import { localToday } from '@/lib/today'

/* 0 — 1 — 2 — 3 — goal (R3). Horizontal from md, a vertical list on a phone.
   Reached steps are filled, the next one is lavender (the one live thing),
   the rest are outlines. A tap on a step reaches it or takes it back — one
   tap, like ticking a task. No fraction anywhere (goal-timeline.ts). */
export function GoalTimeline({ goal }: { goal: Doc<'goals'> }) {
  const milestones = useQuery(api.milestones.listByGoal, { goalId: goal._id })
  const setReached = useMutation(api.milestones.setReached)

  if (milestones === undefined) {
    return <Skeleton className="h-[52px] w-full" />
  }

  const nodes = goalTimeline(goal, milestones)

  return (
    <ol className="flex flex-col gap-2 md:flex-row md:items-start md:gap-0">
      {nodes.map((node, i) => (
        <li
          key={node.kind === 'milestone' ? node.id : node.kind}
          className="flex min-w-0 items-start gap-2.5 md:flex-1 md:flex-col md:items-stretch md:gap-2"
        >
          <div className="flex items-center md:w-full">
            <Dot
              node={node}
              onToggle={
                node.kind === 'milestone'
                  ? () =>
                      void setReached({
                        milestoneId: node.id as Id<'milestones'>,
                        reached: node.state !== 'reached',
                      })
                  : undefined
              }
            />
            {i < nodes.length - 1 ? (
              <span
                aria-hidden
                className="hidden h-px flex-1 bg-lift/10 md:block"
              />
            ) : null}
          </div>
          <Caption node={node} />
        </li>
      ))}
    </ol>
  )
}

function Dot({
  node,
  onToggle,
}: {
  node: TimelineNode
  onToggle?: () => void
}) {
  const base =
    'grid size-[22px] shrink-0 place-items-center rounded-full font-mono text-[10px]'
  if (node.kind === 'start') {
    return (
      <span className={`${base} border border-lift/15 text-ink-500`}>0</span>
    )
  }
  if (node.kind === 'end') {
    return (
      <span className={`${base} border border-lift/25 text-ink-300`}>◆</span>
    )
  }
  const tone =
    node.state === 'reached'
      ? 'bg-ink-300 text-background'
      : node.state === 'next'
        ? /* The one live step: lit, not just outlined (24 Sep). */
          'border border-lav-300 bg-lav-300/15 text-lav-200 shadow-[0_0_14px_-3px_var(--color-accent)]'
        : 'border border-lift/15 text-ink-500'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={node.state === 'reached'}
      aria-label={`${node.title}: ${node.state === 'reached' ? 'reached — tap to undo' : 'tap when reached'}`}
      className={`${base} ${tone} transition-colors hover:border-lav-500`}
    >
      {node.number}
    </button>
  )
}

function Caption({ node }: { node: TimelineNode }) {
  const today = localToday()
  if (node.kind === 'start') {
    return (
      <div className="flex flex-col md:pr-3">
        <span className="label-caps">Started</span>
        <span className="font-mono text-[11px] text-ink-600">
          {shortDate(node.date)}
        </span>
      </div>
    )
  }
  if (node.kind === 'end') {
    return (
      <div className="flex flex-col">
        <span className="label-caps">Goal</span>
        <span className="font-mono text-[11px] text-ink-600">
          {node.deadline ? shortDate(node.deadline) : 'no deadline'}
        </span>
      </div>
    )
  }
  /* A step not yet reached is late once its day has passed and close from
     the day before — the same two states a deadline has, in the same colours
     (tokens.css item 8). A reached step is neither. */
  const due = node.reachedAt === undefined ? node.dueDate : undefined
  const tomorrow = localToday(new Date(Date.now() + 24 * 60 * 60 * 1000))
  const dateTone =
    due === undefined
      ? 'text-ink-600'
      : due < today
        ? 'text-state-danger'
        : due <= tomorrow
          ? 'text-state-warn'
          : 'text-ink-600'

  return (
    <div className="flex min-w-0 flex-col md:pr-3">
      <span
        className={`truncate text-[12.5px] ${node.state === 'next' ? 'text-lav-200' : node.state === 'reached' ? 'text-ink-400' : 'text-foreground'}`}
      >
        {node.title}
      </span>
      <span className={`font-mono text-[11px] ${dateTone}`}>
        {node.reachedAt
          ? `reached ${shortDate(localToday(new Date(node.reachedAt)))}`
          : node.dueDate
            ? `${node.dueDate < today ? 'was due' : 'by'} ${shortDate(node.dueDate)}${node.dueTime ? `, ${node.dueTime}` : ''}`
            : ''}
      </span>
    </div>
  )
}
