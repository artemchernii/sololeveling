import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Sparkles, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { principleIndex } from '@/lib/principle-of-day'

/** How long one line holds before the next cross-fades in. */
const HOLD_MS = 7000

/* The six lines from the source brief §16, beside the greeting (PLAN.md §3
   item 1). Read-only, like the page they replaced (§3b.5): seeded once,
   never edited from a screen.

   One at a time, starting with today's — the date decides which line you see
   when the screen opens, and that much is unchanged. The card then moves
   through the rest.

   **This rotation is the written exception to §3d.1** ("a state change you
   caused animates; the app moving on its own does not"), taken by Artem on
   16 Sep after two earlier shapes failed: one static line was stopped being
   read within a day, and all six as a list read as a wall and pushed the
   day's cards below the fold. The principles are the one thing on this
   screen that is not data, and the rule exists to stop numbers moving under
   you — no number moves here. It pauses while you are reading it (hover or
   focus), stops entirely under prefers-reduced-motion, and every line is
   reachable by hand from the dots or from "all six". */
export function Principles({ date }: { date: Date }) {
  const principles = useQuery(api.principles.list, {})
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)

  const todays =
    principles && principles.length > 0
      ? principleIndex(date, principles.length)
      : 0
  const index = shown ?? todays
  const count = principles?.length ?? 0

  /* The panel is open, or the pointer is on the card: whatever you are
     reading stays put. */
  const held = paused || open

  useEffect(() => {
    if (count < 2 || held || reducedMotion()) return
    const id = setInterval(
      () => setShown((current) => ((current ?? todays) + 1) % count),
      HOLD_MS,
    )
    return () => clearInterval(id)
  }, [count, held, todays])

  /* Renders nothing while loading or when nothing is seeded — a missing line
     is not worth a skeleton, and a fresh deployment says nothing rather than
     "no principles yet" on the morning screen. */
  if (!principles || principles.length === 0) return null

  const principle = principles[index]

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="glass flex h-full flex-col gap-3 rounded-[22px] p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-caps">
          Principle {String(index + 1).padStart(2, '0')}
          <span className="text-ink-700">
            {' '}
            / {String(principles.length).padStart(2, '0')}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="label-caps motion-press chip-focus flex items-center gap-1.5 text-ink-500 transition-colors hover:text-lav-300"
        >
          <Sparkles className="size-3.5" />
          All six
        </button>
      </div>

      {/* Two lines' worth of room, so a short line and a long one do not
          move the cards below as they take turns. */}
      <p className="flex min-h-[4.2rem] items-center text-[24px] leading-snug font-light text-foreground">
        {/* Keyed by line, so each one fades in as it arrives. */}
        <span key={principle._id} className="motion-fade">
          {principle.text}
        </span>
      </p>

      <div className="mt-auto flex items-center gap-1.5">
        {principles.map((p, i) => (
          <button
            key={p._id}
            type="button"
            aria-label={p.text}
            aria-current={i === index}
            onClick={() => setShown(i)}
            className="chip-focus group grid h-4 place-items-center px-0.5"
          >
            <span
              className={`h-1 rounded-full transition-all duration-(--motion-base) ease-(--motion-ease) ${
                i === index
                  ? 'w-5 bg-lav-400'
                  : 'w-1 bg-lift/25 group-hover:bg-lift/50'
              }`}
            />
          </button>
        ))}
        {/* Today's line is the one the date chose; the dots say which that
            is once the card has moved on. */}
        {index !== todays ? (
          <button
            type="button"
            onClick={() => setShown(todays)}
            className="label-caps motion-press chip-focus ml-2 text-ink-600 transition-colors hover:text-ink-300"
          >
            Today&rsquo;s
          </button>
        ) : (
          <span className="label-caps ml-2 text-ink-700">Today&rsquo;s</span>
        )}
      </div>

      {open ? (
        <AllSix
          principles={principles}
          todays={todays}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}

/** Honours the OS switch: nothing rotates for someone who asked for less. */
function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/* The six at full size, which is the one thing the deleted Principles page
   was meant to be: somewhere you go on purpose. You opened it, so it may
   move (§3d.1) — each line arrives after the one above it. */
function AllSix({
  principles,
  todays,
  onClose,
}: {
  principles: Array<Doc<'principles'>>
  todays: number
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /* Into the body, not where it is written: the greeting block sits inside
     the page's own stacking contexts, and a fixed panel left there renders
     under the Log pill and the bottom nav. */
  return createPortal(
    <div
      className="glass-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal
        aria-label="The six principles"
        /* The scrim closes; the panel does not close itself from under a
           click meant for the text inside it. */
        onClick={(e) => e.stopPropagation()}
        className="glass-modal motion-arrive max-h-[85vh] w-[min(620px,92vw)] overflow-y-auto rounded-[22px] p-8"
      >
        <div className="mb-6 flex items-baseline justify-between gap-3">
          <span className="label-caps">Six lines. They do not change.</span>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close"
            className="motion-press chip-focus grid size-7 shrink-0 place-items-center rounded-full text-ink-500 transition-colors hover:bg-lift/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {principles.map((principle, i) => (
            <div
              key={principle._id}
              style={{ animationDelay: `${i * 60}ms` }}
              className="motion-arrive flex items-baseline gap-4"
            >
              <span
                className={`font-mono text-[11px] ${i === todays ? 'text-lav-300' : 'text-ink-700'}`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <p
                className={`text-[22px] leading-snug font-light sm:text-[26px] ${i === todays ? 'text-foreground' : 'text-ink-300'}`}
              >
                {principle.text}
              </p>
              {/* Lavender is for the live thing, and today's is the live one. */}
              {i === todays ? (
                <span className="label-caps ml-auto shrink-0 text-lav-400">
                  Today
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
