import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Sparkles, X } from 'lucide-react'
import type { CSSProperties } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'

/** How long one line holds before the column moves up by one. */
const HOLD_MS = 7000

/* Six hues for six lines, borrowed from the area palette in tokens.css
   because those are the colours this app owns — and borrowed as a palette
   only: a principle is not an area, and the colour says nothing except
   "this is a different one from the last". They are spread around the wheel
   so consecutive lines never look alike, and the light theme redefines each
   token, so both themes are handled without a second list (§3d.3). */
const HUES = [
  '--area-social',
  '--area-business',
  '--area-body',
  '--area-portuguese',
  '--area-knowledge',
  '--area-style',
] as const

function hue(i: number): CSSProperties {
  return { '--hue': `var(${HUES[i % HUES.length]})` } as CSSProperties
}

/* The six lines from the source brief §16, beside the greeting (PLAN.md §3
   item 1). Read-only, like the page they replaced (§3b.5): seeded once,
   never edited from a screen.

   Text on the ground, not a card, and it loops: the six are stacked in a
   window one line tall and the column slides up by one, a ticker rather
   than a swap.

   **No line is "today's".** It was picked by the date until 16 Sep, and
   marked as such in the panel, which read as the app telling you which one
   to live by — "it's not a prophecy" (Artem). They are six lines that are
   all true at once; the loop shows each of them in turn and none of them is
   chosen for you.

   **The loop is the written exception to §3d.1** ("the app moving on its own
   does not animate"), recorded there with its reason: that rule exists to
   stop data moving under you, and a principle is the one thing on Today
   that is not data. It holds while you are reading it and stops entirely
   under prefers-reduced-motion. */
export function Principles() {
  const principles = useQuery(api.principles.list, {})
  const [open, setOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  /* How far down the column has travelled: `count` is the repeat of the
     first line at the bottom, which the loop resets through. */
  const [step, setStep] = useState(0)

  const count = principles?.length ?? 0
  const index = count > 0 ? step % count : 0

  /* The panel is open, or you are reading it: whatever is showing stays. */
  const held = paused || open

  useEffect(() => {
    if (count < 2 || held || reducedMotion()) return
    const id = setInterval(() => setStep((s) => s + 1), HOLD_MS)
    return () => clearInterval(id)
  }, [count, held])

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
      className="flex h-full flex-col justify-center gap-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span style={hue(index)} className="label-caps text-(--hue)">
          Principle {String(index + 1).padStart(2, '0')}
          <span className="text-ink-700">
            {' '}
            / {String(principles.length).padStart(2, '0')}
          </span>
        </span>

        {/* The way to all six, shaped like the app's other call to action
            (the Log pill) rather than another quiet label nobody presses. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="motion-press chip-focus ml-auto flex items-center gap-1.5 rounded-full bg-lav-500 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-lav-900 uppercase transition-[filter] hover:brightness-110"
        >
          <Sparkles className="size-3.5" strokeWidth={2.4} />
          Read all six
        </button>
      </div>

      <Loop
        lines={principles}
        step={step}
        onLooped={() => setStep(0)}
        label={principles[index].text}
      />

      {open ? (
        <AllSix principles={principles} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  )
}

/* The loop. Every line is stacked in a column inside a window one line tall,
   and the column is moved up by whole lines — so what you see is the text
   itself travelling, not one line replacing another.

   The first line is repeated under the last. When the column reaches that
   repeat it is put back to the top with transitions off, which is the same
   picture, so the loop never rewinds through the middle. */
function Loop({
  lines,
  step,
  onLooped,
  label,
}: {
  lines: Array<Doc<'principles'>>
  step: number
  onLooped: () => void
  label: string
}) {
  const [animate, setAnimate] = useState(true)

  /* Reaching the repeat is the end of a lap: hold the picture, drop the
     transition, and put the column back to the top before the next tick. */
  useEffect(() => {
    if (step < lines.length) return
    const settle = setTimeout(() => {
      setAnimate(false)
      onLooped()
    }, 260)
    return () => clearTimeout(settle)
  }, [step, lines.length, onLooped])

  /* Transitions come back on the frame after the reset, so the move that
     put the column back is never itself animated. */
  useEffect(() => {
    if (animate) return
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [animate])

  return (
    <p
      /* The line for a screen reader; the column below it is scenery. */
      aria-label={label}
      className="loop-window h-[3.4rem] text-[22px] leading-snug font-light sm:h-[4.4rem] sm:text-[26px]"
    >
      <span
        aria-hidden
        /* Per cent of the column, not of a line: the column is every line
           plus the repeat, so one step is one seventh of it. Translating by
           100% here moved the text a whole column out of the window. */
        style={{
          transform: `translateY(-${(step * 100) / (lines.length + 1)}%)`,
        }}
        className={`block ${animate ? 'transition-transform duration-(--motion-base) ease-(--motion-ease)' : ''}`}
      >
        {[...lines, lines[0]].map((principle, i) => (
          <span
            key={`${principle._id}-${i}`}
            style={hue(i)}
            /* Each item is exactly the window's height, so one step is one
               line however long the text is. */
            className="flex h-[3.4rem] items-center text-(--hue) sm:h-[4.4rem]"
          >
            {principle.text}
          </span>
        ))}
      </span>
    </p>
  )
}

/** Honours the OS switch: nothing loops for someone who asked for less. */
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
  onClose,
}: {
  principles: Array<Doc<'principles'>>
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
              style={{ ...hue(i), animationDelay: `${i * 60}ms` }}
              className="motion-arrive flex items-baseline gap-4"
            >
              <span className="font-mono text-[11px] text-(--hue)">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-[22px] leading-snug font-light text-(--hue) sm:text-[26px]">
                {principle.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
