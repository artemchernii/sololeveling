import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMutation } from 'convex/react'
import { Check, CircleHelp, ListChecks, Scale, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { KindIcon, KIND_LABELS, kindName } from '@/components/body/kinds'
import { groupByKind, splitSession } from '@/lib/body/log-groups'
import { useSave } from '@/components/Saving'
import { CategoryChip } from '@/components/track/CategoryChip'
import { clock, whenLabel } from '@/lib/format'

/* The words a Body row can be filed under: capture's own verbs. */
const BODY_CATEGORIES = ['stretch', 'gym', 'boxing', 'hiking', 'run']
const DAY = 86_400_000
const DAY_NAME = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/* What was logged on one day — the day tapped in History's calendar (26
   Sep: the long list below the calendar meant scrolling "to find some
   shit"; now the calendar is the way in and this is one day). Both ways to
   put a row right stay: press the value to correct it, the cross removes
   it; Select ticks rows by tapping them and removes them in one go.

   `logs.listForArea` reads through `by_owner_area_time` from the day's
   midnight; rows after the day are dropped here. Sessions, shakes and
   weigh-ins only — ticked tasks are intent, not evidence (CLAUDE.md), and
   exercise rows are no longer something Body saves.

   `logs.setValue` still refuses a weight, whose stateSnapshot would be left
   contradicting it; a wrong weight is removed and logged again. */
export function DayLog({ day }: { day: number }) {
  const result = useQuery(api.logs.listForArea, { area: 'body', since: day })
  const removeLog = useMutation(api.logs.remove)
  const removeMany = useMutation(api.logs.removeMany)
  const setCategory = useMutation(api.logs.setCategory)
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
    await removeMany({ logIds: [...picked] })
    stopSelecting()
  }

  if (result === undefined) return null
  const rows = result.rows.filter(
    (row) =>
      row.occurredAt < day + DAY &&
      row.kind !== 'task_done' &&
      row.kind !== 'exercise',
  )
  const options = BODY_CATEGORIES

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center gap-3">
        <span className="label-caps flex-1">
          {DAY_NAME.format(new Date(day))}
        </span>
        {selecting ? (
          <>
            <DayToggle
              ids={rows.map((r) => r._id)}
              picked={picked}
              onToggle={toggle}
            />
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => void removePicked()}
              className="motion-press inline-flex items-center gap-1.5 rounded-full bg-state-danger/15 px-3 py-1 font-mono text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/40 transition-opacity ring-inset disabled:opacity-40"
            >
              <Trash2 className="size-3" />
              remove
            </button>
          </>
        ) : null}
        {rows.length > 0 ? (
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className="motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/15 transition-colors ring-inset hover:text-foreground hover:ring-lift/30"
          >
            {selecting ? (
              <X className="size-3" />
            ) : (
              <ListChecks className="size-3" />
            )}
            {selecting ? 'cancel' : 'select'}
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">Nothing logged this day.</p>
      ) : (
        /* Grouped by kind, in the hero's order, each under its icon and
           name (26 Sep: "hard to distinguish different types"); a
           session's moves sit under its workout instead of after a dash. */
        <div className="flex flex-col gap-3">
          {groupByKind(rows).map((group) => (
            <div key={group.key ?? 'unsorted'} className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full ${
                    group.key === null
                      ? 'bg-state-warn/15 text-state-warn'
                      : 'bg-(--area)/15 text-area'
                  }`}
                >
                  {group.key === 'weight' ? (
                    <Scale className="size-3.5" />
                  ) : group.key === null ? (
                    <CircleHelp className="size-3.5" />
                  ) : (
                    <KindIcon kind={group.key} className="size-3.5" />
                  )}
                </span>
                <span className="label-caps text-ink-300">
                  {group.key === 'weight'
                    ? 'weigh-in'
                    : group.key === null
                      ? 'unsorted — pick a type'
                      : kindName(group.key)}
                </span>
              </span>
              <div className="ml-3 flex flex-col border-l border-lift/10 pl-2.5">
                {group.rows.map((row) => {
                  const on = picked.has(row._id)
                  const { title, moves } = splitSession(
                    row.text ??
                      (row.kind === 'workout'
                        ? 'session'
                        : row.kind === 'weight'
                          ? 'weight'
                          : ''),
                  )
                  return (
                    /* In select mode the whole row is the tick (26 Sep: "I
                       click on item and select it, not only checkbox"). */
                    <div
                      key={row._id}
                      role={selecting ? 'checkbox' : undefined}
                      aria-checked={selecting ? on : undefined}
                      aria-label={
                        selecting
                          ? `Select ${title} logged ${whenLabel(row.occurredAt)}`
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
                      className={`motion-arrive group flex min-h-10 items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 transition-colors ${
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
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] leading-snug text-foreground first-letter:uppercase">
                          {title}
                        </span>
                        {moves.length > 0 ? (
                          <span className="text-[12.5px] leading-snug text-ink-400">
                            {moves.join(' · ')}
                          </span>
                        ) : null}
                      </span>
                      {group.key === null && !selecting ? (
                        <CategoryChip
                          category={undefined}
                          options={
                            row.kind === 'intake' ? ['supplements'] : options
                          }
                          labels={KIND_LABELS}
                          onChange={(next) =>
                            void setCategory({ logId: row._id, category: next })
                          }
                        />
                      ) : null}
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
                        aria-label={`Remove ${title} logged ${whenLabel(row.occurredAt)}`}
                        onClick={() => void removeLog({ logId: row._id })}
                        className="motion-press grid size-5 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
      className="motion-press font-mono text-[10px] tracking-[0.12em] text-area uppercase transition-opacity hover:opacity-80"
    >
      {all ? 'clear all' : 'select all'}
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

  /* Nothing to show, nothing held open: the rows are grouped now, and an
     empty column only squeezed the moves (26 Sep). */
  if (value === undefined) return null

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
