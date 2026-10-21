import { Info, Line, MarkLogo, changeWord, clock, dayWord } from './parts'
import type { Answer } from './useMarket'
import { MARKETS, PERIODS } from '@/lib/insightsMarket'
import type { Period } from '@/lib/insightsMarket'

/* MARKETS (mockup): eight cards — the price now, its change over the
   period with an arrow, and the period's line — under one 1D · 1W · 1M ·
   1Y switch. The change is two fetched prices: the base close is named in
   the foot ("VS 18 SEP CLOSE"). A yield moves in points, and its fall is
   the green one. */

type Unit = (typeof MARKETS)[number]['unit']

function priceWord(n: number, unit: Unit) {
  const whole = (x: number) =>
    x.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const two = (x: number) =>
    x.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  switch (unit) {
    case 'points':
      return whole(n)
    case 'EUR':
      return `€${n >= 10_000 ? whole(n) : two(n)}`
    case 'USD':
      return `$${whole(n)}`
    case 'rate':
      return n.toFixed(3)
    case 'yield':
      return `${n.toFixed(2)}%`
  }
}

/** The foot's base: the S&P 500's base close, or the previous close on 1D. */
export function sinceWord(answer: Answer | null) {
  if (!answer) return ''
  if (answer.period === '1D') return 'VS PREVIOUS CLOSE'
  const at = answer.markets.find((m) => m.id === 'sp500')?.move?.baseAt
  return at ? `VS ${dayWord(at, answer.fetchedAt)} CLOSE` : ''
}

export const MARKETS_INFO = {
  title: 'MARKETS',
  what: 'Each card is a basket or a price: the S&P 500 is the 500 biggest US companies, MSCI World about 1,400 companies in rich countries, STOXX 600 the 600 biggest in Europe.',
  why: 'VUAA follows the S&P 500 and IWDA follows MSCI World. Gold and bitcoin are prices; EUR / USD is how many dollars a euro buys; US 10Y is what the US government pays to borrow for ten years.',
  now: ['FETCHED ON OPEN · NEVER SAVED'],
}

export function Markets({
  period,
  onPeriod,
  shown,
  reading,
  failed,
}: {
  period: Period
  onPeriod: (p: Period) => void
  shown: Answer | null
  reading: boolean
  failed: boolean
}) {
  return (
    <section
      data-tile="markets"
      className="ins-tile"
      style={{ '--i': 5, '--a': 'var(--state-good)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span
          className="ins-ico"
          style={{ '--a': 'var(--state-good)' } as React.CSSProperties}
        >
          📈
        </span>
        <span className="ins-tname">MARKETS</span>
        <Info info={MARKETS_INFO} />
        <span className="flex-1" />
        <div className="ins-seg" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === period}
              onClick={() => onPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className={`ins-mkts ${reading && shown ? 'ins-reading' : ''}`}>
        {MARKETS.map((m) => {
          const move = shown?.markets.find((x) => x.id === m.id)?.move ?? null
          const yieldPts = m.unit === 'yield'
          const good =
            move !== null && (yieldPts ? move.change < 0 : move.change > 0)
          return (
            <div
              key={m.id}
              data-testid="market-card"
              data-id={m.id}
              className="ins-mk"
              style={
                {
                  '--c':
                    move === null
                      ? 'var(--color-ink-500)'
                      : good
                        ? 'var(--state-good)'
                        : 'var(--state-danger)',
                } as React.CSSProperties
              }
            >
              <MarkLogo mark={m.mark} />
              <span className="nm">{m.name}</span>
              {move !== null ? (
                <span
                  className={`ins-chg ${good ? 'g' : 'r'}`}
                  style={{ justifySelf: 'end' }}
                >
                  {changeWord(move.change, yieldPts)}
                </span>
              ) : reading && !shown ? (
                <span className="ins-badge dim ins-reading justify-self-end">
                  READING
                </span>
              ) : (
                <span className="ins-badge bad justify-self-end">
                  NOT REACHED
                </span>
              )}
              <span className="ins-num v">
                {move !== null ? priceWord(move.price, m.unit) : '—'}
              </span>
              <Line
                key={`${m.id}-${shown?.period}`}
                points={move?.points ?? []}
              />
            </div>
          )
        })}
      </div>
      <div className="ins-foot" data-testid="markets-foot">
        <span className="ins-was" data-testid="markets-since">
          {reading ? `READING ${period}…` : sinceWord(shown)}
        </span>
        <span className="ins-was">
          {failed
            ? 'YAHOO FINANCE · NOT REACHED'
            : shown
              ? `${shown.priceSource.toUpperCase()} · FETCHED ${clock(shown.fetchedAt)} · NOT SAVED`
              : 'YAHOO FINANCE · NOT SAVED'}
        </span>
      </div>
    </section>
  )
}
