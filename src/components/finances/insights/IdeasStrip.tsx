import type { BoardAnswer } from '../../../../convex/insightsBoard'
import { STRIP } from '@/lib/ideasBoard'
import { Spark } from './IdeasLine'
import { RangeChart, changeOf } from './RangeChart'
import { usePop } from './usePop'

/* The market strip (29 Oct): eight markets, the day's change and line.
   His word on the first build: "in hover show tooltip with better chart
   … now its more like decoration". Hovered, focused or tapped, a cell
   opens a card with a real chart — the day against yesterday's close, or
   1M · 6M · 1Y fetched on the press — with both prices, the high and low
   and the first and last day beside it. Fetched, never stored. */

type Cell = NonNullable<BoardAnswer['strip'][number]['cell']>
type Def = (typeof STRIP)[number]

export function price(d: Def, v: number) {
  return d.unit === 'yield'
    ? `${v.toFixed(2)}%`
    : `${d.unit === 'USD' ? '$' : ''}${v.toLocaleString('en-GB', { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`
}
export function IdeasStrip({
  board,
  failed,
}: {
  board: BoardAnswer | null
  failed: boolean
}) {
  const pop = usePop<string>()
  return (
    <div className="idb-strip" data-testid="idb-strip" ref={pop.box}>
      {STRIP.map((s, i) => {
        const c = board?.strip.find((x) => x.id === s.id)?.cell
        if (!c)
          return (
            <div key={s.id} className="mk">
              <span className="n">{s.name}</span>
              <span className="v dim">{board || failed ? '❔' : '…'}</span>
            </div>
          )
        const d = changeOf(s.unit === 'yield', c.base, c.price)
        return (
          <div
            key={s.id}
            className={`mkw ${pop.on === s.id ? 'on' : ''} ${i >= 4 ? 'end' : ''}`}
            onMouseEnter={() => pop.enter(s.id)}
            onMouseLeave={pop.leave}
          >
            <button
              type="button"
              data-testid="idb-mk"
              data-id={s.id}
              aria-expanded={pop.on === s.id}
              className="mk"
              onFocus={() => pop.enter(s.id)}
              onClick={() => pop.press(s.id)}
            >
              <span className="n">{s.name}</span>
              <span className="v">{price(s, c.price)}</span>
              <span className={d.c >= 0 ? 'd up' : 'd dn'}>{d.t}</span>
              <Spark points={c.points} w={100} h={14} />
            </button>
            {pop.on === s.id ? (
              <Card d={s} cell={c} pinned={pop.pinned} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function Card({ d, cell, pinned }: { d: Def; cell: Cell; pinned: boolean }) {
  return (
    <div
      className={`idb-tip wide ${pinned ? 'pinned' : ''}`}
      data-testid="idb-mk-card"
    >
      <RangeChart
        title={`${d.name} · ${d.symbol}`}
        symbol={d.symbol}
        fmt={(v) => price(d, v)}
        yieldPts={d.unit === 'yield'}
        day={{ points: cell.points, base: cell.base }}
      />
    </div>
  )
}
