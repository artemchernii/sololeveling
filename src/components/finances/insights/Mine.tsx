import { useLayoutEffect, useRef, useState } from 'react'

import { Allocation } from './Allocation'
import { Info, clock, heatColour, signed } from './parts'
import type { MineAnswer, useMine } from './useMine'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { TickerLogo } from '@/components/finances/Logo'
import { money } from '@/lib/currency'
import { heatCap, heatMix } from '@/lib/insightsMarket'
import type { Period } from '@/lib/insightsMarket'
import { treemap } from '@/lib/insightsMine'
import type { AllocRow } from '@/lib/insightsMine'
import type { Call } from '@/lib/indicators'
import { UNPRICED } from '@/lib/market'
import type { Owned } from '@/lib/owned'

/* Band 3 MINE (19 Oct, spec I2; mockup insights.html "3 MINE"). Every
   Portfolio position as a box — as wide as its euros, coloured by its
   move over the period (fetched on open, never saved), its Portfolio
   verdict in the corner — and ADD / HOLD / WAIT said underneath; beside
   it, ALLOCATION. */

type Held = Owned

const TAG: Record<Call, string> = {
  add: '✚ ADD',
  hold: '❚❚ HOLD',
  wait: '⧗ WAIT',
}
const LEGEND: Array<[Call, string, string]> = [
  ['add', 'var(--state-good)', 'Signals say a good time to buy more'],
  ['hold', 'var(--color-lav-400)', 'Nothing to do'],
  ['wait', 'var(--state-warn)', 'Ran up fast — not now'],
]
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** What the band's action is asked about, one per position. */
export const itemOf = (o: Held) => ({
  instrumentId: o.instrumentId as Id<'instruments'>,
  symbol: o.symbol,
  type: o.type,
  name: o.name,
})

export function Mine({
  held,
  period,
  mine,
  rows,
  read,
}: {
  held: ReadonlyArray<Held>
  period: Period
  mine: ReturnType<typeof useMine>
  rows: Array<AllocRow> | null
  read: Doc<'marketReads'> | null
}) {
  const total = held.reduce((t, o) => t + (o.valueEur ?? 0), 0)

  return (
    <>
      <div className="ins-band">
        <span className="n">3</span>
        <b>MINE</b>
        <span className="label-caps" data-testid="mine-band">
          {money(Math.round(total), 'EUR')} · {held.length}{' '}
          {held.length === 1 ? 'POSITION' : 'POSITIONS'}
        </span>
      </div>
      {held.length === 0 ? (
        <section data-testid="mine-empty" className="ins-tile ins-empty">
          <span className="ins-emo">💼</span>
          <span className="ins-badge dim">0 POSITIONS</span>
        </section>
      ) : (
        <div className="ins-grid">
          <Positions held={held} period={period} mine={mine} />
          <Allocation
            held={held}
            rows={rows}
            base={mine.base}
            read={read}
            failed={mine.failed}
          />
        </div>
      )}
    </>
  )
}

function Positions({
  held,
  period,
  mine,
}: {
  held: ReadonlyArray<Held>
  period: Period
  mine: ReturnType<typeof useMine>
}) {
  const changes = new Map(
    mine.shown?.changes.map((c) => [c.symbol, c.change]) ?? [],
  )
  const calls = new Map(
    (mine.base?.calls ?? []).map((c) => [c.instrumentId as string, c.call]),
  )
  const callOf = (o: Held) => calls.get(o.instrumentId) ?? null
  const count = (c: Call) => held.filter((o) => callOf(o) === c).length
  /* Laid out in the box's own shape, so a square stays square. */
  const heat = useRef<HTMLDivElement>(null)
  const [aspect, setAspect] = useState(1.6)
  useLayoutEffect(() => {
    const el = heat.current
    if (!el) return
    const seen = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setAspect(width / height)
    })
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  const boxes = treemap(
    held.map((o) => ({ o, eur: o.valueEur })),
    aspect,
  )
  const cap = heatCap(period)
  const now = held.flatMap((o) => {
    const ch = changes.get(o.symbol)
    return ch == null ? [] : [`${o.symbol.split('.')[0]} ${signed(ch)}`]
  })

  return (
    <section
      data-testid="mine-positions"
      className="ins-tile c7"
      style={{ '--i': 9, '--a': 'var(--metal-xau)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">💼</span>
        <span className="ins-tname">POSITIONS · {period}</span>
        <Info
          info={{
            title: 'POSITIONS',
            what: 'Every position as a box: the bigger the box, the more euros; green rose in the period, red fell. The corner tag is the Portfolio verdict for that position.',
            why: 'ADD — the signals say a good moment to buy more. HOLD — nothing to do. WAIT — it ran up fast or the trend is down, better not now.',
            now: [
              `ADD ${count('add')} · HOLD ${count('hold')} · WAIT ${count('wait')}`,
              ...now.slice(0, 3),
            ],
          }}
        />
        <span className="flex-1" />
        <span className="ins-was">BOX = EUROS</span>
      </div>
      <div
        ref={heat}
        className={`ins-heat ${mine.reading && mine.shown ? 'ins-reading' : ''}`}
      >
        {boxes.map((b, i) => (
          <div
            key={b.o.instrumentId}
            className="ins-cell"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
            }}
          >
            <Box
              o={b.o}
              big={b.w * b.h >= 1200}
              delay={i * 25}
              change={changes.get(b.o.symbol) ?? null}
              call={callOf(b.o)}
              period={period}
              reading={mine.reading}
            />
          </div>
        ))}
      </div>
      <div className="ins-vleg">
        {LEGEND.map(([c, colour, words]) => (
          <div
            key={c}
            data-testid="verdict-card"
            data-call={c}
            style={{ '--c': colour } as React.CSSProperties}
          >
            <b>
              {TAG[c]} · {count(c)}
            </b>
            <span>{words}</span>
          </div>
        ))}
      </div>
      <div className="ins-foot">
        <div className="ins-scale">
          <span className="ins-was">−{cap}%</span>
          <i />
          <span className="ins-was">+{cap}%</span>
        </div>
        <span className="ins-was" data-testid="mine-foot">
          {foot(mine.base, mine.shown, mine.failed)}
        </span>
      </div>
    </section>
  )
}

function foot(
  base: MineAnswer | null,
  shown: MineAnswer | null,
  failed: boolean,
) {
  if (failed) return 'YAHOO · NOT REACHED'
  const verdict = base
    ? `VERDICT · PORTFOLIO'S OWN RULES · ${DAY.format(base.fetchedAt).toUpperCase()}`
    : 'VERDICT · READING'
  return shown
    ? `${verdict} · YAHOO · FETCHED ${clock(shown.fetchedAt)} · NOT SAVED`
    : verdict
}

function Box({
  o,
  big,
  delay,
  change,
  call,
  period,
  reading,
}: {
  o: Held
  big: boolean
  delay: number
  change: number | null
  call: Call | null
  period: Period
  reading: boolean
}) {
  const frozen = o.type === UNPRICED
  return (
    <div
      data-testid="mine-box"
      data-symbol={o.symbol}
      data-call={call ?? ''}
      className={`ins-hc ${big ? 'big' : ''} ${frozen ? 'frozen' : ''}`}
      style={{
        background: frozen
          ? undefined
          : heatColour(change, change === null ? 0 : heatMix(change, period)),
        animationDelay: `${delay}ms`,
      }}
    >
      {call ? <span className={`vd ${call}`}>{TAG[call]}</span> : null}
      <div className="top">
        <TickerLogo
          symbol={o.symbol}
          type={o.type}
          name={o.name}
          size={big ? 22 : 16}
        />
        <span className="n">{o.symbol.split('.')[0]}</span>
      </div>
      <div>
        <div className="v">
          {frozen
            ? 'FROZEN'
            : change !== null
              ? signed(change)
              : reading
                ? '…'
                : '—'}
        </div>
        {o.valueEur !== null ? (
          <div className="e">{money(Math.round(o.valueEur), 'EUR')}</div>
        ) : null}
      </div>
    </div>
  )
}
