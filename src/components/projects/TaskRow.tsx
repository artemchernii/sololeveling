import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  CalendarArrowUp,
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
import { EditorPanel } from '@/components/EditorPanel'
import { useSave } from '@/components/Saving'
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
   notes or files under it. Only what is set is drawn, so a bare task is still
   a bare line and the list does not turn into a wall. Nothing here is
   inferred: every chip is a stored field.

   20 Sep, third time: the open panel had no edge, no way to change the title
   and no way out but saving. All three now live in `EditorPanel`, shared with
   a note — one panel, so the two blocks on this page stop being two
   unrelated designs.

   `showArea` is false wherever the page above already answers the question.
   On a project, every task carries that project's goal's area, so a badge
   there is a control that can only be pressed to make the answer wrong. */
export function TaskRow({
  task,
  showArea = true,
}: {
  task: Doc<'tasks'>
  showArea?: boolean
}) {
  const complete = useMutation(api.tasks.complete)
  const setArea = useMutation(api.tasks.setArea)
  const setTitle = useMutation(api.tasks.setTitle)
  const saveNotes = useMutation(api.tasks.setNotes)
  const setDueDate = useMutation(api.tasks.setDueDate)

  const dueToday = localToday()
  const isDueToday = task.dueDate === dueToday

  const [open, setOpen] = useState(false)
  const [title, setTitleDraft] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const saving = useSave()

  const dirty =
    title.trim() !== task.title || notes.trim() !== (task.notes ?? '')

  function shut() {
    setTitleDraft(task.title)
    setNotes(task.notes ?? '')
    setOpen(false)
  }

  async function save() {
    /* Two fields, two mutations, and only the one that changed is sent — a
       write that does nothing still shows a tick, which would teach the tick
       to mean nothing. */
    await saving.run(async () => {
      if (title.trim() !== task.title) {
        await setTitle({ taskId: task._id, title })
      }
      if (notes.trim() !== (task.notes ?? '')) {
        await saveNotes({ taskId: task._id, notes })
      }
    })
  }

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
          onClick={() => (open ? shut() : setOpen(true))}
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
            {open ? null : <Meta task={task} />}
          </span>
        </button>

        {showArea ? (
          <AreaBadge
            area={task.area}
            onChange={(area: Area) => void setArea({ taskId: task._id, area })}
          />
        ) : null}
      </div>

      {open ? (
        <div className="pb-3 pl-[30px]">
          <EditorPanel
            parent={{ taskId: task._id }}
            area={task.area}
            title={title}
            onTitle={setTitleDraft}
            titlePlaceholder="What the task is"
            body={notes}
            onBody={setNotes}
            bodyPlaceholder="Notes, a prompt, a link…"
            dirty={dirty}
            status={saving.status}
            onSettled={saving.settle}
            onSave={() => void save()}
            onCancel={shut}
          >
            {/* Where a due date is actually set. `dueDate` and its index have
                been in the schema since R1 with no mutation to write them, so
                the field could be read and never filled (20 Sep). It writes
                on change rather than on Save, because a date picker has
                already asked you to confirm. */}
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
              {/* The date you pick most, in one press (20 Sep). A date
                  picker asks for a year and a month to say a thing you
                  already know the name of. `dueDate` is a calendar date, so
                  "today" is today's local date — midnight to midnight is the
                  whole of what the field can hold. */}
              <button
                type="button"
                onClick={() =>
                  void setDueDate({ taskId: task._id, dueDate: dueToday })
                }
                aria-pressed={isDueToday}
                className={`motion-press flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[12px] ring-1 transition-colors ${
                  isDueToday
                    ? 'bg-lav-900/70 text-lav-200 ring-lav-500/40'
                    : 'text-ink-400 ring-lift/10 hover:bg-lift/5 hover:text-foreground'
                }`}
              >
                <CalendarArrowUp className="size-3.5" />
                Today
              </button>
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
          </EditorPanel>
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
