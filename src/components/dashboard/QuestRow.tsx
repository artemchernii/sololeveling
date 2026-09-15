import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import type { Area } from '@/lib/capture-parser'

/* §3b.1: ticking the box is intent. The follow-up is the only path from a
   completed task to a row of evidence, and it is one explicit tap. Only body
   and portuguese have a countable action behind them today. */
export type PendingEvidence = {
  title: string
  kind: 'workout' | 'session'
  area: Area
}

export function evidenceFor(task: Doc<'tasks'>): PendingEvidence | null {
  if (task.area === 'body') {
    return { title: task.title, kind: 'workout', area: 'body' }
  }
  if (task.area === 'portuguese') {
    return { title: task.title, kind: 'session', area: 'portuguese' }
  }
  return null
}

export function QuestRow({
  task,
  onCompleted,
}: {
  task: Doc<'tasks'>
  onCompleted: (pending: PendingEvidence | null) => void
}) {
  const complete = useMutation(api.tasks.complete)
  const drop = useMutation(api.tasks.dropFromToday)
  const setArea = useMutation(api.tasks.setArea)
  const setSchedule = useMutation(api.tasks.setSchedule)

  return (
    <div className="flex items-center gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0">
      <button
        type="button"
        aria-label={`Complete ${task.title}`}
        onClick={async () => {
          const pending = evidenceFor(task)
          await complete({ taskId: task._id })
          onCompleted(pending)
        }}
        className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-lift/15 text-transparent transition-colors hover:border-lav-500 hover:text-lav-300"
      >
        <Check className="size-3" />
      </button>

      <span className="flex-1 text-[13px] text-foreground">{task.title}</span>

      <AreaBadge
        area={task.area}
        onChange={(area: Area) => void setArea({ taskId: task._id, area })}
      />

      <ScheduleField
        task={task}
        onSet={(scheduledAt, durationMin) =>
          void setSchedule({ taskId: task._id, scheduledAt, durationMin })
        }
      />

      <button
        type="button"
        aria-label={`Drop ${task.title}`}
        onClick={() => void drop({ taskId: task._id })}
        className="text-ink-700 transition-colors hover:text-ink-400"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/* A time is what puts a quest on the TODAY timeline (§3b.3) — nothing else
   in the app sets scheduledAt. Undated stays the normal case. */
function ScheduleField({
  task,
  onSet,
}: {
  task: Doc<'tasks'>
  onSet: (scheduledAt: number | null, durationMin?: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState(
    task.scheduledAt
      ? new Date(task.scheduledAt).toTimeString().slice(0, 5)
      : '',
  )
  const [minutes, setMinutes] = useState(
    task.durationMin ? String(task.durationMin) : '',
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] text-ink-700 transition-colors hover:text-ink-300"
        title="Give this a time"
      >
        {task.scheduledAt
          ? `${new Date(task.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${task.durationMin ? ` · ${task.durationMin} min` : ''}`
          : 'add a time'}
      </button>
    )
  }

  function save() {
    if (time.length === 0) {
      onSet(null)
      setOpen(false)
      return
    }
    const [h, m] = time.split(':').map(Number)
    const when = new Date()
    when.setHours(h, m, 0, 0)
    const length = Number(minutes)
    onSet(
      when.getTime(),
      Number.isFinite(length) && length > 0 ? length : undefined,
    )
    setOpen(false)
  }

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        aria-label={`Time for ${task.title}`}
        className="rounded-[5px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none"
      />
      <input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        placeholder="min"
        inputMode="numeric"
        aria-label={`Length for ${task.title}`}
        className="w-12 rounded-[5px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground outline-none"
      />
      <button
        type="button"
        onClick={save}
        className="rounded-[5px] border border-lav-500/60 px-1.5 py-0.5 text-[11px] text-lav-300"
      >
        Set
      </button>
    </span>
  )
}
