import { useEffect } from 'react'
import { Check, Star } from 'lucide-react'

import type { useStar, Candidate  } from '@/components/finances/useWatch'
import { WATCH_MAX } from '@/lib/watch'

/* ★ on a ticker the app shows (1 Nov, mockup watchlist.html): one press
   puts it on the watchlist, another takes it off. It spins while saving,
   pops when lit, shakes when the list is full; what happened is said in
   a badge beside it for a moment. */

const BADGE =
  'motion-arrive pointer-events-none absolute top-1/2 right-[calc(100%+6px)] z-10 inline-flex -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold tracking-[0.1em] whitespace-nowrap uppercase'

export function WatchStar({
  thing,
  star,
}: {
  thing: Candidate
  star: ReturnType<typeof useStar>
}) {
  const on = star.isOn(thing.symbol)
  const s = star.stateOf(thing.symbol)
  const saving = s.kind === 'saving'
  const said = s.kind === 'added' || s.kind === 'full' || s.kind === 'failed'
  const { settle } = star
  useEffect(() => {
    if (!said) return
    const t = setTimeout(() => settle(thing.symbol), 1800)
    return () => clearTimeout(t)
  }, [said, settle, thing.symbol])
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`watch ${thing.symbol}`}
        aria-pressed={on}
        disabled={!star.ready || saving}
        onClick={() => void star.press(thing)}
        className={`motion-press grid size-[30px] shrink-0 place-items-center rounded-[10px] ring-1 transition-colors ring-inset ${
          on
            ? 'bg-state-warn/14 text-state-warn ring-state-warn/45'
            : 'text-ink-500 ring-lift/15 hover:text-state-warn hover:ring-state-warn/40'
        } ${s.kind === 'full' ? 'text-state-danger ring-state-danger/50' : ''}`}
      >
        <Star
          className={`size-[15px] ${saving ? 'animate-spin' : ''} ${on && !saving ? 'motion-pop' : ''}`}
          fill={on ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      </button>
      {s.kind === 'added' ? (
        <span
          role="status"
          aria-label={`${thing.symbol} · watchlist · ${s.count} / ${WATCH_MAX}`}
          className={`${BADGE} bg-foreground text-background`}
        >
          <Check className="size-3" strokeWidth={2.5} />
          {thing.symbol} · watchlist · {s.count} / {WATCH_MAX}
        </span>
      ) : s.kind === 'full' ? (
        <span
          role="status"
          aria-label={`${WATCH_MAX} / ${WATCH_MAX} full`}
          className={`${BADGE} bg-state-danger text-background`}
        >
          <Star className="size-3" /> {WATCH_MAX} / {WATCH_MAX} · full
        </span>
      ) : s.kind === 'failed' ? (
        <span
          role="status"
          aria-label="not saved"
          className={`${BADGE} bg-state-danger text-background`}
        >
          not saved
        </span>
      ) : null}
    </span>
  )
}
