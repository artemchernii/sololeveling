import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { CalendarClock } from 'lucide-react'

import { Flag } from './Flag'
import { Info, clock, dayWord } from './parts'
import { api } from '../../../../convex/_generated/api'
import type { ComingAnswer } from '../../../../convex/marketSources/coming'
import { TickerLogo } from '@/components/finances/Logo'
import { MACRO_NAME, comingDays } from '@/lib/coming'
import type { MacroEvent, Reporter } from '@/lib/coming'

/* COMING on MARKET (31 Oct, part 5 of market-world.html): the next seven
   days, a row per day with something on it — rate decisions, US prices
   and jobs, big companies reporting (HELD on his own). Asked on open,
   kept ten minutes in page memory, never stored. */

const KEEP_MS = 10 * 60_000
let kept: { at: number; key: string; answer: ComingAnswer } | null = null

type Held = { symbol: string; name: string }

export function useComing(held: ReadonlyArray<Held> | null) {
  const ask = useAction(api.marketSources.coming.coming)
  const key = held?.map((h) => h.symbol).join(',') ?? ''
  const fresh =
    kept && kept.key === key && Date.now() - kept.at < KEEP_MS
      ? kept.answer
      : null
  const [answer, setAnswer] = useState<ComingAnswer | null>(fresh)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (held === null || answer) return
    let live = true
    ask({ held: held.map(({ symbol, name }) => ({ symbol, name })) })
      .then((a) => {
        kept = { at: Date.now(), key, answer: a }
        if (live) setAnswer(a)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
    /* asked once per set of companies: `key` stands for `held` */
  }, [ask, key])
  return { answer, failed }
}

const WEEKDAYS = 'SUN MON TUE WED THU FRI SAT'.split(' ')
const weekday = (d: string) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]
const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
/** The month a release reports on: the one before its day. */
const monthBefore = (d: string) =>
  MONTHS[(Number(d.slice(5, 7)) + 10) % 12] ?? ''

function MacroMark({ flag }: { flag: MacroEvent['flag'] }) {
  return <Flag code={flag} size={24} />
}

function MacroChip({ e }: { e: MacroEvent }) {
  const rate = e.kind === 'fed' || e.kind === 'ecb' || e.kind === 'boe'
  return (
    <span className="ins-evc big" data-testid="coming-macro" data-kind={e.kind}>
      <MacroMark flag={e.flag} />
      {MACRO_NAME[e.kind]}
      <span className="x2">
        {rate ? 'RATE' : monthBefore(e.day)} · {e.time}
      </span>
    </span>
  )
}

function ReporterChip({ r }: { r: Reporter }) {
  return (
    <span
      className={`ins-evc ${r.held ? 'big' : ''}`}
      data-testid="coming-results"
      data-symbol={r.symbol}
    >
      <TickerLogo
        symbol={r.symbol}
        type="EQUITY"
        name={r.name}
        domain={r.domain ?? undefined}
        size={24}
      />
      {r.name}
      {r.held ? <span className="ins-badge lav">HELD</span> : null}
      <span className="x2">
        RESULTS
        {r.hour ? ` · ${r.hour}` : ''}
        {r.expected !== null ? ` · $${r.expected.toFixed(2)} EXPECTED` : ''}
      </span>
    </span>
  )
}

export function Coming({
  c: { answer, failed },
}: {
  c: ReturnType<typeof useComing>
}) {
  const days = answer
    ? comingDays(answer.days, answer.macro, answer.reporters)
    : []
  const span = answer
    ? `${dayWord(answer.days[0])} – ${dayWord(answer.days[answer.days.length - 1])}`
    : ''
  return (
    <section
      data-tile="coming"
      className="ins-tile"
      style={{ '--i': 3, '--a': 'var(--color-lav-400)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">
          <CalendarClock size={15} aria-hidden />
        </span>
        <span className="ins-tname">COMING</span>
        <span className="ins-was">NEXT 7 DAYS{span ? ` · ${span}` : ''}</span>
        <Info
          info={{
            title: 'COMING',
            what: 'What is fixed for the next seven days: rate decisions of the Fed, the ECB and the Bank of England, the US price index (CPI) and jobs report, and the big companies due to report results, with what analysts expect them to earn a share. Times are Lisbon.',
            why: 'Prices often move most on these days. A rate decision moves bonds, the dollar and growth shares; a held company reporting can move that holding by 10% in a day.',
            now: [
              'FED · ECB · BANK OF ENGLAND · BLS · PUBLISHED SCHEDULES',
              'FINNHUB EARNINGS CALENDAR · FETCHED ON OPEN · NOT SAVED',
            ],
          }}
        />
      </div>
      {!answer ? (
        <span
          className={`ins-badge ${failed ? 'bad' : 'dim ins-reading'}`}
          data-testid="coming-none"
        >
          {failed ? '✕ NOT REACHED' : 'READING'}
        </span>
      ) : days.length === 0 ? (
        <span className="ins-badge dim" data-testid="coming-quiet">
          NONE · 7 DAYS
        </span>
      ) : (
        <div data-testid="coming">
          {days.map((d) => (
            <div key={d.day} className="ins-dy" data-testid="coming-day">
              <div className="d">
                {weekday(d.day)}
                <span>{dayWord(d.day)}</span>
              </div>
              <div className="ev">
                {d.macro.map((e) => (
                  <MacroChip key={e.kind} e={e} />
                ))}
                {d.reporters.map((r) => (
                  <ReporterChip key={r.symbol} r={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="ins-foot">
        <span className="ins-was" data-testid="coming-foot">
          FED · ECB · BOE · BLS · FINNHUB
          {answer
            ? answer.reached
              ? ` · FETCHED ${clock(answer.fetchedAt)}`
              : ' ✕ NOT REACHED'
            : ''}{' '}
          · NOT SAVED
        </span>
      </div>
    </section>
  )
}
