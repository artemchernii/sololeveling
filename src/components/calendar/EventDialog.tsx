import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { useSave } from '@/components/Saving'
import type { SaveStatus } from '@/components/Saving'
import { useAreas } from '@/lib/areas'
import { endFromTime, toTimeInput } from '@/lib/eventTimes'
import { askToNotify } from '@/lib/reminders'

/* Creating and editing an event. Series-level only, per PLAN §3b.6: an
   occurrence has an id but no row to write to, so "this Tuesday only" is not
   offered rather than offered and silently applied to every Tuesday.
 
   The repeat control is four choices, not an rrule field. The stored value is
   still an rrule string — anything expandable can be read back — but typing
   `FREQ=WEEKLY;BYDAY=TU` is not a thing to ask a person to do at 7am. */

const REPEATS = [
  { label: 'Once', rrule: undefined },
  { label: 'Every day', rrule: 'FREQ=DAILY' },
  { label: 'Weekdays', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every week', rrule: 'FREQ=WEEKLY' },
] as const

/* R5. Minutes before the start; 0 is "at the start". A handful of choices,
   like Repeats, because nobody wants a reminder 17 minutes early. */
const REMINDERS = [
  { label: 'None', min: undefined },
  { label: 'At start', min: 0 },
  { label: '10 min', min: 10 },
  { label: '30 min', min: 30 },
  { label: '1 hour', min: 60 },
] as const

/** `2026-03-03T09:00` — what a datetime-local input speaks, in local time. */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime()
}

export function EventDialog({
  open,
  event,
  startsAt,
  endsAt,
  onClose,
  onCreated,
}: {
  open: boolean
  /** The series being edited, or undefined when creating. */
  event: Doc<'events'> | undefined
  /** Where a click on empty grid landed, used only when creating. */
  startsAt: number
  /** Where a drag across empty time ended; an hour after the start if not. */
  endsAt?: number
  onClose: () => void
  /** A new event was written ('waiting': the dialog is still showing its
      tick) and then seen ('landed': the dialog has closed) — so the grid
      can hold the block back and then play its arrival in the open. */
  onCreated?: (eventId: string, phase: 'waiting' | 'landed') => void
}) {
  const create = useMutation(api.events.create)
  const created = useRef<string | null>(null)
  const update = useMutation(api.events.update)
  const remove = useMutation(api.events.remove)

  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [projectId, setProjectId] = useState('')
  const [goalId, setGoalId] = useState('')
  const [remindMin, setRemindMin] = useState<number | undefined>(undefined)
  const [notifyNote, setNotifyNote] = useState<string | null>(null)
  const projects = useQuery(api.projects.listLive, {})
  const goals = useQuery(api.goals.listActive, {})
  const areas = useAreas()
  const [area, setArea] = useState<string>('')
  const [rrule, setRrule] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const saving = useSave()
  const [deleting, setDeleting] = useState(false)

  /* Reset whenever the dialog is opened on something different, so an edit
     never opens showing the last thing that was edited. */
  useEffect(() => {
    if (!open) return
    setError(null)
    /* A tick left over from a save that finished after the dialog was closed
       must not play — its end closes the dialog. */
    saving.settle()
    if (event) {
      setTitle(event.title)
      setStart(toLocalInput(event.startsAt))
      setEnd(toTimeInput(event.endsAt))
      setArea(event.area ?? '')
      setRrule(event.rrule)
      setProjectId(event.projectId ?? '')
      setGoalId(event.goalId ?? '')
      setRemindMin(event.remindMin)
    } else {
      setTitle('')
      setStart(toLocalInput(startsAt))
      setEnd(toTimeInput(endsAt ?? startsAt + 60 * 60_000))
      setArea('')
      setRrule(undefined)
      setProjectId('')
      setGoalId('')
      setRemindMin(undefined)
    }
    setNotifyNote(null)
  }, [open, event, startsAt, endsAt, saving.settle])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function save() {
    const trimmed = title.trim()
    if (trimmed.length === 0) {
      setError('An event needs a title')
      return
    }
    const startsMs = fromLocalInput(start)
    if (!Number.isFinite(startsMs)) {
      setError('That start time is not a time')
      return
    }

    const endsMs = endFromTime(startsMs, end)
    if (endsMs === null) {
      setError('That end time is not a time')
      return
    }

    /* The pickers list live projects and active goals only, so a binding to
       one that has since been finished is not in them — and must survive an
       edit rather than be cleared by it. The server checks it is yours. */
    const project = projectId === '' ? undefined : (projectId as Id<'projects'>)
    const goal = goalId === '' ? undefined : (goalId as Id<'goals'>)
    try {
      /* The dialog closes when the tick has been seen (onSettled below), not
         the instant the write lands — the event is already on the grid
         behind it by then. */
      await saving.run(async () => {
        if (event) {
          /* null, not undefined, for "none": undefined means leave alone,
             and picking Once used to keep the old repeat that way. */
          await update({
            eventId: event._id,
            title: trimmed,
            startsAt: startsMs,
            endsAt: endsMs,
            area: area === '' ? null : area,
            rrule: rrule ?? null,
            projectId: project ?? null,
            goalId: goal ?? null,
            remindMin: remindMin ?? null,
          })
        } else {
          created.current = await create({
            title: trimmed,
            startsAt: startsMs,
            endsAt: endsMs,
            area: area === '' ? undefined : area,
            rrule,
            projectId: project,
            goalId: goal,
            remindMin,
          })
          onCreated?.(created.current, 'waiting')
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save')
    }
  }

  async function destroy() {
    if (!event) return
    setDeleting(true)
    try {
      await remove({ eventId: event._id })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not delete')
    } finally {
      setDeleting(false)
    }
  }

  /* Portalled, and in the modal material (24 Sep: "this modal is
     transparent which looks broken"). It was drawn in .glass — the card
     material, a see-through fill made to sit over the ground — so the week
     grid read straight through it, and it was mounted inside the calendar,
     where a frosted ancestor keeps a blur from reaching the page. */
  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-sink/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event ? 'Edit event' : 'New event'}
        className="fixed left-1/2 top-[14vh] z-50 w-[min(460px,92vw)] -translate-x-1/2"
      >
        <div className="glass-modal motion-arrive flex flex-col gap-3 rounded-[18px] p-4">
          <div className="label-caps">{event ? 'Edit event' : 'New event'}</div>

          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Gym, PT, weekly review…"
            className="rounded-[7px] bg-lift/[0.05] px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
          />

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="label-caps">Starts</span>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-[7px] bg-lift/[0.05] px-3 py-2 font-mono text-[12px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
              />
            </label>
            <label className="flex w-[110px] flex-col gap-1">
              <span className="label-caps">Ends</span>
              <input
                type="time"
                step={300}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-[7px] bg-lift/[0.05] px-3 py-2 font-mono text-[12px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
              />
            </label>
          </div>
          {(() => {
            /* An end earlier than the start is the small hours of the next
               day — a late session, not a mistake. Said, so it is not a
               surprise on the grid. */
            const s0 = fromLocalInput(start)
            const e0 = Number.isFinite(s0) ? endFromTime(s0, end) : null
            if (e0 === null || !Number.isFinite(s0)) return null
            const mins = Math.round((e0 - s0) / 60_000)
            const next = new Date(e0).getDate() !== new Date(s0).getDate()
            return (
              <p className="-mt-1 font-mono text-[11px] text-ink-600">
                {Math.floor(mins / 60) > 0 ? `${Math.floor(mins / 60)}h ` : ''}
                {mins % 60 > 0 || mins === 0 ? `${mins % 60}m` : ''}
                {next ? ' · ends next day' : ''}
              </p>
            )
          })()}

          <div className="flex flex-col gap-1">
            <span className="label-caps">Repeats</span>
            <div className="flex flex-wrap gap-1.5">
              {REPEATS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setRrule(option.rrule)}
                  className={[
                    'rounded-[6px] px-2.5 py-1 text-[11.5px] transition-colors',
                    rrule === option.rrule
                      ? 'bg-lav-300/20 text-foreground ring-1 ring-lav-300/40'
                      : 'bg-lift/[0.05] text-ink-500 ring-1 ring-lift/10',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {event && rrule ? (
              <p className="text-[11.5px] text-ink-600">
                Editing the whole series. Changing one occurrence isn’t possible
                yet.
              </p>
            ) : null}
          </div>

          <label className="flex flex-col gap-1">
            <span className="label-caps">Area</span>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="rounded-[7px] bg-lift/[0.05] px-3 py-2 text-[12.5px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
            >
              <option value="">None</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="label-caps">Project</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-[7px] bg-lift/[0.05] px-3 py-2 text-[12.5px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
              >
                <option value="">None</option>
                {projectId !== '' &&
                projects !== undefined &&
                !projects.some((p) => p._id === projectId) ? (
                  <option value={projectId}>A finished project</option>
                ) : null}
                {(projects ?? []).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="label-caps">Goal</span>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="rounded-[7px] bg-lift/[0.05] px-3 py-2 text-[12.5px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
              >
                <option value="">None</option>
                {goalId !== '' &&
                goals !== undefined &&
                !goals.some((g) => g._id === goalId) ? (
                  <option value={goalId}>A finished goal</option>
                ) : null}
                {(goals ?? []).map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="label-caps">Remind me</span>
            <div className="flex flex-wrap gap-1.5">
              {REMINDERS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => {
                    setRemindMin(option.min)
                    /* Asked here, on a tap, because browsers only let a page
                       ask from one — and only once a reminder is wanted. */
                    if (option.min !== undefined) {
                      void askToNotify().then(setNotifyNote)
                    } else {
                      setNotifyNote(null)
                    }
                  }}
                  className={[
                    'rounded-[6px] px-2.5 py-1 text-[11.5px] transition-colors',
                    remindMin === option.min
                      ? 'bg-lav-300/20 text-foreground ring-1 ring-lav-300/40'
                      : 'bg-lift/[0.05] text-ink-500 ring-1 ring-lift/10',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {notifyNote ? (
              <p className="text-[11.5px] text-ink-600">{notifyNote}</p>
            ) : null}
          </div>

          {error ? (
            <p className="text-[12px] text-destructive">{error}</p>
          ) : null}

          <div className="flex items-center justify-between pt-1">
            {event ? (
              <button
                type="button"
                onClick={destroy}
                disabled={saving.busy || deleting}
                className="text-[12px] text-ink-600 hover:text-destructive"
              >
                Delete series
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[7px] px-3 py-1.5 text-[12.5px] text-ink-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving.busy || deleting}
                className="disabled:cursor-default"
              >
                <SaveMoment
                  status={saving.status}
                  what={event ? 'Event saved' : 'Event added'}
                  onSettled={() => {
                    saving.settle()
                    onClose()
                    if (created.current) {
                      onCreated?.(created.current, 'landed')
                      created.current = null
                    }
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* The Save button, as a moment (24 Sep: "some cool spinner into checked and
   some EVENT ADDED"). The shared SaveLabel holds its spinner back for fast
   writes, and a calendar write is fast — so the press was never seen to do
   anything. Here the spinner always shows for a beat, then the button turns
   the colour of a thing that went well, a tick draws, and it says what
   happened. Then the dialog closes and the block pours into its slot. */
const SPIN_AT_LEAST = 450
const DONE_FOR = 950

function SaveMoment({
  status,
  what,
  onSettled,
}: {
  status: SaveStatus
  what: string
  onSettled: () => void
}) {
  const [shown, setShown] = useState<'idle' | 'spin' | 'done'>('idle')
  const since = useRef(0)
  const settled = useRef(onSettled)
  useEffect(() => {
    settled.current = onSettled
  })

  useEffect(() => {
    if (status === 'idle') {
      setShown('idle')
      return
    }
    if (status === 'saving') {
      since.current = Date.now()
      setShown('spin')
      return
    }
    const wait = Math.max(0, SPIN_AT_LEAST - (Date.now() - since.current))
    const toDone = window.setTimeout(() => setShown('done'), wait)
    const toClose = window.setTimeout(() => settled.current(), wait + DONE_FOR)
    return () => {
      window.clearTimeout(toDone)
      window.clearTimeout(toClose)
    }
  }, [status])

  return (
    <span
      className={`relative inline-flex h-[30px] items-center justify-center gap-2 overflow-hidden rounded-full px-4 text-[12.5px] ring-1 transition-[background-color,box-shadow,color] duration-(--motion-base) ${
        shown === 'done'
          ? 'bg-state-good/15 text-state-good shadow-[0_0_22px_-6px_var(--color-state-good)] ring-state-good/50'
          : 'bg-lav-300/20 text-foreground ring-lav-300/40 hover:bg-lav-300/28'
      }`}
    >
      {shown === 'idle' ? (
        'Save'
      ) : shown === 'spin' ? (
        <span
          role="status"
          aria-label="Saving"
          className="save-spinner block size-4 rounded-full border-2 border-lav-200 border-t-transparent"
        />
      ) : (
        <>
          <span className="motion-pop grid size-4 place-items-center rounded-full bg-state-good text-background">
            <Check className="motion-draw size-3" strokeWidth={3} />
          </span>
          <span
            role="status"
            className="motion-arrive font-mono text-[11px] tracking-[0.16em] uppercase"
          >
            {what}
          </span>
        </>
      )}
    </span>
  )
}
