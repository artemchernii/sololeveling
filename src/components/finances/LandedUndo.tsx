import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, Undo2, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { failureMessage } from '@/lib/convex-errors'

/* Undo, on the card a save lands on (11 Oct): the moment a wrong number
   is seen is right after saving. One press takes back what that save
   wrote, in every file of the drop (undoFile.takeBackBatch). */
export function UndoSave({
  batchId,
  onUndone,
}: {
  batchId: Id<'batches'>
  onUndone: () => void
}) {
  const undo = useMutation(api.undoFile.takeBackBatch)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setFailed(null)
          undo({ batchId })
            .then(onUndone)
            .catch((e: unknown) => {
              setBusy(false)
              setFailed(failureMessage(e))
            })
        }}
        className={`${PILL_QUIET} gap-2 py-2.5`}
      >
        <Busy on={busy} doing="taking it back…">
          <Undo2 className="size-3.5" />
          undo
        </Busy>
      </button>
      {failed !== null ? (
        <span
          role="alert"
          className="motion-land order-last flex w-full items-center justify-center gap-1.5 text-[12.5px] text-state-danger"
        >
          <X className="size-3.5" />
          Not undone — nothing changed. {failed}
        </span>
      ) : null}
    </>
  )
}

export function Undone({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-5" role="status">
      <span className="motion-pop grid size-16 place-items-center rounded-full bg-state-good/16 text-state-good ring-1 ring-state-good/45">
        <Check className="size-8" strokeWidth={2.5} />
      </span>
      <span className="motion-land text-center text-[24px] font-light text-foreground">
        Taken back
      </span>
      <span className="motion-land max-w-sm text-center text-[13.5px] text-ink-400">
        Your accounts are as they were before this save. Drop the files again
        any time to add them back.
      </span>
      <button
        type="button"
        onClick={onClose}
        className={`${PILL_LOUD} justify-center px-8 py-2.5`}
      >
        done
      </button>
    </div>
  )
}
