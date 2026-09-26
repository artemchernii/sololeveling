import { useState } from 'react'
import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'

import type { Id } from '../../../convex/_generated/dataModel'
import { UndoOrError, useUndoWindow } from '@/components/track/DidButton'
import { Sparks } from '@/components/track/Sparks'
import { DEFAULT_TIME, atTime } from '@/lib/past-day'

/* The tapped day in History, when it is a day that has gone (26 Sep: "we
   can't log past events in body and languages"). The same kinds Today
   has, as chips, and the time it happened — noon unless he says. Each tap
   writes one row, dated that day, with the few seconds of undo every
   one-tap log has. Today keeps its own big buttons; this is for the day
   he forgot. */

const DAY_NAME = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export type PastKind = {
  key: string
  label: string
  icon: ReactNode
  /** Writes the row at this instant; returns its id for undo. */
  log: (occurredAt: number) => Promise<Id<'logs'>>
}

export function LogPastDay({
  day,
  kinds,
}: {
  day: number
  kinds: ReadonlyArray<PastKind>
}) {
  const [time, setTime] = useState(DEFAULT_TIME)
  const [burst, setBurst] = useState<{ key: string; n: number } | null>(null)
  const { press, takeBack, canUndo, failed } = useUndoWindow()
  const at = atTime(day, time)

  return (
    <div className="motion-arrive flex flex-col gap-2.5 rounded-[12px] bg-lav-400/6 p-3 ring-1 ring-lav-400/25 ring-inset">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps text-lav-400">
          log on {DAY_NAME.format(new Date(day))}
        </span>
        <label className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[12px] text-ink-200 ring-1 ring-lift/15 ring-inset focus-within:ring-lav-400/50">
          <Clock className="size-3.5 text-ink-500" />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="What time it happened"
            className="bg-transparent text-ink-100 focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </label>
        <UndoOrError undo={canUndo} failed={failed} onUndo={takeBack} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            disabled={at === null}
            onClick={() => {
              if (at === null) return
              setBurst((b) => ({ key: k.key, n: (b?.n ?? 0) + 1 }))
              press(() => k.log(at))
            }}
            className="motion-press relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-ink-200 ring-1 ring-lav-400/25 ring-inset transition-colors hover:bg-lav-400/10 hover:text-foreground hover:ring-lav-400/50 disabled:opacity-40"
          >
            <span className="text-area">{k.icon}</span>
            {k.label}
            {burst?.key === k.key ? (
              <Sparks key={burst.n} count={10} reach={28} />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
