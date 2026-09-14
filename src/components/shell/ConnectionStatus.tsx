import { useConvexConnectionState } from 'convex/react'

/* When the phone loses signal, Convex keeps every write and sends it on
   reconnect — nothing is lost. But nothing on screen said so, and a log that
   seemed to go nowhere is exactly the moment you log it twice.

   Shown only once the app has connected at least once: before that, "not
   connected" is just loading. It arrives late (offline-appear) so the brief
   drop when a token refreshes or a laptop wakes never flashes it.

   No count of waiting writes. "Saves waiting" is the fact that matters; a
   number here would be one more figure on screen with no sanctioned source. */
export function ConnectionStatus() {
  const state = useConvexConnectionState()

  if (!state.hasEverConnected || state.isWebSocketConnected) return null

  return (
    <span
      role="status"
      className="offline-appear flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-ink-300"
    >
      {/* Hollow: a thing that is absent, not an alert. */}
      <span className="size-[7px] rounded-full border border-ink-400" />
      {state.hasInflightRequests ? 'Offline · saves waiting' : 'Offline'}
    </span>
  )
}
