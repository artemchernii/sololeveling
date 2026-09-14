import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { failureMessage } from '@/lib/convex-errors'

/* Most writes in the app are fired from a tap — `void setArea(...)`, a tick,
   a drop — with nothing waiting on the answer. When one of those failed, the
   rejection went nowhere and the screen simply did not change: a save that
   silently did not land. Wrapping thirty call sites would spread the same
   catch everywhere and still miss the thirty-first.

   So the failure is caught where every unhandled rejection ends up. A write
   that handles its own error — the event dialog, "Today is full" on the
   backlog — never arrives here, so nothing is said twice.

   It stays until dismissed: a notice that fades on a timer is one you can
   miss, and this one means something you did is not saved. A newer failure
   replaces it rather than stacking. */
export function WriteFailureNotice() {
  const [message, setMessage] = useState<{ text: string; at: number } | null>(
    null,
  )

  useEffect(() => {
    function onRejection(event: PromiseRejectionEvent) {
      const text = failureMessage(event.reason)
      if (text === null) return
      /* Reported here, so not again as an uncaught error in the console. */
      event.preventDefault()
      setMessage({ text, at: Date.now() })
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  if (message === null) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-[18px] md:bottom-6">
      <div
        /* Keyed by time so a second failure replays the arrival: the words
           changed, and that should be seen. */
        key={message.at}
        role="alert"
        className="glass-modal motion-arrive pointer-events-auto flex max-w-[460px] items-start gap-3 rounded-[14px] py-2.5 pr-2.5 pl-4"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="label-caps">Didn&rsquo;t save</span>
          <span className="text-[13px] text-foreground">{message.text}</span>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setMessage(null)}
          className="motion-press grid size-7 shrink-0 place-items-center rounded-[8px] text-ink-500 hover:bg-white/[0.06] hover:text-ink-200"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
