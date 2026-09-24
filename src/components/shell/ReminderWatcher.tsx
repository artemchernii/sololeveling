import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Bell, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { reminderText, remindersToFire } from '@/lib/reminders'

/* R5. Reminders, delivered by whichever tab of the app is open: a system
   notification when the browser allows one, and always a line inside the app
   — because a notification can be blocked, and the app is where you are.

   Every tab runs this. A reminder fires once per occurrence across all of
   them: the key goes into localStorage before anything is shown, and the
   system notification carries it as its tag, which a browser shows once. */

const TICK_MS = 20_000
const STORE = 'sl:reminded'
const DAY = 24 * 60 * 60_000

function remembered(): Array<string> {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Array<string>) : []
  } catch {
    return []
  }
}

function remember(keys: Array<string>) {
  try {
    /* Keys carry their instant; a day-old one can never fire again. */
    const cutoff = Date.now() - DAY
    const kept = keys.filter(
      (k) => Number(k.slice(k.lastIndexOf(':') + 1)) > cutoff,
    )
    localStorage.setItem(STORE, JSON.stringify(kept))
  } catch {
    /* Private window: the in-memory set below still stops repeats here. */
  }
}

export function ReminderWatcher() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(t)
  }, [])

  /* The window moves once a day, not every tick, so the subscription holds. */
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const from = today.getTime()
  const events = useQuery(api.events.listInRange, { from, to: from + 2 * DAY })

  const fired = useRef(new Set<string>())
  const [shown, setShown] = useState<Array<{ key: string; text: string }>>([])

  useEffect(() => {
    if (!events) return
    const due = remindersToFire(events, now)
    if (due.length === 0) return
    const stored = remembered()
    const fresh = due.filter(
      (r) => !fired.current.has(r.key) && !stored.includes(r.key),
    )
    if (fresh.length === 0) return
    for (const r of fresh) fired.current.add(r.key)
    remember([...stored, ...fresh.map((r) => r.key)])

    const lines = fresh.map((r) => ({ key: r.key, text: reminderText(r, now) }))
    setShown((prev) => [...prev, ...lines])
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      for (const line of lines) {
        try {
          new Notification(line.text, { tag: line.key, silent: false })
        } catch {
          /* Some mobile browsers only notify from a service worker. The
             in-app line is still there. */
        }
      }
    }
  }, [events, now])

  if (shown.length === 0) return null

  /* Under the top bar and beside the bell on a desktop — never over Log,
     which is the one control that must always be reachable. */

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(12px+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-[18px] md:top-[64px] md:items-end md:px-6">
      {shown.map((line) => (
        <div
          key={line.key}
          role="alert"
          className="glass-modal motion-arrive pointer-events-auto flex items-center gap-3 rounded-[14px] py-2 pr-2 pl-3.5"
        >
          {/* A reminder is live — the one lavender thing on screen. */}
          <Bell className="motion-pulse size-3.5 text-lav-300" />
          <span className="text-[13px] text-foreground">{line.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setShown((prev) => prev.filter((l) => l.key !== line.key))
            }
            className="motion-press grid size-7 place-items-center rounded-[8px] text-ink-500 hover:bg-lift/[0.06] hover:text-ink-200"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
