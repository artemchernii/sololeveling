import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/* R5. A drag writes without asking — that is the done-when — so a mis-drop
   needs one tap back. Five seconds, then it goes: unlike a failed save, there
   is nothing wrong to keep telling you about. A newer drop replaces it. */

export type Undoable = {
  text: string
  at: number
  undo: () => Promise<unknown>
}

const SHOWN_MS = 5000

export function UndoLine({
  undoable,
  onDone,
}: {
  undoable: Undoable | null
  onDone: () => void
}) {
  useEffect(() => {
    if (undoable === null) return
    const t = window.setTimeout(onDone, SHOWN_MS)
    return () => window.clearTimeout(t)
  }, [undoable, onDone])

  if (undoable === null) return null

  /* Portalled: a caller inside a frosted panel would otherwise pin this to
     the panel, not the screen (backdrop-filter makes `fixed` local). */
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-[55] flex justify-center px-[18px] md:bottom-6">
      <div
        key={undoable.at}
        role="status"
        className="glass-modal motion-arrive pointer-events-auto flex items-center gap-3 rounded-[14px] py-2 pr-2 pl-4"
      >
        <span className="text-[13px] text-foreground">{undoable.text}</span>
        <button
          type="button"
          onClick={() => {
            onDone()
            void undoable.undo()
          }}
          className="motion-press rounded-[8px] px-2.5 py-1 text-[12.5px] text-lav-300 hover:bg-lift/[0.06]"
        >
          Undo
        </button>
      </div>
    </div>,
    document.body,
  )
}
