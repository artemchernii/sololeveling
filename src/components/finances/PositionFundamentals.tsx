import {
  BookOpen,
  ChartColumn,
  Coins,
  Crosshair,
  Landmark,
  MoveRight,
  Percent,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { WAY_TEXT } from '@/components/finances/ChartLines'
import {
  Empty,
  Fact,
  Info,
  Range,
} from '@/components/finances/FundamentalsParts'
import type { Fundamentals } from '@/components/finances/usePositionFeeds'
import type { Way } from '@/lib/indicators'
import { fundWays, toTarget } from '@/lib/indicators'

/* The FUNDAMENTALS tab (16 Oct, mockup fundamentals.html): Yahoo's
   reading with its day, five rows in the SIGNALS anatomy — icon, name,
   badge, number, picture. Target, rating and revenue feed the verdict
   and wear its colours; P/E and dividend yield are shown, not in the
   rule, each with an ⓘ card beside its sector and the market. */

type Reading = NonNullable<Fundamentals>['reading']

const BADGE: Record<Way, string> = {
  up: 'text-state-good bg-state-good/14 ring-state-good/45',
  down: 'text-state-danger bg-state-danger/14 ring-state-danger/45',
  flat: 'text-ink-300 bg-lift/[0.05] ring-lift/12',
}
const ICON_TONE: Record<Way, string> = {
  up: 'text-state-good bg-state-good/12 ring-state-good/30',
  down: 'text-state-danger bg-state-danger/12 ring-state-danger/30',
  flat: 'text-ink-400 bg-lift/[0.06] ring-lift/16',
}
const ARROW_ICON = { up: TrendingUp, down: TrendingDown, flat: MoveRight }
const STAMP = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`
const quarter = (t: number) => {
  const d = new Date(t)
  return `q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}
const big = (v: number, cur: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: cur,
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(v)

export function PositionFundamentals({
  fund,
  share,
  updating,
  price,
  name,
  say,
}: {
  fund: Fundamentals | undefined
  share: boolean
  updating: boolean
  /** The latest stored close. */
  price: number
  name: string
  say: (v: number) => string
}) {
  if (!share)
    return (
      <Empty testid="fund-none" icon={<Landmark className="size-5" />}>
        no fundamentals · fund
        <span className="block pt-1.5">
          <Fact>technical only in the verdict</Fact>
        </span>
      </Empty>
    )
  if (fund === undefined) return null
  if (fund === null)
    return (
      <Empty testid="fund-none" icon={<BookOpen className="size-5" />}>
        {updating ? 'reading yahoo finance' : 'not loaded · yahoo finance'}
      </Empty>
    )
  const r = fund.reading
  const ways = fundWays(
    {
      asOf: r.asOf,
      targetMean: r.target?.mean,
      revenueGrowth: r.revenueGrowth,
      ratingMean: r.rating?.mean,
    },
    price,
  )
  return (
    <div className="flex flex-col">
      <div
        data-testid="fund-source"
        className="flex flex-wrap items-center gap-2 px-2 pt-3 pb-1 font-mono text-[10.5px] tracking-[0.1em] text-ink-500 uppercase"
      >
        <span className="inline-flex items-center gap-2">
          <BookOpen className="size-3 shrink-0" />
          <span>
            {r.source} · {STAMP.format(new Date(r.asOf))}
          </span>
        </span>
        <span className="flex-1" />
        {updating ? (
          <span className="inline-flex items-center gap-1.5 text-lav-300">
            <i className="size-[7px] animate-pulse rounded-full bg-lav-400" />
            updating
          </span>
        ) : (
          <span>stored · once a day</span>
        )}
      </div>
      {r.target && ways.target ? (
        <Row
          i={0}
          id="target"
          way={ways.target}
          icon={<Crosshair />}
          title="analyst target"
          sub={`avg of ${r.target.count}`}
          badge={ways.target === 'up' ? 'upside' : 'downside'}
          number={pct(toTarget(price, r.target.mean))}
          small={say(r.target.mean)}
        >
          <Range target={r.target} price={price} way={ways.target} say={say} />
        </Row>
      ) : null}
      {r.rating && ways.rating ? (
        <RatingRow r={r.rating} way={ways.rating} />
      ) : null}
      {r.revenueGrowth !== undefined && ways.revenue ? (
        <Row
          i={2}
          id="revenue"
          way={ways.revenue}
          icon={<ChartColumn />}
          title="revenue"
          sub={
            r.revenue
              ? `${quarter(r.revenue.now.asOf)} · on ${quarter(r.revenue.was.asOf)}`
              : 'last quarter · on a year before'
          }
          badge={ways.revenue === 'up' ? 'growing' : 'shrinking'}
          number={pct(r.revenueGrowth * 100)}
          small="on a year before"
        >
          {r.revenue ? (
            <span className="flex flex-wrap gap-1.5">
              {[r.revenue.now, r.revenue.was].map((q) => (
                <Fact key={q.asOf}>
                  {quarter(q.asOf)}{' '}
                  <b className="font-medium text-foreground">
                    {big(q.value, r.currency ?? 'USD')}
                  </b>
                </Fact>
              ))}
            </span>
          ) : null}
        </Row>
      ) : null}
      {r.pe && (r.pe.forward ?? r.pe.trailing) !== undefined ? (
        <PeRow r={r} fund={fund} name={name} say={say} />
      ) : null}
      {r.dividend ? (
        <Row
          i={4}
          id="dividend"
          way="flat"
          icon={<Coins />}
          title="dividend yield"
          sub="a year · on price"
          badge="not in the rule"
          info={
            <Info
              label="What is dividend yield"
              cap="dividend yield · cash a year"
              what={`Cash paid each year for a share, as a part of its price. ${(r.dividend.yield * 100).toFixed(2)}% = ${say(r.dividend.yield * 100)} a year for every ${say(100)} of shares.`}
              bars={[[name, r.dividend.yield * 100]]}
              fmt={(v) => `${v.toFixed(2)}%`}
              source={r.source}
            />
          }
          number={`${(r.dividend.yield * 100).toFixed(2)}%`}
          small={
            r.dividend.rate !== undefined
              ? `${say(r.dividend.rate)} a share a year`
              : ''
          }
        >
          {r.dividend.exDay !== undefined ? (
            <Fact>
              ex-dividend{' '}
              <b className="font-medium text-foreground">
                {FULL.format(new Date(r.dividend.exDay))}
              </b>
            </Fact>
          ) : null}
        </Row>
      ) : null}
    </div>
  )
}

function PeRow({
  r,
  fund,
  name,
  say,
}: {
  r: Reading
  fund: NonNullable<Fundamentals>
  name: string
  say: (v: number) => string
}) {
  const fwd = r.pe?.forward
  const pe = fwd ?? r.pe?.trailing ?? 0
  const one = say(1).replace(/[.,]00(?=\D*$)/, '')
  const bars: Array<[string, number]> = [[name, pe]]
  if (fwd !== undefined && fund.sector)
    bars.push([`${fund.sector.industry} avg`, fund.sector.forwardPe])
  if (fwd !== undefined && fund.market)
    bars.push(['us market avg', fund.market.forwardPe])
  const src = fund.market ?? fund.sector
  return (
    <Row
      i={3}
      id="pe"
      way="flat"
      icon={<Percent />}
      title="p/e"
      sub="price ÷ earnings"
      badge="not in the rule"
      info={
        <Info
          label="What is P/E"
          cap="p/e · price ÷ profit"
          what={`What a share costs for each ${one} of the company's yearly profit. ${pe.toFixed(1)} = ${say(pe)} for every ${one} of profit in the ${fwd !== undefined ? 'next' : 'last'} 12 months.`}
          bars={bars}
          fmt={(v) => v.toFixed(1)}
          source={
            src && bars.length > 1
              ? `sector avg · ${src.source} · ${src.year}`
              : r.source
          }
        />
      }
      number={pe.toFixed(1)}
      small={fwd !== undefined ? 'next 12 months' : 'last 12 months'}
    >
      {fwd !== undefined && r.pe?.trailing !== undefined ? (
        <Fact>
          last 12 months{' '}
          <b className="font-medium text-foreground">
            {r.pe.trailing.toFixed(1)}
          </b>
        </Fact>
      ) : null}
    </Row>
  )
}

function RatingRow({
  r,
  way,
}: {
  r: NonNullable<Reading['rating']>
  way: Way
}) {
  const sell = r.sell + r.strongSell
  const total = r.strongBuy + r.buy + r.hold + sell
  const parts: Array<[number, string, string]> = [
    [r.strongBuy, 'strong buy', 'bg-state-good'],
    [r.buy, 'buy', 'bg-state-good/55'],
    [r.hold, 'hold', 'bg-ink-500'],
    [sell, 'sell', 'bg-state-danger'],
  ]
  return (
    <Row
      i={1}
      id="rating"
      way={way}
      icon={<Star />}
      title="analyst rating"
      sub={`${total} analysts · 1 to 5`}
      badge={r.key.replace(/_/g, ' ')}
      number={r.mean.toFixed(1)}
      small="avg"
    >
      <span className="flex h-[7px] gap-0.5 overflow-hidden rounded-full">
        {parts.map(([k, label, bg], i) =>
          k > 0 ? (
            <i
              key={label}
              style={{ flex: `${k} 1 0`, animationDelay: `${400 + i * 80}ms` }}
              className={`motion-arrive ${bg}`}
            />
          ) : null,
        )}
      </span>
      <span className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono text-[9.5px] tracking-[0.06em] text-ink-500 uppercase">
        {parts.map(([k, label]) => (
          <span key={label}>
            <b className="font-medium text-ink-200">{k}</b> {label}
          </span>
        ))}
      </span>
    </Row>
  )
}

function Row({
  i,
  id,
  way,
  icon,
  title,
  sub,
  badge,
  info,
  number,
  small,
  children,
}: {
  i: number
  id: string
  way: Way
  icon: ReactNode
  title: string
  sub: string
  badge: string
  info?: ReactNode
  number: string
  small: string
  children?: ReactNode
}) {
  const Arrow = ARROW_ICON[way]
  return (
    <div
      data-testid="fund-row"
      data-id={id}
      style={{ animationDelay: `${i * 50}ms` }}
      className="motion-arrive relative grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-lift/6 px-2 py-[11px] first:border-t-0 has-[[data-open=true]]:z-10 sm:grid-cols-[30px_150px_170px_104px_minmax(80px,1fr)]"
    >
      <span
        className={`grid size-7 place-items-center rounded-[8px] ring-1 ring-inset [&>svg]:size-[15px] ${ICON_TONE[way]}`}
      >
        {icon}
      </span>
      <span className="min-w-0 font-mono text-[11.5px] tracking-[0.12em] text-foreground uppercase">
        {title}
        <small className="mt-0.5 block text-[10px] tracking-[0.08em] text-ink-500">
          {sub}
        </small>
      </span>
      <span className="flex items-center justify-self-end sm:justify-self-start">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.12em] whitespace-nowrap uppercase ring-1 ring-inset ${BADGE[way]}`}
        >
          {way === 'flat' ? null : <Arrow className="size-3.5" />}
          {badge}
        </span>
        {info}
      </span>
      <span
        className={`col-start-2 flex items-baseline gap-2 text-[16px] tabular-nums sm:col-start-auto sm:block sm:text-[19px] ${way === 'flat' ? 'text-ink-200' : WAY_TEXT[way]}`}
      >
        {number}
        <small className="block font-mono text-[10px] text-ink-500 sm:mt-0.5">
          {small}
        </small>
      </span>
      <div className="col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto">
        {children}
      </div>
    </div>
  )
}
