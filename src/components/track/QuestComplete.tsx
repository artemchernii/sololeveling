import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Sparks } from '@/components/track/Sparks'
import { areaVars } from '@/lib/areas'
import { announceQuest, onQuest, reachedTarget } from '@/lib/quest'
import type { Quest } from '@/lib/quest'

/* [ QUEST COMPLETE ] (26 Sep). The System window from the anime, popping
   when a weekly target is reached — "this lavender color and if it's going
   to pulse = NICE". Once, on the write that gets there (lib/quest.ts), not
   on every log: every log already lands with its own motion, and a notice
   seen three times a day is wallpaper.

   Held long enough to read, then it folds away; a tap or Esc closes it
   sooner. It does not block the page — it is news, not a question. */

const HOLD_MS = 4200

/** Announce a quest when this count crosses its target. */
export function useQuestOnReach(
  count: number | undefined,
  target: number | undefined,
  quest: () => Quest,
) {
  const before = useRef(count)
  useEffect(() => {
    if (reachedTarget(before.current, count, target)) announceQuest(quest())
    before.current = count
    /* Only a new count is news; a new closure for the same count is not,
       so `quest` is left out on purpose. */
  }, [count, target])
}

export function QuestHost() {
  const [shown, setShown] = useState<{ quest: Quest; n: number } | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(
    () =>
      onQuest((quest) => {
        setLeaving(false)
        setShown((prev) => ({ quest, n: (prev?.n ?? 0) + 1 }))
      }),
    [],
  )

  useEffect(() => {
    if (shown === null) return
    const fold = setTimeout(() => setLeaving(true), HOLD_MS)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLeaving(true)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(fold)
      window.removeEventListener('keydown', onKey)
    }
  }, [shown])

  if (shown === null || typeof document === 'undefined') return null
  const { quest, n } = shown

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[18vh] z-50 flex justify-center px-4"
    >
      <button
        key={n}
        type="button"
        onClick={() => setLeaving(true)}
        onAnimationEnd={(e) => {
          if (leaving && e.animationName === 'system-close') setShown(null)
        }}
        style={areaVars(quest.area)}
        className={`system-frame pointer-events-auto relative flex w-full max-w-[420px] bg-background/90 flex-col items-center gap-3 px-7 pt-6 pb-7 text-center ${
          leaving ? 'system-close' : 'system-open'
        }`}
      >
        <span className="system-pulse absolute inset-0 rounded-[inherit] ring-1 ring-lav-400/40" />
        <span className="system-title system-pulse text-[13px]">
          [ quest complete ]
        </span>
        <span className="relative grid size-14 place-items-center rounded-full bg-(--area)/15 text-area ring-1 ring-(--area)/40 [&>svg]:size-6">
          {quest.icon}
          <Sparks key={n} count={18} reach={70} />
        </span>
        <span className="text-[22px] leading-tight font-light text-foreground">
          {quest.title}
        </span>
        <span className="font-mono text-[11px] tracking-[0.2em] text-ink-300 uppercase">
          {quest.line}
        </span>
      </button>
    </div>,
    document.body,
  )
}
