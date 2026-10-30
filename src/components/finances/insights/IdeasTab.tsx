import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useEffect, useMemo } from 'react'

import { api } from '../../../../convex/_generated/api'
import { ModelPick } from '@/components/ask/ModelPick'
import { ideasFacts, shareOfMine } from '@/lib/ideasFacts'
import { planText } from '@/lib/ideasRead'
import type { AllocRow } from '@/lib/insightsMine'
import type { Fact } from '@/lib/marketRead'
import { ideasSuggested } from '@/lib/ideasSuggest'
import { Ask } from './Ask'
import type { Suggestion } from './Ask'
import { PARTS, PartIcon } from './IdeasParts'
import { Star } from './AskBlocks'
import { offerQuestions, setAskContext, usePrefill } from './askPrefill'
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
  goTo = null,
  onGone,
}: {
  r: ReturnType<typeof useMarketRead>
  held: Array<Held> | null
  alloc: Array<AllocRow> | null
  extra: Array<Fact>
  /** READ's move pressed (29 Oct): this line opens lit. */
  goTo?: string | null
  onGone?: () => void
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
  /* A ✦ pressed here takes over from READ's move. */
  useEffect(() => {
    if (prefill) onGone?.()
  }, [prefill])
  useEffect(() => {
    if (!goTo || !lines) return
    document
      .querySelector(
        `[data-testid=idb-line][data-ticker="${CSS.escape(goTo)}"]`,
      )
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [goTo, lines])
  /* His plan's own questions, not the market's (his "suggestions are
     kinda weak"). */
  const suggested = useMemo(
    (): Array<Suggestion> =>
      ideasSuggested(
        read.shown?.board ?? null,
        board.answer?.movers ?? null,
        new Set((held ?? []).map((h) => h.symbol.toUpperCase())),
        cash?.idle ?? null,
      ).map((x) => ({
        q: x.q,
        kind: x.label,
        c: x.kind === 'mover' ? 'var(--state-warn)' : PARTS[x.kind].c,
        e:
          x.kind === 'mover' ? (
            <svg viewBox="0 0 24 24" aria-hidden className="idb-ico">
              <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
            </svg>
          ) : (
            <PartIcon part={x.kind} />
          ),
      })),
    [read.shown, board.answer, held, cash],
  )
  /* ASK from here knows his money: today's numbers, and what the read was
     given (spending among them), and the plan on the board. */
  useEffect(() => {
    const shown = read.shown
    const live =
      cash && held && board.answer
        ? ideasFacts({
            cash,
            spend: null,
            held,
            tickers: board.answer.tickers,
            strip: board.answer.strip,
            movers: board.answer.movers,
            extra,
          })
        : []
    const had = new Set(live.map((f) => f.key))
    setAskContext({
      facts: [...live, ...(shown?.facts ?? []).filter((f) => !had.has(f.key))],
      plan: planText(shown?.board),
    })
    return () => setAskContext(null)
  }, [cash, held, board.answer, extra, read.shown])
  useEffect(() => {
    offerQuestions(suggested)
    return () => offerQuestions(null)
  }, [suggested])

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
        lit={goTo ?? prefill?.line?.ticker ?? null}
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
