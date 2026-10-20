import { Allocation } from './Allocation'
import { Info, clock, heatColour, signed } from './parts'
import { useMine } from './useMine'
import type { MineAnswer } from './useMine'
import type { Id } from '../../../../convex/_generated/dataModel'
import { TickerLogo } from '@/components/finances/Logo'
import type { Tags } from '@/components/finances/PortfolioMap'
import { money } from '@/lib/currency'
import { heatCap, heatMix } from '@/lib/insightsMarket'
import type { Period } from '@/lib/insightsMarket'
import { heatRows } from '@/lib/insightsMine'
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

export function Mine({
  held,
  tags,
  period,
}: {
  held: ReadonlyArray<Held>
  /** Portfolio's sector and region tags, by instrument. */
  tags: Tags
  period: Period
}) {
  const items = held.map((o) => ({
    instrumentId: o.instrumentId as Id<'instruments'>,
    symbol: o.symbol,
    type: o.type,
    name: o.name,
  }))
  const mine = useMine(period, items)
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
            tags={tags}
            base={mine.base}
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
  const rows = heatRows(held.map((o) => ({ o, eur: o.valueEur })))
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
        className={`ins-heat ${mine.reading && mine.shown ? 'ins-reading' : ''}`}
      >
        {rows.map((row, r) => (
          <div
            key={r}
            className="ins-hrow"
            style={{
              gridTemplateColumns: row
                .map((b) => `minmax(68px, ${b.w}fr)`)
                .join(' '),
            }}
          >
            {row.map(({ o }, i) => (
              <Box
                key={o.instrumentId}
                o={o}
                big={r === 0}
                delay={(r * 4 + i) * 25}
                change={changes.get(o.symbol) ?? null}
                call={callOf(o)}
                period={period}
                reading={mine.reading}
              />
            ))}
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
