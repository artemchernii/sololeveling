import {
  Activity,
  Cog,
  Cpu,
  HeartPulse,
  Landmark,
  ShoppingBasket,
  ShoppingCart,
  Zap,
} from 'lucide-react'

import { DrawnMark, Flag } from './Flag'
import { Info, PeriodSwitch, signed } from './parts'
import type { Answer } from './useMarket'
import { TickerLogo } from '@/components/finances/Logo'
import { REGIONS, SECTORS, zeroBar } from '@/lib/insightsMarket'
import type { Period, SectorIcon } from '@/lib/insightsMarket'

/* SECTORS (30 Oct, market-story.html; his "this part is a bit ugly" on the
   heat boxes): one row per S&P 500 sector, best first — a line icon, the
   name, a bar from the zero line by its own sector fund's change, the
   change; under it the biggest companies as logos with theirs, a held one
   framed. REGIONS under it, the same rows without companies. */

const ICON: Record<SectorIcon, typeof Cpu> = {
  chip: Cpu,
  wave: Activity,
  cart: ShoppingCart,
  heart: HeartPulse,
  bank: Landmark,
  gear: Cog,
  bolt: Zap,
  basket: ShoppingBasket,
}

const tone = (c: number | null) =>
  c === null
    ? 'var(--color-ink-500)'
    : c >= 0
      ? 'var(--state-good)'
      : 'var(--state-danger)'

function Bar({ change }: { change: number | null }) {
  if (change === null) return <span className="ins-zb" />
  const w = zeroBar(change)
  return (
    <span className="ins-zb">
      <i
        style={
          change < 0
            ? { right: '50%', width: `${w}%`, background: tone(change) }
            : { left: '50%', width: `${w}%`, background: tone(change) }
        }
      />
    </span>
  )
}

export function SectorMap({
  shown,
  period,
  onPeriod,
  held,
  reading,
}: {
  shown: Answer | null
  period: Period
  onPeriod: (p: Period) => void
  held: ReadonlySet<string>
  reading: boolean
}) {
  const companies = new Map(shown?.companies.map((c) => [c.symbol, c]) ?? [])
  const changeOf = (id: string) =>
    shown?.sectors.find((x) => x.id === id)?.change ?? null
  const sorted = [...SECTORS].sort(
    (a, b) => (changeOf(b.id) ?? -999) - (changeOf(a.id) ?? -999),
  )
  const pct = (c: number | null) =>
    c !== null ? signed(c) : reading ? '…' : '—'

  return (
    <section
      className="ins-tile"
      data-tile="sectors"
      style={{ '--i': 3, '--a': 'var(--state-good)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-tname">SECTORS</span>
        <span className="ins-was">S&amp;P 500 · biggest 30</span>
        <Info
          info={{
            title: 'SECTORS',
            what: 'The S&P 500 split by industry. The bar is how the industry moved over the period, from its own fund; under it, its biggest companies. A framed company is one held.',
            why: 'It shows what drove the market — and whether the portfolio was in it.',
            now: ['YAHOO FINANCE · NOT SAVED'],
          }}
        />
        <span className="flex-1" />
        <span className="ins-badge lav">HELD</span>
        <span className="sr-only" data-testid="heat-period">
          {period}
        </span>
        <PeriodSwitch period={period} onPeriod={onPeriod} />
      </div>
      <div className={`ins-sgrid ${reading && shown ? 'ins-reading' : ''}`}>
        {sorted.map((s) => {
          const Icon = ICON[s.icon]
          const c = changeOf(s.id)
          return (
            <div key={s.id} data-testid="sector" className="ins-sr">
              <span className="si">
                <Icon size={14} aria-hidden />
              </span>
              <span className="nm">{s.name}</span>
              <Bar change={c} />
              <span className="pc" style={{ color: tone(c) }}>
                {pct(c)}
              </span>
              <div className="co">
                {s.stocks.map((symbol) => {
                  const ch = companies.get(symbol)?.change ?? null
                  const mine = held.has(symbol)
                  return (
                    <span
                      key={symbol}
                      data-testid="stock"
                      data-symbol={symbol}
                      data-held={String(mine)}
                      className={mine ? 'held' : ''}
                    >
                      <TickerLogo symbol={symbol} size={16} />
                      {symbol} <b style={{ color: tone(ch) }}>{pct(ch)}</b>
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="ins-was ins-sub2">REGIONS</div>
      <div className={`ins-sgrid ${reading && shown ? 'ins-reading' : ''}`}>
        {REGIONS.map((r) => {
          const c = shown?.regions.find((x) => x.id === r.id)?.change ?? null
          return (
            <div key={r.id} data-testid="region" className="ins-sr">
              {r.chip === 'EM' ? (
                <DrawnMark icon="globe" size={26} />
              ) : (
                <Flag code={r.chip} size={26} />
              )}
              <span className="nm">{r.name}</span>
              <Bar change={c} />
              <span className="pc" style={{ color: tone(c) }}>
                {pct(c)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="ins-foot">
        <span className="ins-was">YAHOO FINANCE · NOT SAVED</span>
      </div>
    </section>
  )
}
