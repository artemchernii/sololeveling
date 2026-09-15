import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Sparkles, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { principleIndex } from '@/lib/principle-of-day'

/** How long one line holds before the next rolls in. */
const HOLD_MS = 7000

/** Between one character and the next, along the roll. */
const STAGGER_MS = 18

/* The six lines from the source brief §16, beside the greeting (PLAN.md §3
   item 1). Read-only, like the page they replaced (§3b.5): seeded once,
   never edited from a screen.

   Text on the ground, not a card: this is the third shape. A single static
   line stopped being read within a day; all six as a list read as a wall;
   the same thing in a glass card was one more box on a screen made of boxes
   (Artem, 16 Sep). What is left is the line itself, rolling over.

   **The rotation is the written exception to §3d.1** ("the app moving on its
   own does not animate"), recorded there with its reason: that rule exists
   to stop data moving under you, and a principle is the one thing on Today
   that is not data. It holds while you are reading it, stops entirely under
   prefers-reduced-motion, starts on the line the date chose, and every line
   is reachable by hand from "all six". */
export function Principles({ date }: { date: Date }) {
  const principles = useQuery(api.principles.list, {})
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)

  const count = principles?.length ?? 0
  const todays = count > 0 ? principleIndex(date, count) : 0
  const index = shown ?? todays

  /* The panel is open, or you are reading it: whatever is showing stays. */
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

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="flex h-full flex-col justify-center gap-2"
    >
      <div className="flex items-baseline gap-3">
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
          className="label-caps motion-press chip-focus flex items-center gap-1.5 text-ink-600 transition-colors hover:text-lav-300"
        >
          <Sparkles className="size-3.5" />
          All six
        </button>
      </div>

      <Roll
        text={principles[index].text}
        /* Room for the longest line at this width, so a short line and a long
           one do not move the page as they take turns. Smaller on a phone,
           where the greeting and LEVEL are already above it. */
        className="min-h-[3.4rem] text-[22px] leading-snug font-light text-foreground sm:min-h-[4.4rem] sm:text-[26px]"
      />

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

/* One line rolling into the place of the last: the outgoing characters leave
   upward while the incoming ones arrive from below, each a beat after the
   one before it. Both are in the DOM together for the length of the roll,
   stacked, so nothing below moves while it happens. */
function Roll({ text, className }: { text: string; className: string }) {
  const [current, setCurrent] = useState(text)
  const [leaving, setLeaving] = useState<string | null>(null)

  useEffect(() => {
    if (text === current) return
    setLeaving(current)
    setCurrent(text)
    /* Long enough for the last character of the longest line to finish;
       it only clears a span that is already invisible. */
    const done = setTimeout(() => setLeaving(null), 1400)
    return () => clearTimeout(done)
  }, [text, current])

  return (
    <p
      /* The whole line for a screen reader; the characters are scenery. */
      aria-label={current}
      className={`relative flex items-center ${className}`}
    >
      {leaving === null ? null : (
        <span aria-hidden className="absolute inset-0 flex items-center">
          <Characters key={`out-${leaving}`} text={leaving} leaving />
        </span>
      )}
      <span aria-hidden>
        <Characters key={`in-${current}`} text={current} />
      </span>
    </p>
  )
}

function Characters({ text, leaving }: { text: string; leaving?: boolean }) {
  let nth = 0
  return (
    <>
      {text.split(' ').map((word, w) => (
        /* Split by word first so a line still wraps between words, then by
           character so the roll runs along the line rather than arriving in
           blocks. */
        <span key={`${word}-${w}`} className="inline-block whitespace-nowrap">
          {[...word].map((character, c) => (
            <span
              key={c}
              style={{ animationDelay: `${nth++ * STAGGER_MS}ms` }}
              className={`inline-block ${leaving ? 'motion-roll-out' : 'motion-roll-in'}`}
            >
              {character}
            </span>
          ))}
          {w < text.split(' ').length - 1 ? ' ' : null}
        </span>
      ))}
    </>
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
