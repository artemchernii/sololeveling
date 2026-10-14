import { useState } from 'react'
import { useMutation } from 'convex/react'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy } from '@/components/finances/bits'
import { TickerLogo } from '@/components/finances/Logo'
import type { Landed } from '@/lib/buysLanded'
import { failureMessage } from '@/lib/convex-errors'

/* ADD BUYS' saved screen when this save's buys sit on another thing (14
   Oct, mockup buys-landed.html): his iShares Physical Gold screenshots
   were saved under iShares Digital Security while the screen said
   saved. That thing, its icon, the buys on it as badges, the name the
   files printed — and REMOVE, which takes back the whole save
   (undoFile.takeBackBatch), from both things. */
export function BuysAway({
  away,
  batchId,
  onRemoved,
}: {
  away: ReadonlyArray<Landed>
  batchId: Id<'batches'>
  onRemoved: () => void
}) {
  const undo = useMutation(api.undoFile.takeBackBatch)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const remove = () => {
    setBusy(true)
    setFailed(null)
    undo({ batchId })
      .then(onRemoved)
      .catch((e: unknown) => {
        setBusy(false)
        setFailed(failureMessage(e) ?? '')
      })
  }
  return (
    <div data-testid="buys-away" className="flex flex-col gap-2">
      {away.map((a) => (
        <div
          key={a.symbol}
          data-testid="buys-away-thing"
          className="motion-arrive flex items-center gap-3.5 rounded-[16px] bg-state-warn/[0.07] px-4 py-3.5 ring-1 ring-state-warn/35 ring-inset"
        >
          <TickerLogo symbol={a.symbol} type={a.type} name={a.name} size={44} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="label-caps shrink-0 text-state-warn">
                saved on
              </span>
              <span className="truncate text-[17px] text-foreground">
                {a.name}
              </span>
            </span>
            {a.read.length > 0 ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="label-caps shrink-0">in the file</span>
                <span className="truncate text-[13.5px] text-ink-200">
                  {a.read.join(', ')}
                </span>
              </span>
            ) : null}
            <span className="flex flex-wrap gap-1.5">
              {a.buys > 0 ? <Badge>{a.buys} buy</Badge> : null}
              {a.sells > 0 ? <Badge>{a.sells} sell</Badge> : null}
            </span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="motion-press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-state-warn uppercase ring-1 ring-state-warn/40 ring-inset disabled:opacity-60"
          >
            <Busy on={busy} doing="removing…">
              <X className="size-3.5" />
              remove
            </Busy>
          </button>
        </div>
      ))}
      {failed === null ? null : (
        <span
          role="alert"
          className="text-center font-mono text-[11px] text-state-danger"
        >
          Not removed. {failed}
        </span>
      )}
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-state-warn/14 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-warn uppercase">
      {children}
    </span>
  )
}
