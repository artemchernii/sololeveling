import { useAction } from 'convex/react'
import { MessagesSquare } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Info, clock } from './parts'
import type { FunctionReturnType } from 'convex/server'
import { TickerLogo } from '@/components/finances/Logo'

/* ON REDDIT (30 Oct, market-story.html): the five tickers named most on
   Reddit today, with yesterday's count under each — two fetched numbers,
   nothing stored, kept on the page ten minutes. HELD on his own. No
   button: what a crowd talks about is not a reason to buy. */

type Crowd = FunctionReturnType<typeof api.marketSources.crowd.crowd>
const KEEP_MS = 10 * 60_000
let kept: { at: number; crowd: Crowd } | null = null

export function OnReddit({ held }: { held: ReadonlySet<string> }) {
  const ask = useAction(api.marketSources.crowd.crowd)
  const fresh = kept && Date.now() - kept.at < KEEP_MS ? kept.crowd : null
  const [crowd, setCrowd] = useState<Crowd | null>(fresh)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (crowd) return
    let live = true
    ask({})
      .then((c) => {
        kept = { at: Date.now(), crowd: c }
        if (live) setCrowd(c)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [ask, crowd])

  const reached = crowd?.reached === true && !failed
  return (
    <section
      data-tile="reddit"
      className="ins-tile"
      style={{ '--i': 4, '--a': 'var(--color-lav-400)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">
          <MessagesSquare size={15} aria-hidden />
        </span>
        <span className="ins-tname">ON REDDIT</span>
        <Info
          info={{
            title: 'ON REDDIT',
            what: 'The companies named most on Reddit in the last 24 hours — r/wallstreetbets, r/stocks, r/investing and others — with the 24 hours before under each.',
            why: 'It shows what the crowd talks about, not what is good to buy. A sudden jump often comes before a big swing either way.',
            now: ['APEWISDOM · FETCHED ON OPEN · NOT SAVED'],
          }}
        />
      </div>
      {reached ? (
        <div className="ins-crowd">
          {crowd.rows.map((r, i) => (
            <div key={r.ticker} data-testid="crowd-row" className="ins-cr">
              <span className="r">{i + 1}</span>
              <TickerLogo symbol={r.ticker} size={22} />
              <span className="nm">
                {r.ticker}
                {held.has(r.ticker) ? <i className="held">HELD</i> : null}
              </span>
              <span className="c">
                {r.mentions.toLocaleString('en-US')}× today
                <span>
                  {r.was !== null
                    ? `${r.was.toLocaleString('en-US')}× yesterday`
                    : 'yesterday —'}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : crowd || failed ? (
        <span className="ins-badge bad" data-testid="crowd-none">
          ✕ NOT REACHED
        </span>
      ) : (
        <span className="ins-badge dim ins-reading">READING</span>
      )}
      <div className="ins-foot one">
        <span className="ins-was">
          APEWISDOM{crowd ? ` · ${clock(crowd.fetchedAt)}` : ''} · NOT SAVED
        </span>
      </div>
    </section>
  )
}
