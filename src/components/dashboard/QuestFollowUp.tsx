import { useState } from 'react'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { SaveLabel, useSave } from '@/components/Saving'
import type { PendingEvidence } from './QuestRow'

/* Intent and evidence stay apart in both directions (§3b.1). This writes the
   second row only when it is tapped, never as a consequence of the tick. The
   row goes when the tick has been seen, not when the write lands. */
export function QuestFollowUp({
  pending,
  onDone,
}: {
  pending: PendingEvidence
  onDone: () => void
}) {
  const createLog = useMutation(api.logs.create)
  const [minutes, setMinutes] = useState('')
  const logging = useSave()

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-lift/[0.07] pt-3 text-[12.5px]">
      <span className="text-ink-400">{pending.title}</span>
      <span className="text-ink-600">
        &mdash; done. Log it as a {pending.kind}?
      </span>
      <input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        placeholder="min"
        inputMode="numeric"
        className="w-12 rounded-[5px] border border-lift/10 bg-sink/20 px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground outline-none"
      />
      <button
        type="button"
        disabled={logging.busy}
        onClick={() => {
          const value = Number(minutes.replace(',', '.'))
          void logging.run(() =>
            createLog({
              kind: pending.kind,
              area: pending.area,
              occurredAt: Date.now(),
              value: Number.isFinite(value) && value > 0 ? value : undefined,
              unit: 'min',
            }),
          )
        }}
        className="rounded-[5px] border border-lav-500/60 px-2 py-0.5 text-[11.5px] text-lav-300 transition-colors hover:bg-lav-900/60"
      >
        <SaveLabel
          status={logging.status}
          onSettled={() => {
            logging.settle()
            onDone()
          }}
        >
          Yes
        </SaveLabel>
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
      >
        No
      </button>
    </div>
  )
}
