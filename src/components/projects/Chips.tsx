import {
  CalendarClock,
  Infinity as InfinityIcon,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Doc } from '../../../convex/_generated/dataModel'
import { daysUntil, deadlineLabel, isOverdue } from '@/lib/format'

/* The two chips that say how a project is doing, in one file because they were
   drifting (21 Sep).

   Artem, looking at the projects list beside the rebuilt project page: "project
   page is new updated and this card is old. Look at date or focus badge."

   He was looking at one fact drawn two ways. A deadline two days out was an
   amber warn pill with an icon on the project page and small grey mono text on
   the card; focus was a lavender pill with a live dot on one and a flat box on
   the other. The card was simply older. Now both places call these, so the
   next change lands in both or in neither. */

/** The three states a date can be in. Shared so a colour cannot mean two
    things in two places. */
export function deadlineTone(project: Doc<'projects'>): {
  skin: string
  Icon: LucideIcon | null
  label: string
} {
  const late = project.deadline !== undefined && isOverdue(project.deadline)
  const soon =
    !late && project.deadline !== undefined && daysUntil(project.deadline) <= 7

  return {
    skin: late
      ? 'bg-state-danger/15 text-state-danger ring-1 ring-state-danger/35 ring-inset hover:bg-state-danger/25'
      : soon
        ? 'bg-state-warn/15 text-state-warn ring-1 ring-state-warn/30 ring-inset hover:bg-state-warn/25'
        : 'text-ink-600 hover:text-ink-200',
    Icon: late ? TriangleAlert : soon ? CalendarClock : null,
    label: project.deadline ? deadlineLabel(project.deadline) : 'no end date',
  }
}

const CHIP =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11.5px]'

/** The deadline, to read. The header's own version is this with a date picker
    behind it — same skin, same words, because it is the same fact. */
export function DeadlineChip({ project }: { project: Doc<'projects'> }) {
  if (project.ongoing === true) {
    return (
      <span
        className={`${CHIP} motion-building bg-lav-900/40 text-lav-200 ring-1 ring-lav-500/30 ring-inset`}
      >
        <InfinityIcon className="size-3" />
        ongoing
      </span>
    )
  }

  const { skin, Icon, label } = deadlineTone(project)
  return (
    <span className={`${CHIP} ${skin}`}>
      {Icon ? <Icon className="size-3" /> : null}
      {label}
    </span>
  )
}

/* The focus badge, awake (20 Sep). It was grey mono caps in a rounded box —
   he called it boring four times, and he was right: the one project that
   matters this week looked like a field label.

   Lavender, a live dot that breathes, and a glow. The accent is reserved for
   live and focus things, and this is the most focus thing in the app. Every
   other status stays quiet, because a paused project is not an event. */
export function StatusBadge({ status }: { status: Doc<'projects'>['status'] }) {
  if (status !== 'focus') {
    return (
      <span className="label-caps rounded-full bg-lift/5 px-2 py-0.5 text-ink-500">
        {status}
      </span>
    )
  }

  return (
    <span className="motion-pop label-caps inline-flex items-center gap-1.5 rounded-full bg-lav-900/80 px-2.5 py-1 text-lav-200 shadow-[0_0_20px_-4px_var(--color-accent)] ring-1 ring-lav-500/50 ring-inset">
      <span className="motion-breathe size-1.5 rounded-full bg-lav-300" />
      focus
    </span>
  )
}
