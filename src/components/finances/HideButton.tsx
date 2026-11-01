import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Ban, ChevronLeft } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Position } from '@/components/finances/PortfolioList'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Owned } from '@/lib/owned'

/* A position page's top left: back to the list, and ⊘ HIDE (1 Nov, his
   "excluded list"). Hidden folds the row under HIDDEN in EVERYTHING
   OWNED; worth, the map and TARGET still count it. */

const PILL =
  'motion-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.14em] uppercase ring-1 ring-inset transition-colors'

export function BackToList() {
  return (
    <Link
      to="/finances"
      search={{ room: 'portfolio' }}
      className="motion-press inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-1.5 font-mono text-[11px] tracking-[0.14em] text-ink-400 uppercase transition-colors hover:bg-lift/[0.07] hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      Portfolio
    </Link>
  )
}

export function HideButton({ owned }: { owned: Owned<Position> }) {
  const hides = useQuery(api.hides.list, {})
  const set = useMutation(api.hides.set)
  const { status, run, settle, busy } = useSave()
  const [failed, setFailed] = useState(false)
  if (hides === undefined) return null
  const ids = [...new Set(owned.at.map((r) => r.instrumentId))]
  const hidden = ids.some((id) => hides.includes(id))

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        data-testid="hide-button"
        aria-pressed={hidden}
        disabled={busy}
        onClick={() => {
          setFailed(false)
          run(() => set({ instrumentIds: ids, hidden: !hidden })).catch(() =>
            setFailed(true),
          )
        }}
        className={`${PILL} ${
          hidden
            ? 'bg-state-warn/14 text-state-warn ring-state-warn/30 hover:bg-state-warn/20'
            : 'text-ink-300 ring-lift/15 hover:text-foreground hover:ring-lav-400/40'
        }`}
      >
        <Ban className="size-3" />
        <SaveLabel status={status} onSettled={settle}>
          {hidden ? 'hidden · show' : 'hide'}
        </SaveLabel>
      </button>
      {failed ? (
        <span className="motion-arrive rounded-full bg-state-danger/14 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-state-danger uppercase">
          not saved
        </span>
      ) : null}
    </span>
  )
}
