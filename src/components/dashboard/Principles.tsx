import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Sparkles, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { principleIndex } from '@/lib/principle-of-day'

/* The six lines from the source brief §16, under the greeting (PLAN.md §3
   item 1). Read-only, like the page they replaced (§3b.5): they are seeded
   once and never edited from a screen.

   One of them is today's, chosen by the date — the same line all day, a
   different one tomorrow. The other five stay on screen under it, small and
   quiet: all six were nearly never read as a page of their own, and a single
   line was too easy to stop seeing (16 Sep, Artem).

   The fade is an arrival, once, in a short stagger — not a rotation. A line
   that changed while you watched would be the app moving on its own (§3d.1),
   and a principle that changes when you refresh is decoration. */
export function Principles({ date }: { date: Date }) {
  const principles = useQuery(api.principles.list, {})
  const [open, setOpen] = useState(false)

  /* Renders nothing while loading or when nothing is seeded — a missing line
     is not worth a skeleton, and a fresh deployment says nothing rather than
     "no principles yet" on the morning screen. */
  if (!principles || principles.length === 0) return null

  const todays = principleIndex(date, principles.length)
  const rest = principles.filter((_, i) => i !== todays)

  return (
    <div className="flex flex-col gap-2.5 border-l-2 border-lift/10 pl-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-caps">Principles</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="label-caps motion-press flex items-center gap-1.5 text-ink-500 transition-colors hover:text-lav-300"
        >
          <Sparkles className="size-3.5" />
          All six
        </button>
      </div>

      <p className="motion-fade text-[26px] leading-snug font-light text-foreground">
        {principles[todays].text}
      </p>

      <div className="flex flex-col gap-1">
        {rest.map((principle, i) => (
          <p
            key={principle._id}
            /* Each one 40ms after the last, so the set arrives as a set
               rather than all at once. The delay is inline because it is per
               row; the animation itself is the app's one fade. */
            style={{ animationDelay: `${(i + 1) * 40}ms` }}
            className="motion-fade flex items-baseline gap-2.5 text-[12.5px] text-ink-500"
          >
            <span className="font-mono text-[10px] text-ink-700">
              {number(principles, principle)}
            </span>
            {principle.text}
          </p>
        ))}
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
            className="motion-press grid size-7 shrink-0 place-items-center rounded-full text-ink-500 transition-colors hover:bg-lift/10 hover:text-foreground"
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

/** Its place in the seeded order — the number the line is known by. */
function number(
  principles: Array<Doc<'principles'>>,
  principle: Doc<'principles'>,
): string {
  return String(principles.indexOf(principle) + 1).padStart(2, '0')
}
