import { useState } from 'react'
import { useMutation } from 'convex/react'
import { CalendarPlus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { localInputValue, whenLabel } from '@/lib/format'

/* "Put it on the calendar" (R3). A time and a length, written through
   tasks.setSchedule — the same field the TODAY timeline and the week view
   read. Scheduling is not picking: the task stays in the backlog, and today's
   three are still chosen on Today (§3c.1). */
export function ScheduleTask({ task }: { task: Doc<'tasks'> }) {
  const setSchedule = useMutation(api.tasks.setSchedule)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState('')
  const [minutes, setMinutes] = useState('60')

  function begin() {
    setAt(localInputValue(task.scheduledAt ?? nextHour()))
    setMinutes(String(task.durationMin ?? 60))
    setOpen(true)
  }

  async function save() {
    const ms = new Date(at).getTime()
    if (Number.isNaN(ms)) return
    const mins = Number(minutes)
    await setSchedule({
      taskId: task._id,
      scheduledAt: ms,
      durationMin:
        Number.isFinite(mins) && mins > 0 ? Math.round(mins) : undefined,
    })
    setOpen(false)
  }

  async function clear() {
    await setSchedule({ taskId: task._id, scheduledAt: null })
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={begin}
        className="flex items-center gap-1.5 rounded-[7px] border border-lift/10 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lift/20 hover:text-ink-200"
      >
        <CalendarPlus className="size-3" />
        {task.scheduledAt ? whenLabel(task.scheduledAt) : 'Calendar'}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[11.5px] text-ink-300"
      />
      <input
        type="number"
        min={5}
        step={5}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        aria-label="Minutes"
        className="w-16 rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[11.5px] text-ink-300"
      />
      <span className="font-mono text-[11px] text-ink-600">min</span>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-[7px] border border-lav-500/60 px-2 py-1 text-[11.5px] text-lav-300 transition-colors hover:bg-lav-900/60"
      >
        Put it there
      </button>
      {task.scheduledAt ? (
        <button
          type="button"
          onClick={() => void clear()}
          className="text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
        >
          Take it off
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
      >
        Cancel
      </button>
    </div>
  )
}

/** The top of the next hour — a first guess, never a stored value. */
function nextHour(): number {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d.getTime()
}
