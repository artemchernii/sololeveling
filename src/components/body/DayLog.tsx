import { useDayStarts } from '@/components/track/useDayStarts'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMutation } from 'convex/react'
import { Check, CircleHelp, ListChecks, Scale, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { KindIcon, KIND_LABELS } from '@/components/body/kinds'
import { useSave } from '@/components/Saving'
import { CategoryChip } from '@/components/track/CategoryChip'
import { TrackPanel } from '@/components/track/TrackPanel'
import { STRIP_WEEKS } from '@/lib/day-strip'
import { groupByDay } from '@/lib/day-groups'
import { clock, whenLabel } from '@/lib/format'

/* The words a Body row can be filed under: capture's own verbs, then any
   routine he has made. */
const BODY_CATEGORIES = ['stretch', 'gym', 'boxing', 'hiking', 'run']
/* How many rows show before "show all" — a morning of ticked stretches is
   six rows, and the list should not push the page away. */
const SHOWN = 12

/* Everything filed under Body lately, and both ways to put one right — the
   same bargain the project page makes (20 Sep): press the value to correct
   it, the cross removes the row outright.

   `logs.listForArea` reads through `by_owner_area_time`, so this only ever
   sees body rows — no filtering here, and no risk of another area crowding
   body rows out of a shared cap the way reading `listSince` broad once did.

   `logs.setValue` still refuses a weight, whose stateSnapshot would be left
   contradicting it; a wrong weight is removed and logged again. */
export function RecentBody({ delay = 0 }: { delay?: number }) {
  const dayStarts = useDayStarts()
  const result = useQuery(api.logs.listForArea, {
    area: 'body',
    since: dayStarts[0],
  })
  const removeLog = useMutation(api.logs.remove)
  const removeMany = useMutation(api.logs.removeMany)
  const setCategory = useMutation(api.logs.setCategory)
  const [all, setAll] = useState(false)
  /* Select mode (26 Sep: "in DONE we want to bulk undo"): a tick per row
     and per day, then one Remove for all of them. */
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<Id<'logs'>>>(new Set())
  const toggle = (ids: Array<Id<'logs'>>, on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const stopSelecting = () => {
    setSelecting(false)
    setPicked(new Set())
  }
  async function removePicked() {
    const ids = [...picked]
    /* removeMany takes 200 at a time; a long History can hold more. */
    for (let i = 0; i < ids.length; i += 200) {
      await removeMany({ logIds: ids.slice(i, i + 200) })
    }
    stopSelecting()
  }

  if (result === undefined) return null
  /* A ticked task is intent, not evidence (CLAUDE.md): "Play Diablo" filed
     under Body is not something the body did, so it is not listed here. */
  const body = result.rows.filter(
    /* Sessions, shakes and weigh-ins (26 Sep): Body saves sessions now, and
       the exercise rows ticked before that were a record nobody read. */
    (row) => row.kind !== 'task_done' && row.kind !== 'exercise',
  )
  const { complete } = result
  const options = BODY_CATEGORIES
  const shown = all ? body : body.slice(0, SHOWN)

  return (
    <TrackPanel
      area="body"
      title="history"
      delay={delay}
      aside={
        <span className="flex items-center gap-3">
          {!complete ? (
            <span className="font-mono text-[11px] text-ink-500">
              older logs not all stored
            </span>
          ) : null}
          {body.length > 0 ? (
            <button
              type="button"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              className="motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/15 transition-colors ring-inset hover:text-(--area) hover:ring-(--area)/40"
            >
              {selecting ? (
                <X className="size-3" />
              ) : (
                <ListChecks className="size-3" />
              )}
              {selecting ? 'cancel' : 'select'}
            </button>
          ) : null}
        </span>
      }
    >
      {selecting ? (
        <div className="motion-arrive sticky top-2 z-10 -mt-1 flex items-center gap-3 rounded-[14px] bg-background/80 px-3 py-2 ring-1 ring-lift/12 backdrop-blur ring-inset">
          <span className="flex-1 text-[13px] text-ink-300">
            Tick rows, or a whole day.
          </span>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={() => void removePicked()}
            className="motion-press inline-flex items-center gap-1.5 rounded-full bg-state-danger/15 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/40 transition-opacity ring-inset disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            remove selected
          </button>
        </div>
      ) : null}
      {body.length === 0 ? (
        <p className="text-[13px] text-ink-400">
          Nothing under Body in the last {STRIP_WEEKS} weeks. Every session,
          exercise and weigh-in lands here, by day.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groupByDay(shown).map((day) => (
            <div key={day.key} className="flex flex-col gap-1">
              <span className="flex items-center gap-3">
                <span className="label-caps">{day.label}</span>
                {selecting ? (
                  <DayToggle
                    ids={day.rows.map((r) => r._id)}
                    picked={picked}
                    onToggle={toggle}
                  />
                ) : null}
              </span>
              {day.rows.map((row) => {
                const category =
                  row.kind === 'weight' ? 'weight' : row.meta?.category
                const on = picked.has(row._id)
                return (
                  /* In select mode the whole row is the tick (26 Sep: "I
                     click on item and select it, not only checkbox"), so
                     the chip and the value turn to plain text there. */
                  <div
                    key={row._id}
                    role={selecting ? 'checkbox' : undefined}
                    aria-checked={selecting ? on : undefined}
                    aria-label={
                      selecting
                        ? `Select the ${row.meta?.category ?? row.kind} logged ${whenLabel(row.occurredAt)}`
                        : undefined
                    }
                    tabIndex={selecting ? 0 : undefined}
                    onClick={
                      selecting ? () => toggle([row._id], !on) : undefined
                    }
                    onKeyDown={
                      selecting
                        ? (e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault()
                              toggle([row._id], !on)
                            }
                          }
                        : undefined
                    }
                    className={`motion-arrive group flex min-h-11 items-center gap-2.5 rounded-[12px] px-1.5 py-1 transition-colors ${
                      selecting ? 'cursor-pointer select-none' : ''
                    } ${
                      on
                        ? 'bg-state-danger/10 ring-1 ring-state-danger/30 ring-inset'
                        : 'hover:bg-lift/[0.04]'
                    }`}
                  >
                    {selecting ? (
                      <span
                        aria-hidden
                        className={`grid size-5 shrink-0 place-items-center rounded-[6px] transition-colors ${
                          on
                            ? 'bg-state-danger text-background'
                            : 'ring-1 ring-lift/25'
                        }`}
                      >
                        {on ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : null}
                      </span>
                    ) : null}
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full ${
                        category
                          ? 'bg-(--area)/15 text-(--area)'
                          : 'bg-state-warn/15 text-state-warn'
                      }`}
                    >
                      {row.kind === 'weight' ? (
                        <Scale className="size-3.5" />
                      ) : category ? (
                        <KindIcon kind={category} className="size-3.5" />
                      ) : (
                        <CircleHelp className="size-3.5" />
                      )}
                    </span>
                    {row.kind === 'weight' || selecting ? (
                      <span className="label-caps w-[92px] shrink-0 truncate">
                        {row.kind === 'weight'
                          ? 'weight'
                          : category === undefined
                            ? 'unsorted'
                            : category in KIND_LABELS
                              ? KIND_LABELS[category]
                              : category}
                      </span>
                    ) : (
                      <CategoryChip
                        category={row.meta?.category}
                        options={
                          row.kind === 'intake' ? ['supplements'] : options
                        }
                        labels={KIND_LABELS}
                        onChange={(next) =>
                          void setCategory({ logId: row._id, category: next })
                        }
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
                      {row.text ?? (row.kind === 'workout' ? 'session' : '')}
                    </span>
                    <EditableValue
                      readOnly={selecting}
                      logId={row._id}
                      kind={row.kind}
                      value={row.value}
                      unit={row.unit}
                    />
                    <span className="shrink-0 font-mono text-[11px] text-ink-600">
                      {clock(new Date(row.occurredAt))}
                    </span>
                    <button
                      type="button"
                      hidden={selecting}
                      aria-label={`Remove the ${row.meta?.category ?? row.kind} logged ${whenLabel(row.occurredAt)}`}
                      onClick={() => void removeLog({ logId: row._id })}
                      className="motion-press grid size-5 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
          {body.length > SHOWN ? (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className="motion-press mt-2 self-start font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase transition-colors hover:text-(--area)"
            >
              {all ? 'show fewer' : 'show all'}
            </button>
          ) : null}
        </div>
      )}
    </TrackPanel>
  )
}

function DayToggle({
  ids,
  picked,
  onToggle,
}: {
  ids: Array<Id<'logs'>>
  picked: ReadonlySet<Id<'logs'>>
  onToggle: (ids: Array<Id<'logs'>>, on: boolean) => void
}) {
  const all = ids.every((id) => picked.has(id))
  return (
    <button
      type="button"
      onClick={() => onToggle(ids, !all)}
      className="motion-press font-mono text-[10px] tracking-[0.12em] text-(--area) uppercase transition-opacity hover:opacity-80"
    >
      {all ? 'clear day' : 'select day'}
    </button>
  )
}

/* A weight is not editable here and says so: logs.setValue refuses one,
   because the stateSnapshot it wrote would be left contradicting the log. */
function EditableValue({
  readOnly,
  logId,
  kind,
  value,
  unit,
}: {
  readOnly: boolean
  logId: Id<'logs'>
  kind: string
  value: number | undefined
  unit: string | undefined
}) {
  const setValue = useMutation(api.logs.setValue)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const saving = useSave()

  if (value === undefined) {
    return <span aria-hidden className="w-16 shrink-0" />
  }

  /* Guarded and run the same way EditableMinutes does (ProjectStats.tsx): a
     non-finite or non-positive number is silently reset rather than sent —
     `logs.setValue` refuses it too, and reaching the server for a mistake the
     input already knows about would be an unhandled rejection with nothing
     shown for it. */
  function save() {
    const n = Number(text)
    if (!Number.isFinite(n) || n <= 0) {
      setText(String(value))
      setEditing(false)
      return
    }
    if (n === value) {
      setEditing(false)
      return
    }
    void saving
      .run(() => setValue({ logId, value: n }))
      .then(() => {
        setEditing(false)
      })
  }

  const shown = `${value}${unit === 'min' ? 'm' : unit === 'kg' ? 'kg' : ''}`
  /* Plain text while selecting: a disabled button would swallow the click
     meant for the row. */
  if (readOnly) {
    return (
      <span className="w-16 shrink-0 font-mono text-[12px] text-ink-300">
        {shown}
      </span>
    )
  }

  if (kind === 'weight' || !editing) {
    return (
      <button
        type="button"
        disabled={kind === 'weight'}
        onClick={() => setEditing(true)}
        title={
          kind === 'weight'
            ? 'A weight is removed and logged again, not edited'
            : undefined
        }
        className="w-16 shrink-0 text-left font-mono text-[12px] text-ink-300 disabled:text-ink-500"
      >
        {shown}
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setText(String(value))
          setEditing(false)
        }
        if (e.key === 'Enter') save()
      }}
      className="w-16 shrink-0 bg-transparent font-mono text-[12px] text-ink-100 focus:outline-none"
    />
  )
}
