import { useState } from 'react'
import { Flame, Sparkles } from 'lucide-react'

import { Badge, Caps, Tile } from '@/components/review/parts'

/* The AI review (15 Oct, mockup real2.html) — the front only; the read
   itself comes with R7. "If week is good it says good this and that … if
   bad => grill me hard and encourage to work harder." One press reads the
   week; GRILL ME asks for the hard voice. The verdict will be the AI's
   words, never a score the app computes. Until it is wired, a press says
   NOT CONNECTED rather than pretend to read. */
export function AiReviewTile({ weekNumber }: { weekNumber: number }) {
  const [grill, setGrill] = useState(false)
  const [pressed, setPressed] = useState(false)
  return (
    <Tile
      name="AI review"
      area="var(--color-lav-400)"
      icon={<Sparkles />}
      index={2}
      span="col-span-2 lg:col-span-2 lg:row-span-2 system-frame"
    >
      <span aria-hidden className="bento-sweep" />
      <div className="my-auto flex flex-col items-center gap-2.5 py-2">
        <span
          className={`review-orb grid size-[54px] place-items-center rounded-full border [&_svg]:size-6 ${grill ? 'border-state-danger text-state-danger review-orb-hot' : 'border-lav-400/35 text-lav-300'}`}
        >
          {grill ? <Flame className="review-flick" /> : <Sparkles />}
        </span>
        {pressed ? (
          <Badge className="motion-pop bg-state-warn/10 text-state-warn">
            NOT CONNECTED
          </Badge>
        ) : (
          <Badge>NOT READ</Badge>
        )}
        <Caps className="text-center">
          WEEK {weekNumber} · FINANCES · PROJECTS · BODY · LANGUAGES
        </Caps>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => setPressed(true)}
          className="motion-press inline-flex items-center justify-center gap-1.5 rounded-full border border-lav-400 bg-lav-400/20 px-3.5 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase transition hover:shadow-[0_0_18px_-4px_var(--system-shine)]"
        >
          <Sparkles className="size-3" /> ANALYZE WEEK
        </button>
        <button
          type="button"
          aria-pressed={grill}
          onClick={() => setGrill(!grill)}
          className={`motion-press inline-flex items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase transition ${grill ? 'border-state-danger bg-state-danger/14 text-state-danger shadow-[0_0_18px_-4px_var(--state-danger)]' : 'border-lift/[0.09] bg-lift/[0.04] text-ink-300'}`}
        >
          <Flame
            className={`size-3 ${grill ? 'review-flick' : 'opacity-60 grayscale'}`}
          />
          GRILL ME
        </button>
      </div>
    </Tile>
  )
}
