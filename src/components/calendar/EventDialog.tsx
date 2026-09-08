import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { Area } from '@/lib/capture-parser'

/* Creating and editing an event. Series-level only, per PLAN §3b.6: an
   occurrence has an id but no row to write to, so "this Tuesday only" is not
   offered rather than offered and silently applied to every Tuesday.
 
   The repeat control is four choices, not an rrule field. The stored value is
   still an rrule string — anything expandable can be read back — but typing
   `FREQ=WEEKLY;BYDAY=TU` is not a thing to ask a person to do at 7am. */

const AREAS: Array<Area> = [
  'business',
  'portuguese',
  'body',
  'money',
  'social',
  'career',
  'style',
  'knowledge',
  'life',
]

const REPEATS = [
  { label: 'Once', rrule: undefined },
  { label: 'Every day', rrule: 'FREQ=DAILY' },
  { label: 'Weekdays', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every week', rrule: 'FREQ=WEEKLY' },
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
  onClose,
}: {
  open: boolean
  /** The series being edited, or undefined when creating. */
  event: Doc<'events'> | undefined
  /** Where a click on empty grid landed, used only when creating. */
  startsAt: number
  onClose: () => void
}) {
  const create = useMutation(api.events.create)
  const update = useMutation(api.events.update)
  const remove = useMutation(api.events.remove)

  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [durationMin, setDurationMin] = useState(60)
  const [area, setArea] = useState<Area | ''>('')
  const [rrule, setRrule] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /* Reset whenever the dialog is opened on something different, so an edit
     never opens showing the last thing that was edited. */
  useEffect(() => {
    if (!open) return
    setError(null)
    if (event) {
      setTitle(event.title)
      setStart(toLocalInput(event.startsAt))
      setDurationMin(Math.round((event.endsAt - event.startsAt) / 60_000))
      setArea(event.area ?? '')
      setRrule(event.rrule)
    } else {
      setTitle('')
      setStart(toLocalInput(startsAt))
      setDurationMin(60)
      setArea('')
      setRrule(undefined)
    }
  }, [open, event, startsAt])

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

    setSaving(true)
    try {
      const fields = {
        title: trimmed,
        startsAt: startsMs,
        endsAt: startsMs + durationMin * 60_000,
        area: area === '' ? undefined : area,
        rrule,
      }
      if (event) {
        await update({ eventId: event._id, ...fields })
      } else {
        await create(fields)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save')
    } finally {
      setSaving(false)
    }
  }

  async function destroy() {
    if (!event) return
    setSaving(true)
    try {
      await remove({ eventId: event._id })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event ? 'Edit event' : 'New event'}
        className="fixed left-1/2 top-[14vh] z-50 w-[min(460px,92vw)] -translate-x-1/2"
      >
        <div className="glass flex flex-col gap-3 rounded-[18px] p-4">
          <div className="label-caps">{event ? 'Edit event' : 'New event'}</div>

          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Gym, PT, weekly review…"
            className="rounded-[7px] bg-white/[0.05] px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-white/10 focus:ring-lav-300/40"
          />

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="label-caps">Starts</span>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-[7px] bg-white/[0.05] px-3 py-2 font-mono text-[12px] text-foreground outline-none ring-1 ring-white/10 focus:ring-lav-300/40"
              />
            </label>
            <label className="flex w-[110px] flex-col gap-1">
              <span className="label-caps">Minutes</span>
              <input
                type="number"
                min={0}
                step={5}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="rounded-[7px] bg-white/[0.05] px-3 py-2 font-mono text-[12px] text-foreground outline-none ring-1 ring-white/10 focus:ring-lav-300/40"
              />
            </label>
          </div>

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
                      : 'bg-white/[0.05] text-ink-500 ring-1 ring-white/10',
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
              onChange={(e) => setArea(e.target.value as Area | '')}
              className="rounded-[7px] bg-white/[0.05] px-3 py-2 text-[12.5px] text-foreground outline-none ring-1 ring-white/10 focus:ring-lav-300/40"
            >
              <option value="">None</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <p className="text-[12px] text-red-300/90">{error}</p>
          ) : null}

          <div className="flex items-center justify-between pt-1">
            {event ? (
              <button
                type="button"
                onClick={destroy}
                disabled={saving}
                className="text-[12px] text-ink-600 hover:text-red-300/90"
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
                disabled={saving}
                className="rounded-[7px] bg-lav-300/20 px-3 py-1.5 text-[12.5px] text-foreground ring-1 ring-lav-300/40 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
