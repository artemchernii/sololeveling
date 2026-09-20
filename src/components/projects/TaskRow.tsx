import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  TriangleAlert,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { Attachments } from '@/components/attachments/Attachments'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Area } from '@/lib/capture-parser'
import {
  daysUntil,
  durationLabel,
  isOverdue,
  shortDate,
  whenLabel,
} from '@/lib/format'
import { localToday } from '@/lib/today'

/* A task, opened (20 Sep). It was a title and a checkbox, and he said so
   three times: "simple one string is bad".

   A task has carried a `notes` field since R1 and nothing ever showed it, so
   the room was already there — what was missing was a way in. Pressing the
   row opens it: the notes, and the files he drops, pastes or picks.

   20 Sep, again: "tasks in project should be not one line of text, it's going
   to be more complicated". So the shut row stopped being one line. Under the
   title it says what the task already knows and never showed — when it is
   scheduled and for how long, that it is one of today's three, that there are
   notes under it. Only what is set is drawn, so a bare task is still a bare
   line and the list does not turn into a wall. Nothing here is inferred: every
   chip is a stored field. */
export function TaskRow({ task }: { task: Doc<'tasks'> }) {
  const complete = useMutation(api.tasks.complete)
  const setArea = useMutation(api.tasks.setArea)
  const saveNotes = useMutation(api.tasks.setNotes)
  const setDueDate = useMutation(api.tasks.setDueDate)
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(task.notes ?? '')
  const saving = useSave()
  const dirty = notes.trim() !== (task.notes ?? '')

  return (
    <div className="border-b border-lift/[0.05] last:border-b-0">
      <div className="flex items-start gap-3 py-2.5">
        <button
          type="button"
          aria-label={`Complete ${task.title}`}
          onClick={() => void complete({ taskId: task._id })}
          className="motion-press mt-px grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-lift/15 text-transparent transition-colors hover:border-lav-500 hover:text-lav-300"
        >
          <Check className="size-3" />
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
        >
          <ChevronRight
            className={`mt-1 size-3 shrink-0 text-ink-700 transition-transform ${
              open ? 'rotate-90' : ''
            }`}
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[13px] text-foreground">
              {task.title}
            </span>
            <Meta task={task} />
          </span>
        </button>

        <AreaBadge
          area={task.area}
          onChange={(area: Area) => void setArea({ taskId: task._id, area })}
        />
      </div>

      {open ? (
        <div className="flex flex-col gap-3 pt-1 pb-4 pl-[30px]">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notes, a prompt, a link…"
            className="w-full resize-y bg-transparent text-[13px] leading-relaxed whitespace-pre-wrap text-ink-200 outline-none placeholder:text-ink-700"
          />
          {dirty ? (
            <button
              type="button"
              disabled={saving.busy}
              onClick={() =>
                void saving.run(() => saveNotes({ taskId: task._id, notes }))
              }
              className="self-start rounded-[7px] border border-lav-500/60 px-3 py-1 text-[12px] text-lav-300 transition-colors hover:bg-lav-900/60"
            >
              <SaveLabel status={saving.status} onSettled={saving.settle}>
                Save
              </SaveLabel>
            </button>
          ) : null}

          {/* Where a due date is actually set. `dueDate` and its index have
              been in the schema since R1 with no mutation to write them, so
              the field could be read and never filled (20 Sep). */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-caps">due</span>
            <input
              type="date"
              value={task.dueDate ?? ''}
              onChange={(e) =>
                void setDueDate({
                  taskId: task._id,
                  dueDate: e.target.value === '' ? null : e.target.value,
                })
              }
              className="rounded-[8px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[12px] text-ink-300 outline-none transition-colors focus:border-lav-500/60"
            />
            {task.dueDate !== undefined ? (
              <button
                type="button"
                onClick={() =>
                  void setDueDate({ taskId: task._id, dueDate: null })
                }
                className="text-[11.5px] text-ink-700 transition-colors hover:text-ink-400"
              >
                Clear
              </button>
            ) : null}
          </div>

          <Attachments taskId={task._id} compact />
        </div>
      ) : null}
    </div>
  )
}

/* The second line, drawn only from fields that are set. An empty row renders
   nothing at all rather than a line of placeholders. */
function Meta({ task }: { task: Doc<'tasks'> }) {
  const isToday = task.todayFor === localToday()
  const hasNotes = (task.notes ?? '').trim().length > 0
  const scheduled = task.scheduledAt !== undefined
  const due = task.dueDate

  if (!isToday && !hasNotes && !scheduled && due === undefined) return null

  /* A date that has gone is danger, one inside a week is warn — the same
     three states the project deadline uses, for the same reason. */
  const late = due !== undefined && isOverdue(due)
  const soon = !late && due !== undefined && daysUntil(due) <= 7

  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {due !== undefined ? (
        <span
          className={`inline-flex items-center gap-1 font-mono text-[11px] ${
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
          due {shortDate(due)}
        </span>
      ) : null}
      {isToday ? (
        <span className="label-caps inline-flex items-center gap-1 rounded-full bg-lav-900/70 px-1.5 py-0.5 text-lav-200 ring-1 ring-lav-500/40 ring-inset">
          today
        </span>
      ) : null}
      {scheduled ? (
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-600">
          <CalendarClock className="size-3" />
          {whenLabel(task.scheduledAt as number)}
          {task.durationMin !== undefined
            ? ` · ${durationLabel(task.durationMin)}`
            : ''}
        </span>
      ) : null}
      {hasNotes ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-ink-600">
          <FileText className="size-3" />
          notes
        </span>
      ) : null}
    </span>
  )
}
