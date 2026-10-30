import { TickerLogo } from '@/components/finances/Logo'
import { ideaOf } from '@/lib/readMine'
import type { Board, BoardLine } from '@/lib/ideasRead'
import type { Doc } from '../../../../convex/_generated/dataModel'
import { PARTS } from './IdeasParts'
import type { Cash } from './ReadLines'

/* READ's right column (29 Oct, mockup read-personal.html): THIS WEEK —
   the moves the read's lines point at, each an IDEAS line with its € as
   the board has it, their total against the cash, and the way into the
   whole plan. One quiet line on where the numbers come from. */

const eur = (n: number) => `€${Math.round(n).toLocaleString('en-GB')}`
const PART_WORD: Record<BoardLine['part'], string> = {
  protect: 'PROTECT',
  add: 'ADD TO MINE',
  new: 'NEW',
}

export function ReadWeek({
  shown,
  board,
  cash,
  onIdea,
}: {
  shown: Doc<'marketReads'> | null
  board: Board | null
  cash: Cash | null
  onIdea: (ticker: string | null) => void
}) {
  const moves: Array<BoardLine> = []
  for (const l of shown?.read?.lines ?? []) {
    const m = ideaOf(l.idea, board?.lines ?? null)
    if (m && !moves.includes(m)) moves.push(m)
  }
  const total = moves.reduce((t, m) => t + m.eur, 0)
  const at = shown?.readAt ?? shown?._creationTime
  return (
    <aside className="rm-side">
      <section data-testid="read-week" className="ins-tile rm-week">
        <div className="rm-wh">
          <h2>THIS WEEK</h2>
          <span className="grow" />
          {moves.length > 0 ? (
            <span className="ins-badge lav">
              {moves.length} {moves.length === 1 ? 'ACTION' : 'ACTIONS'}
            </span>
          ) : null}
        </div>
        {moves.length > 0 ? (
          <>
            <div className="rm-big" data-testid="read-week-total">
              {eur(total)}
            </div>
            <div className="rm-of">
              {cash ? `OF ${eur(cash.idle)} CASH` : ''}
            </div>
            {cash && cash.idle > 0 ? (
              <div className="rm-bar" aria-hidden>
                {moves.map((m) => (
                  <i
                    key={m.ticker}
                    style={{ flex: m.eur, background: PARTS[m.part].c }}
                  />
                ))}
                <i style={{ flex: Math.max(cash.idle - total, 0) }} />
              </div>
            ) : null}
            <div className="rm-wl">
              {moves.map((m) => (
                <button
                  key={m.ticker}
                  type="button"
                  data-testid="read-week-move"
                  className="rm-wr"
                  onClick={() => onIdea(m.ticker)}
                >
                  <TickerLogo symbol={m.ticker} name={m.name} size={28} />
                  <span className="min-w-0 text-left">
                    <span className="nm">{m.name}</span>
                    <span className="p">
                      {m.ticker} · IDEAS · {PART_WORD[m.part]}
                    </span>
                  </span>
                  <span className="e">{eur(m.eur)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="rm-quiet" data-testid="read-week-none">
            <span className="mk" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <b>{board ? 'NO ACTION' : 'NO PLAN YET'}</b>
          </div>
        )}
        <button
          type="button"
          data-testid="read-week-ideas"
          className="rm-open"
          onClick={() => onIdea(null)}
        >
          {board ? 'OPEN THE PLAN IN IDEAS' : 'OPEN IDEAS'}
        </button>
      </section>
      <p className="rm-from">
        FROM EUROSTAT · BLS · FED · ECB · YAHOO FINANCE
        {at
          ? ` · READ ${new Date(at)
              .toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
              .toUpperCase()}`
          : ''}
      </p>
    </aside>
  )
}
