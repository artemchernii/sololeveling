import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMutation } from 'convex/react'
import { X } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { areaVars } from '@/lib/areas'
import { dayStartsBack, STRIP_WEEKS } from '@/lib/day-strip'

/* Everything filed under Body lately, and both ways to put one right — the
   same bargain the project page makes (20 Sep): press the value to correct
   it, the cross removes the row outright.

   `logs.setValue` still refuses a weight, whose stateSnapshot would be left
   contradicting it; a wrong weight is removed and logged again. */
export function RecentBody() {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const rows = useQuery(api.logs.listSince, { since: dayStarts[0] })
  const removeLog = useMutation(api.logs.remove)

  if (rows === undefined) return null
  const body = rows.filter((row) => row.area === 'body')

  return (
    <section style={areaVars('body')} className="flex flex-col gap-3">
      <h2 className="label-caps">recent</h2>

      {body.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing under Body in the last {STRIP_WEEKS} weeks.
        </p>
      ) : (
        <div className="flex flex-col">
          {body.map((row) => (
            <div
              key={row._id}
              className="group flex items-center gap-3 border-b border-lift/[0.05] py-1.5 last:border-b-0"
            >
              <span className="label-caps w-[92px] shrink-0 truncate">
                {row.meta?.category ?? row.kind}
              </span>
              <EditableValue
                logId={row._id}
                kind={row.kind}
                value={row.value}
                unit={row.unit}
              />
              <span className="flex-1 truncate text-[12.5px] text-ink-500">
                {row.text ?? ''}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-600">
                {new Date(row.occurredAt).toDateString()}
              </span>
              <button
                type="button"
                aria-label={`Remove the ${row.meta?.category ?? row.kind} logged ${new Date(row.occurredAt).toDateString()}`}
                onClick={() => void removeLog({ logId: row._id })}
                className="motion-press grid size-5 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
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

  if (value === undefined) {
    return <span className="w-16 shrink-0 font-mono text-[11px] text-ink-700">—</span>
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
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setEditing(false)
        if (e.key !== 'Enter') return
        const n = Number(text)
        if (!Number.isFinite(n)) return
        void setValue({ logId, value: n })
        setEditing(false)
      }}
      className="w-16 shrink-0 bg-transparent font-mono text-[12px] text-ink-100 focus:outline-none"
    />
  )
}
