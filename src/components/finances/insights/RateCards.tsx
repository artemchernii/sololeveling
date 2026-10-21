import { Info, MarkLogo, clock, dayWord, daysTo, monthWord } from './parts'
import type { InfoText } from './parts'
import type { Answer, Rate } from './useMarket'
import type { Mark } from '@/lib/insightsMarket'

/* The four rate cards (mockup: US INFLATION, EURO INFLATION, FED RATE, ECB
   RATE). Each from the body that publishes it, with its month or the day
   it took its value, and the next announcement as a badge. A source that
   did not answer says NOT REACHED on its own card only. */

type Id = Rate['id']

const CARDS: Record<Id, { name: string; mark: Mark }> = {
  'us-cpi': { name: 'US INFLATION', mark: { emoji: '🇺🇸' } },
  'eu-hicp': { name: 'EURO INFLATION', mark: { emoji: '🇪🇺' } },
  fed: { name: 'FED RATE', mark: { site: 'federalreserve.gov' } },
  ecb: { name: 'ECB RATE', mark: { site: 'ecb.europa.eu' } },
}
const IDS: Array<Id> = ['us-cpi', 'eu-hicp', 'fed', 'ecb']

const pct = (n: number) => `${n.toFixed(1)}%`
const rateValue = (r: Rate) =>
  r.value === null
    ? '—'
    : r.upper !== null
      ? `${r.value.toFixed(2)}–${r.upper.toFixed(2)}%`
      : r.id === 'fed' || r.id === 'ecb'
        ? `${r.value.toFixed(2)}%`
        : pct(r.value)

function info(id: Id, r: Rate | null): InfoText {
  const now = (s: string) => (r?.reached ? [s] : ['NOT REACHED'])
  const month = `${monthWord(r?.month ?? null)} ${r?.value != null ? pct(r.value) : ''}`
  const prev =
    r?.prev !== null && r?.prev !== undefined
      ? ` · ${monthWord(r.prevMonth)} ${pct(r.prev)}`
      : ''
  const next = r?.next ? ` · NEXT ${dayWord(r.next)}` : ''
  switch (id) {
    case 'us-cpi':
      return {
        title: CARDS[id].name,
        what: 'How much more a basket of everyday things costs than a year ago, in the US.',
        why: 'High inflation keeps the Fed from cutting; lower inflation lets it cut, which usually lifts shares.',
        now: [
          ...now(`${month}${prev} · FED AIM 2%`),
          ...(r?.index && r.month
            ? [
                `CPI INDEX ${monthWord(r.month)} ${r.month.slice(0, 4)} ${r.index.now} · ${Number(r.month.slice(0, 4)) - 1} ${r.index.yearAgo}`,
              ]
            : []),
        ],
      }
    case 'eu-hicp':
      return {
        title: CARDS[id].name,
        what: 'The same price rise, measured for the euro area — Portugal included.',
        why: 'It decides what the ECB does with rates, which moves the ActivoBank savings rate and the euro.',
        now: now(`${month}${prev} · ECB AIM 2%`),
      }
    case 'fed':
      return {
        title: CARDS[id].name,
        what: 'The interest rate the US central bank sets for banks lending dollars overnight.',
        why: 'A cut makes borrowing cheaper, usually pushes shares up and the dollar down — and a weaker dollar makes US shares worth fewer euros.',
        now: now(`${r ? rateValue(r) : ''}${next}`),
      }
    case 'ecb':
      return {
        title: CARDS[id].name,
        what: 'The rate the European Central Bank pays banks on their deposits.',
        why: 'Savings accounts in euros follow it. A cut means less interest on cash.',
        now: now(`${r ? rateValue(r) : ''}${next}`),
      }
  }
}

export function RateCards({
  answer,
  reading,
  failed,
}: {
  answer: Answer | null
  reading: boolean
  failed: boolean
}) {
  return (
    <div className="ins-grid">
      {IDS.map((id, i) => (
        <RateCard
          key={id}
          id={id}
          i={i + 1}
          rate={answer?.rates.find((r) => r.id === id) ?? null}
          at={answer?.fetchedAt ?? null}
          reading={reading}
          failed={failed}
        />
      ))}
    </div>
  )
}

function RateCard({
  id,
  i,
  rate,
  at,
  reading,
  failed,
}: {
  id: Id
  i: number
  rate: Rate | null
  at: number | null
  reading: boolean
  failed: boolean
}) {
  const card = CARDS[id]
  const reached = rate?.reached === true && !failed
  const waiting = rate === null && reading
  const inflation = id === 'us-cpi' || id === 'eu-hicp'
  const move =
    reached && inflation && rate.value !== null && rate.prev !== null
      ? Math.round((rate.value - rate.prev) * 10) / 10
      : null
  const source =
    rate?.source ??
    (inflation
      ? id === 'us-cpi'
        ? 'BLS'
        : 'EUROSTAT'
      : id === 'fed'
        ? 'FRED'
        : 'ECB')
  return (
    <section
      data-testid="rate-card"
      data-id={id}
      data-tile={inflation ? 'inflation' : 'rates'}
      data-reached={waiting ? undefined : String(reached)}
      className="ins-tile c3"
      style={{ '--i': i, '--a': 'var(--state-warn)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <MarkLogo mark={card.mark} />
        <span className="ins-tname">{card.name}</span>
        <span className="flex-1" />
        <Info info={info(id, rate)} />
      </div>
      <div className="flex items-end gap-2.5">
        <span
          className={`ins-num text-[32px] ${waiting ? 'ins-reading text-ink-500' : reached ? '' : 'text-ink-500'}`}
        >
          {waiting ? '…' : reached ? rateValue(rate) : '—'}
        </span>
        {move !== null && move !== 0 ? (
          <span className={`ins-chg ${move < 0 ? 'g' : 'r'}`}>
            {move < 0 ? '▼' : '▲'} {Math.abs(move).toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="flex min-h-[22px] flex-wrap items-center justify-between gap-2">
        {waiting ? (
          <span className="ins-badge dim ins-reading">READING</span>
        ) : !reached ? (
          <span className="ins-badge bad">✕ NOT REACHED</span>
        ) : inflation ? (
          <>
            <span className="ins-was">
              {rate.prev !== null
                ? `${monthWord(rate.prevMonth)} ${pct(rate.prev)}`
                : ''}
            </span>
            {move !== null && move < 0 ? (
              <span className="ins-badge good">▼ COOLING</span>
            ) : move !== null && move > 0 ? (
              <span className="ins-badge bad">▲ RISING</span>
            ) : (
              <span className="ins-badge dim">= SAME</span>
            )}
          </>
        ) : (
          <>
            <span className="ins-was">
              {rate.since ? `SINCE ${dayWord(rate.since)}` : ''}
            </span>
            {rate.next ? (
              <span className="ins-badge lav">
                📅 {dayWord(rate.next)} · {daysTo(rate.next)}{' '}
                {daysTo(rate.next) === 1 ? 'DAY' : 'DAYS'}
              </span>
            ) : null}
          </>
        )}
      </div>
      <div className="ins-foot one">
        <span className="ins-was">
          {source.toUpperCase()}
          {reached && inflation ? ` · ${monthWord(rate.month)}` : ''}
        </span>
        <span className="ins-was">
          {at !== null && reached ? `${clock(at)} · ` : ''}NOT SAVED
        </span>
      </div>
    </section>
  )
}
