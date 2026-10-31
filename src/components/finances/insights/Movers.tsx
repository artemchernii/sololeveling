import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { ArrowUpDown } from 'lucide-react'

import { Flag } from './Flag'
import { Info, changeWord, clock, dayWord } from './parts'
import { api } from '../../../../convex/_generated/api'
import type { MoversAnswer } from '../../../../convex/marketSources/movers'
import { AccountLogo } from '@/components/finances/Logo'
import { MOVER_REGIONS, REGION_FLAG } from '@/lib/movers'
import type { MoverRegion } from '@/lib/movers'

/* MOVERS on MARKET (31 Oct, market-world.html): a region's biggest up and
   down over the week, both closes on the row and the newest headline under
   the name. Asked when a region is pressed, kept ten minutes in page
   memory, never stored. */

const KEEP_MS = 10 * 60_000
const kept = new Map<MoverRegion, { at: number; answer: MoversAnswer }>()

function useMovers(region: MoverRegion) {
  const ask = useAction(api.marketSources.movers.movers)
  const fresh = (r: MoverRegion) => {
    const k = kept.get(r)
    return k && Date.now() - k.at < KEEP_MS ? k.answer : null
  }
  const [answers, setAnswers] = useState(
    () => new Map<MoverRegion, MoversAnswer | 'failed'>(),
  )
  const shown = fresh(region) ?? answers.get(region) ?? null
  useEffect(() => {
    if (shown !== null) return
    let live = true
    ask({ region })
      .then((a) => {
        kept.set(region, { at: Date.now(), answer: a })
        if (live) setAnswers((m) => new Map(m).set(region, a))
      })
      .catch(() => {
        if (live) setAnswers((m) => new Map(m).set(region, 'failed'))
      })
    return () => {
      live = false
    }
    /* asked once per region: `shown` is null only until it lands */
  }, [ask, region])
  return shown
}

const price = (n: number, currency: string | null) => {
  const sign = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  const d = n >= 1000 ? 0 : 2
  const v = n.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })
  return sign ? `${sign}${v}` : `${v}${currency ? ` ${currency}` : ''}`
}

export function Movers() {
  const [region, setRegion] = useState<MoverRegion>('US')
  const shown = useMovers(region)
  const answer = shown === 'failed' ? null : shown
  const reached = answer?.reached === true
  return (
    <section
      data-tile="movers"
      className="ins-tile"
      style={{ '--i': 2, '--a': 'var(--color-lav-400)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">
          <ArrowUpDown size={15} aria-hidden />
        </span>
        <span className="ins-tname">MOVERS</span>
        <span className="ins-was">THE WEEK</span>
        <Info
          info={{
            title: 'MOVERS',
            what: 'The biggest companies of each region and a few the market watches, ranked by how far their price moved since the close a week ago. The five that rose most and the five that fell most, each with its newest headline.',
            why: 'A big move in a week usually has one reason: results, a forecast, a deal, a price war. The headline under the name is that reason as the news wrote it.',
            now: ['YAHOO FINANCE · FETCHED ON OPEN · NOT SAVED'],
          }}
        />
      </div>
      <div className="ins-chips" role="tablist">
        {MOVER_REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={r === region}
            data-testid="mover-region"
            className={`ins-chipbtn ${r === region ? 'on' : ''}`}
            onClick={() => setRegion(r)}
          >
            <Flag code={REGION_FLAG[r]} size={16} />
            {r}
          </button>
        ))}
      </div>
      {!reached ? (
        <span
          className={`ins-badge ${shown !== null ? 'bad' : 'dim ins-reading'}`}
          data-testid="movers-none"
        >
          {shown !== null ? '✕ NOT REACHED' : 'READING'}
        </span>
      ) : (
        <div className="ins-mv" data-testid="movers">
          {(['up', 'down'] as const).map((side) => (
            <div key={side}>
              <span
                className="ins-mv-h"
                style={{
                  color:
                    side === 'up' ? 'var(--state-good)' : 'var(--state-danger)',
                }}
              >
                {side === 'up' ? '▲ UP' : '▼ DOWN'}
              </span>
              {answer[side].length === 0 ? (
                <span className="ins-badge dim">NONE</span>
              ) : (
                answer[side].map((m) => (
                  <div
                    key={m.symbol}
                    className="ins-mr"
                    data-testid="mover"
                    data-symbol={m.symbol}
                    data-side={side}
                  >
                    <AccountLogo name={m.name} domain={m.domain} size={28} />
                    <span className="min-w-0">
                      <span className="nm">
                        {m.name} <i>{m.symbol}</i>
                      </span>
                      <span className="ins-was block">
                        {price(m.base, m.currency)} →{' '}
                        {price(m.price, m.currency)} · {dayWord(m.baseAt)}
                      </span>
                      {m.headline ? (
                        <a
                          className="why"
                          href={m.headline.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {m.headline.title}
                          <span> · {m.headline.publisher.toUpperCase()}</span>
                        </a>
                      ) : null}
                    </span>
                    <span
                      className="ch"
                      style={{
                        color:
                          m.change >= 0
                            ? 'var(--state-good)'
                            : 'var(--state-danger)',
                      }}
                    >
                      {changeWord(m.change)}
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
      <div className="ins-foot">
        <span className="ins-was" data-testid="movers-foot">
          {answer && reached
            ? `YAHOO FINANCE · FETCHED ${clock(answer.fetchedAt)} · NOT SAVED`
            : 'YAHOO FINANCE · NOT SAVED'}
        </span>
      </div>
    </section>
  )
}
