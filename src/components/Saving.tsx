import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Check } from 'lucide-react'
import type { AnimationEvent, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/* A write you pressed for: waiting, done, back to rest (§3d.1 — you caused
   it, so it moves). The animations live in styles.css; this only says which
   state a control is in.

   Rest returns when the tick has finished leaving, not on a timer, so the
   feedback is exactly as long as its animation and reduced-motion shortens
   both together. A failed write goes straight back to rest and rethrows —
   saying what went wrong stays with the screen that knows. */

export type SaveStatus = 'idle' | 'saving' | 'saved'

export function useSave() {
  const [status, setStatus] = useState<SaveStatus>('idle')

  const run = useCallback(async <T,>(write: () => Promise<T>) => {
    setStatus('saving')
    try {
      const result = await write()
      setStatus('saved')
      return result
    } catch (error) {
      setStatus('idle')
      throw error
    }
  }, [])

  /* Only a finished save goes back to rest. A second add typed while the tick
     is still leaving has already moved this to 'saving', and the old tick's
     exit must not cancel the new spinner. */
  const settle = useCallback(
    () => setStatus((s) => (s === 'saved' ? 'idle' : s)),
    [],
  )

  return { status, run, settle, busy: status !== 'idle' }
}

/* One ring with a gap, in the colour of the text it replaces. */
function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Saving"
      className={cn(
        'save-spinner block size-3.5 rounded-full border-[1.5px] border-current border-t-transparent',
        className,
      )}
    />
  )
}

function Done({
  onSettled,
  className,
}: {
  onSettled: () => void
  className?: string
}) {
  /* Settles exactly once: when the tick has left, or when it is removed before
     it could — Escape on a dialog, the add row giving way to "Today is full".
     Without the second, the control would come back later still holding a
     tick, and play it over something that has nothing to do with the save. */
  const latest = useRef(onSettled)
  useLayoutEffect(() => {
    latest.current = onSettled
  })
  const settled = useRef(false)
  const settle = useCallback(() => {
    if (settled.current) return
    settled.current = true
    latest.current()
  }, [])
  /* Deferred a tick and cancelled by a remount: StrictMode (on in dev) runs
     every effect's cleanup once straight after mounting, and settling there
     removed the tick 10ms after it appeared. */
  const removal = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(removal.current)
    return () => {
      removal.current = setTimeout(settle, 0)
    }
  }, [settle])

  return (
    <Check
      role="status"
      aria-label="Saved"
      strokeWidth={2.5}
      className={cn('motion-draw save-done size-3.5', className)}
      /* The tick's paths run their own draw animation and it bubbles; only the
         svg's own exit means the feedback is over. */
      onAnimationEnd={(e: AnimationEvent<SVGSVGElement>) => {
        if (e.target === e.currentTarget && e.animationName === 'save-vanish') {
          settle()
        }
      }}
    />
  )
}

/* For an icon slot: the + beside an add field becomes the spinner, then the
   tick, then the + again. The field itself is never blocked. */
export function SaveGlyph({
  status,
  onSettled,
  idle,
  className,
}: {
  status: SaveStatus
  onSettled: () => void
  idle: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn('grid size-3.5 shrink-0 place-items-center', className)}
    >
      {status === 'saving' ? (
        <Spinner />
      ) : status === 'saved' ? (
        <Done onSettled={onSettled} />
      ) : (
        idle
      )}
    </span>
  )
}

/* For a button's label: the words keep their width while the spinner or tick
   sits over them, so the button never changes size under your finger. */
export function SaveLabel({
  status,
  onSettled,
  children,
}: {
  status: SaveStatus
  onSettled: () => void
  children: ReactNode
}) {
  return (
    <span className="relative inline-grid place-items-center">
      <span
        className={cn(
          status === 'saving' && 'save-yield',
          status === 'saved' && 'invisible',
        )}
      >
        {children}
      </span>
      {status !== 'idle' ? (
        <span className="absolute inset-0 grid place-items-center">
          {status === 'saving' ? <Spinner /> : <Done onSettled={onSettled} />}
        </span>
      ) : null}
    </span>
  )
}
