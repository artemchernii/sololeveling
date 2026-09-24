import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMutation } from 'convex/react'
import { CircleHelp, Scale, X } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { KindIcon, KIND_LABELS } from '@/components/body/kinds'
import { useSave } from '@/components/Saving'
import { CategoryChip } from '@/components/track/CategoryChip'
import { TrackPanel } from '@/components/track/TrackPanel'
import { dayStartsBack, STRIP_WEEKS } from '@/lib/day-strip'
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
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.logs.listForArea, {
    area: 'body',
    since: dayStarts[0],
  })
  const drills = useQuery(api.drills.list, { area: 'body' })
  const removeLog = useMutation(api.logs.remove)
  const setCategory = useMutation(api.logs.setCategory)
  const [all, setAll] = useState(false)

  if (result === undefined) return null
  /* A ticked task is intent, not evidence (CLAUDE.md): "Play Diablo" filed
     under Body is not something the body did, so it is not listed here. */
  const body = result.rows.filter((row) => row.kind !== 'task_done')
  const { complete } = result
  const options = [
    ...new Set([...BODY_CATEGORIES, ...(drills ?? []).map((d) => d.group)]),
  ]
  const shown = all ? body : body.slice(0, SHOWN)

  return (
    <TrackPanel
      area="body"
      title="done"
      delay={delay}
      aside={
        !complete ? (
          <span className="font-mono text-[11px] text-ink-500">
            older logs not all stored
          </span>
        ) : null
      }
    >
      {body.length === 0 ? (
        <p className="text-[13px] text-ink-400">
          Nothing under Body in the last {STRIP_WEEKS} weeks. Every session,
          exercise and weigh-in lands here, by day.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groupByDay(shown).map((day) => (
            <div key={day.key} className="flex flex-col gap-1">
              <span className="label-caps">{day.label}</span>
              {day.rows.map((row) => {
                const category =
                  row.kind === 'weight' ? 'weight' : row.meta?.category
                return (
                  <div
                    key={row._id}
                    className="motion-arrive group flex min-h-10 items-center gap-2.5 rounded-[12px] px-1.5 py-1 transition-colors hover:bg-lift/[0.04]"
                  >
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
                    {row.kind === 'weight' ? (
                      <span className="label-caps w-[92px] shrink-0 truncate">
                        weight
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

/* A weight is not editable here and says so: logs.setValue refuses one,
   because the stateSnapshot it wrote would be left contradicting the log. */
function EditableValue({
  logId,
  kind,
  value,
  unit,
}: {
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
        {value}
        {unit === 'min' ? 'm' : unit === 'kg' ? 'kg' : ''}
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
