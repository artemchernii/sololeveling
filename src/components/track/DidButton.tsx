import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { Check, Undo2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Sparks } from '@/components/track/Sparks'

/* The one-tap log (25 Sep): "buttons (counters) where we simply click to
   log DID". A press writes one row — evidence he confirmed with a tap — and
   throws sparks; the count beside it is today's rows of that thing, read
   back from aggregate.ts, never a number this button keeps itself.

   A mis-tap is undone for a few seconds right where it happened. After that
   the row is in Recent, with its own ×. */

const UNDO_MS = 5000

export function DidButton({
  today,
  label,
  onDid,
  size = 'sm',
  icon,
  sub,
}: {
  /** Today's count of this thing, from aggregate.ts. */
  today: number | undefined
  label: string
  onDid: () => Promise<Id<'logs'>>
  size?: 'sm' | 'lg'
  icon?: ReactNode
  /** A second line under a big button's label — "50 min". */
  sub?: string
}) {
  const remove = useMutation(api.logs.remove)
  const [burst, setBurst] = useState(0)
  const [undo, setUndo] = useState<Id<'logs'> | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  function press() {
    setBurst((n) => n + 1)
    setFailed(false)
    onDid().then(
      (logId) => {
        setUndo(logId)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setUndo(null), UNDO_MS)
      },
      () => setFailed(true),
    )
  }

  function takeBack() {
    if (undo === null) return
    const logId = undo
    setUndo(null)
    clearTimeout(timer.current)
    void remove({ logId })
  }

  const done = (today ?? 0) > 0

  if (size === 'lg') {
    return (
      <div className="relative flex min-w-0 flex-col items-stretch gap-1.5">
        <button
          type="button"
          onClick={press}
          className={`motion-press group relative flex min-h-[92px] flex-col items-start justify-between gap-2 overflow-visible rounded-[18px] p-3 text-left sm:p-4 ring-1 transition-colors ring-inset ${
            done
              ? 'bg-(--area)/18 text-(--area) ring-(--area)/55 shadow-[0_0_24px_-6px_var(--area)]'
              : 'bg-lift/[0.04] text-ink-200 ring-lift/12 hover:bg-(--area)/10 hover:text-(--area) hover:ring-(--area)/40'
          }`}
        >
          <span className="flex w-full items-center justify-between gap-2">
            {/* The icon stays once it is done (25 Sep: "after I log once we
                never see the icons again") — the tick joins it as a badge. */}
            <span className="relative grid size-8 place-items-center rounded-full bg-(--area)/15 text-(--area)">
              {icon}
              {done ? (
                <span className="motion-pop absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-(--area) text-background ring-2 ring-background">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              ) : null}
            </span>
            {done ? (
              <span
                key={today}
                className="motion-pop font-mono text-[20px] leading-none font-light"
              >
                ×{today}
              </span>
            ) : null}
          </span>
          <span className="flex flex-col">
            <span className="font-mono text-[11px] tracking-[0.08em] whitespace-nowrap uppercase sm:text-[12px] sm:tracking-[0.14em]">
              {label}
            </span>
            {/* Always there, even empty, so a row of big buttons is one
                height whether or not each has a second line. */}
            <span className="min-h-[15px] font-mono text-[10px] text-ink-500">
              {sub}
            </span>
          </span>
          {burst > 0 ? <Sparks key={burst} count={16} reach={48} /> : null}
        </button>
        {/* Over the button's corner rather than under it, so the row below
            does not jump while the undo is offered. */}
        <span className="absolute right-3 bottom-3">
          <UndoOrError undo={undo !== null} failed={failed} onUndo={takeBack} />
        </span>
      </div>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <UndoOrError undo={undo !== null} failed={failed} onUndo={takeBack} />
      <button
        type="button"
        onClick={press}
        aria-label={`${label}${done ? ` — ${today} today` : ''}`}
        className={`motion-press relative inline-flex h-7 min-w-[64px] items-center justify-center gap-1 rounded-full px-3 font-mono text-[10.5px] tracking-[0.12em] uppercase ring-1 transition-colors ring-inset ${
          done
            ? 'bg-(--area)/20 text-(--area) ring-(--area)/55'
            : 'text-ink-400 ring-lift/15 hover:bg-(--area)/10 hover:text-(--area) hover:ring-(--area)/40'
        }`}
      >
        {done ? (
          <>
            <Check className="motion-draw size-3" />
            <span key={today} className="motion-pop">
              ×{today}
            </span>
          </>
        ) : (
          label
        )}
        {burst > 0 ? <Sparks key={burst} /> : null}
      </button>
    </span>
  )
}

function UndoOrError({
  undo,
  failed,
  onUndo,
}: {
  undo: boolean
  failed: boolean
  onUndo: () => void
}) {
  if (failed) {
    return (
      <span className="motion-arrive font-mono text-[10px] text-state-danger">
        not saved
      </span>
    )
  }
  if (!undo) return null
  return (
    <button
      type="button"
      onClick={onUndo}
      className="motion-arrive inline-flex items-center gap-1 font-mono text-[10px] text-ink-500 transition-colors hover:text-ink-200"
    >
      <Undo2 className="size-3" />
      undo
    </button>
  )
}
