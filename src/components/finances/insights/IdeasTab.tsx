import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMemo } from 'react'

import { api } from '../../../../convex/_generated/api'
import { ModelPick } from '@/components/ask/ModelPick'
import { shareOfMine } from '@/lib/ideasFacts'
import type { AllocRow } from '@/lib/insightsMine'
import type { Fact } from '@/lib/marketRead'
import { Ask } from './Ask'
import { Star } from './AskBlocks'
import { usePrefill } from './askPrefill'
import { IdeasBoard } from './IdeasBoard'
import { useAsk } from './useAsk'
import { useBoard, useCash, useIdeasRead } from './useIdeas'
import type { useMarketRead } from './useMarketRead'

/* Tab 4, IDEAS (29 Oct, mockup ideas-board.html): the board, and ASK
   docked beside it on a wide screen — the same thread as the drawer,
   which a phone opens from its ✦ ASK button instead. A line's ✦ lights
   the line and puts it in the box with its question. */

type Held = { symbol: string; name: string; valueEur: number | null }

export function IdeasTab({
  r,
  held,
  alloc,
  extra,
}: {
  r: ReturnType<typeof useMarketRead>
  held: Array<Held> | null
  alloc: Array<AllocRow> | null
  extra: Array<Fact>
}) {
  const cash = useCash()
  const latest = useQuery(api.ideasReads.latest, {})
  const lines = latest?.shown?.board?.lines
  const symbols = useMemo(
    () => [
      ...(held ?? []).map((h) => h.symbol),
      ...(lines ?? []).map((l) => l.ticker),
    ],
    [held, lines],
  )
  const board = useBoard(symbols, held !== null)
  const read = useIdeasRead({ cash, held, board: board.answer, extra })
  const owned = useMemo(() => {
    if (!held) return null
    const share = shareOfMine(held)
    return held.map((h) => ({
      ...h,
      pct: share.get(h.symbol.toUpperCase()) ?? null,
    }))
  }, [held])
  const a = useAsk(r)
  const prefill = usePrefill()

  return (
    <div className="idb-page">
      <IdeasBoard
        cash={cash}
        owned={owned}
        alloc={alloc}
        board={board.answer}
        boardFailed={board.failed}
        read={read.shown}
        status={read.status}
        error={read.error}
        canPress={read.canPress}
        onPress={() => void read.press()}
        lit={prefill?.line?.ticker ?? null}
      />
      <aside data-testid="idb-chat" className="idb-chat" aria-label="Ask">
        <div className="ask-dh">
          <span className={`ask-orb ${a.busy ? 'busy' : ''}`}>
            <Star />
          </span>
          <span className="system-title whitespace-nowrap">[ ASK ]</span>
          <span className="grow" />
          {r.path === 'pro' ? <ModelPick /> : null}
        </div>
        <Ask r={r} a={a} />
      </aside>
    </div>
  )
}
