import { Info, heatColour, signed } from './parts'
import type { Answer } from './useMarket'
import { TickerLogo } from '@/components/finances/Logo'
import { REGIONS, SECTORS, heatCap, heatMix } from '@/lib/insightsMarket'
import type { Period } from '@/lib/insightsMarket'

/* S&P 500 · BIGGEST 30 (mockup): the sectors as groups, each headed by
   its own sector fund's change, the biggest companies inside — box by
   market cap, colour by the period's move, a white dot on one held in
   Portfolio. Under it, the regions. Sizes follow Yahoo's market caps; when
   they do not come, the boxes are equal and the foot says so. */

type Company = Answer['companies'][number]

export function SectorMap({
  shown,
  period,
  held,
  reading,
}: {
  shown: Answer | null
  period: Period
  held: ReadonlySet<string>
  reading: boolean
}) {
  const companies = new Map(shown?.companies.map((c) => [c.symbol, c]) ?? [])
  /* By the square root of the cap, as the mockup's weights read: by the
     cap itself NVDA is fifteen of KO, and the small sectors vanish. */
  const size = (s: string) =>
    shown?.capsReached ? Math.sqrt((companies.get(s)?.cap ?? 0) / 1e11) || 1 : 1
  const colour = (change: number | null) =>
    heatColour(change, change === null ? 0 : heatMix(change, period))
  const changes = [...companies.values()].filter(
    (c): c is Company & { change: number } => c.change !== null,
  )
  type Moved = Company & { change: number }
  const up = changes.reduce<Moved | null>(
    (a, c) => (a === null || c.change > a.change ? c : a),
    null,
  )
  const down = changes.reduce<Moved | null>(
    (a, c) => (a === null || c.change < a.change ? c : a),
    null,
  )
  const cap = heatCap(period)

  const stock = (symbol: string, lg: boolean) => {
    const c = companies.get(symbol)
    const mine = held.has(symbol)
    return (
      <div
        key={symbol}
        data-testid="stock"
        data-symbol={symbol}
        data-held={String(mine)}
        className={`ins-st ${lg ? 'lg' : ''}`}
        style={{ flex: size(symbol), background: colour(c?.change ?? null) }}
      >
        {mine ? <span className="mine" aria-label="held" /> : null}
        <span className="t">
          <TickerLogo symbol={symbol} size={lg ? 24 : 16} />
          {symbol}
        </span>
        <span className="c">
          {c?.change != null ? signed(c.change) : reading ? '…' : '—'}
        </span>
      </div>
    )
  }

  return (
    <section
      className="ins-tile"
      style={{ '--i': 6, '--a': 'var(--state-good)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span
          className="ins-ico"
          style={{ '--a': 'var(--state-good)' } as React.CSSProperties}
        >
          🗺️
        </span>
        <span className="ins-tname">S&amp;P 500 · BIGGEST 30</span>
        <Info
          info={{
            title: 'S&P 500 HEATMAP',
            what: 'The 30 biggest US companies grouped by industry. Box size is how big the company is; colour is how its price moved over the chosen period. A white dot is a company held.',
            why: 'It shows what drove the market — and whether the portfolio was in it.',
            now:
              up && down
                ? [
                    `${up.symbol} ${signed(up.change)} · ${down.symbol} ${signed(down.change)}`,
                  ]
                : ['NOT REACHED'],
          }}
        />
        <span className="flex-1" />
        <span className="ins-badge dim">
          <span className="ins-dot" /> HELD
        </span>
        <span className="ins-badge dim" data-testid="heat-period">
          {period}
        </span>
      </div>
      <div className={`ins-tmap ${reading && shown ? 'ins-reading' : ''}`}>
        {([0, 1] as const).map((row) => (
          <div
            key={row}
            className="ins-trow"
            style={{ height: row === 0 ? 230 : 150 }}
          >
            {SECTORS.filter((s) => s.row === row).map((s) => {
              const ordered = [...s.stocks].sort((a, b) => size(b) - size(a))
              const [first, ...rest] = ordered
              const change =
                shown?.sectors.find((x) => x.id === s.id)?.change ?? null
              return (
                <div
                  key={s.id}
                  data-testid="sector"
                  className="ins-grp"
                  style={{
                    flex: ordered.reduce((a, x) => a + size(x), 0),
                  }}
                >
                  <div className="gh">
                    {s.emoji} {s.name}
                    <span
                      className="p"
                      style={{
                        color:
                          change === null
                            ? 'var(--color-ink-500)'
                            : change >= 0
                              ? 'var(--state-good)'
                              : 'var(--state-danger)',
                      }}
                    >
                      {change !== null ? signed(change) : '—'}
                    </span>
                  </div>
                  <div className="ins-gin">
                    {stock(first, true)}
                    <div
                      className="ins-gcol"
                      style={{ flex: rest.reduce((a, x) => a + size(x), 0) }}
                    >
                      {rest.map((x) => stock(x, false))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="ins-regions">
        {REGIONS.map((r) => {
          const change =
            shown?.regions.find((x) => x.id === r.id)?.change ?? null
          return (
            <span
              key={r.id}
              data-testid="region"
              className="ins-reg"
              style={{ background: colour(change) }}
            >
              {r.emoji} {r.name} {change !== null ? signed(change) : '—'}
            </span>
          )
        })}
      </div>
      <div className="ins-foot">
        <div className="ins-scale">
          <span className="ins-was">−{cap}%</span>
          <i />
          <span className="ins-was">+{cap}%</span>
        </div>
        <span className="ins-was">
          {shown && !shown.capsReached
            ? 'BOX = SAME SIZE'
            : 'BOX = COMPANY SIZE'}{' '}
          · YAHOO FINANCE · NOT SAVED
        </span>
      </div>
    </section>
  )
}
