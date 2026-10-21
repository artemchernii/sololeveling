import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { TickerLogo } from '@/components/finances/Logo'
import type { Doc } from '../../../../convex/_generated/dataModel'
import type { IdeaQuote } from '@/lib/ideaQuote'
import { Line, changeWord, clock, dayWord } from './parts'
import { Words } from './readParts'

/* Band 4, NEXT (mockup): 2–4 tickers not owned, named by the read with a
   why, a bull, a bear and a wrong-if in its words. Every number on a card
   is the app's, fetched on open and never saved — the price, the month
   and the year each as two prices with both shown, the month's line. A
   ticker the market does not answer is dropped. */

type Idea = NonNullable<Doc<'marketReads'>['read']>['ideas'][number]

const KEEP_MS = 10 * 60_000
const kept = new Map<string, { at: number; quotes: Array<IdeaQuote> }>()

export function useQuotes(symbols: Array<string>) {
  const ask = useAction(api.insightsIdeas.quotes)
  const key = symbols.join(',')
  const hit = kept.get(key)
  const [quotes, setQuotes] = useState<Array<IdeaQuote> | null>(
    hit && Date.now() - hit.at < KEEP_MS ? hit.quotes : null,
  )
  useEffect(() => {
    if (key === '') return setQuotes([])
    const was = kept.get(key)
    if (was && Date.now() - was.at < KEEP_MS) return setQuotes(was.quotes)
    let live = true
    setQuotes(null)
    ask({ symbols: key.split(',') })
      .then((q) => {
        kept.set(key, { at: Date.now(), quotes: q })
        if (live) setQuotes(q)
      })
      .catch(() => live && setQuotes([]))
    return () => {
      live = false
    }
  }, [ask, key])
  return quotes
}

const price = (q: IdeaQuote, n = q.price) =>
  `${q.currency === 'EUR' ? '€' : q.currency === 'USD' ? '$' : `${q.currency} `}${n.toLocaleString('en-GB', { maximumFractionDigits: n >= 100 ? 0 : 2 })}`

export function Ideas({ ideas }: { ideas: Array<Idea> | null }) {
  const quotes = useQuotes(ideas?.map((i) => i.ticker) ?? [])
  if (ideas === null)
    return (
      <div className="ins-grid">
        <section className="ins-tile c12" data-testid="ideas-after">
          <div className="ins-thead">
            <span className="ins-ico">💡</span>
            <span className="ins-tname">IDEAS · NOT OWNED</span>
          </div>
          <div className="ins-after min-h-[110px]">
            <span className="label-caps">AFTER THE READ</span>
          </div>
        </section>
      </div>
    )
  const found = ideas.flatMap((idea) => {
    const q = quotes?.find((x) => x.symbol === idea.ticker)
    return q ? [{ idea, q }] : []
  })
  if (ideas.length === 0 || (quotes !== null && found.length === 0))
    return (
      <div className="ins-grid">
        <section className="ins-tile c12" data-testid="ideas-none">
          <div className="ins-thead">
            <span className="ins-ico">💡</span>
            <span className="ins-tname">IDEAS · NOT OWNED</span>
            <span className="flex-1" />
            <span className="ins-badge dim">0 IDEAS</span>
          </div>
        </section>
      </div>
    )
  return (
    <div className="ins-grid">
      {quotes === null
        ? ideas.map((idea, i) => (
            <section
              key={idea.ticker}
              className="ins-tile c3 ins-idea"
              style={{ '--i': 11 + i } as React.CSSProperties}
            >
              <div className="top">
                <span className="tk">{idea.name}</span>
                <span className="ins-badge dim ins-reading">READING</span>
              </div>
            </section>
          ))
        : found.map(({ idea, q }, i) => (
            <IdeaCard key={idea.ticker} idea={idea} q={q} i={i} />
          ))}
    </div>
  )
}

/** One idea's card; `in` an ASK answer it sits three to a row. */
export function IdeaCard({
  idea,
  q,
  i,
  in: where = 'next',
}: {
  idea: Idea
  q: IdeaQuote
  i: number
  in?: 'next' | 'ask'
}) {
  const m = q.month
  const tone =
    m === null || m.change === 0
      ? 'var(--color-lav-400)'
      : m.change > 0
        ? 'var(--state-good)'
        : 'var(--state-danger)'
  return (
    <section
      data-testid={where === 'ask' ? 'ask-idea' : 'idea-card'}
      data-ticker={idea.ticker}
      className={`ins-tile ins-idea ${where === 'ask' ? 'ask-idea' : 'c3'}`}
      style={
        {
          '--i': where === 'ask' ? i : 11 + i,
          '--tone': tone,
        } as React.CSSProperties
      }
    >
      <div className="top">
        <div className="flex items-start justify-between gap-2">
          <TickerLogo symbol={q.symbol} name={idea.name} size={38} />
          <span className="ins-badge lav">💡 MODEL · NOT ADVICE</span>
        </div>
        <div className="min-w-0">
          <div className="tk">{idea.ticker}</div>
          <div className="co">{idea.name}</div>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="ins-num text-[22px]">{price(q)}</span>
          {m ? (
            <span className={`ins-chg ${m.change >= 0 ? 'g' : 'r'}`}>
              {changeWord(m.change)} · 1M
            </span>
          ) : null}
        </div>
        <Line points={q.points} h={36} />
        <div className="flex flex-wrap gap-1.5">
          {m ? (
            <span className="ins-fact">
              {dayWord(m.baseAt)} {price(q, m.base)}
            </span>
          ) : null}
          {q.year ? (
            <span className="ins-fact">
              1Y{' '}
              <span
                className={
                  q.year.change >= 0 ? 'text-state-good' : 'text-state-danger'
                }
              >
                {changeWord(q.year.change)}
              </span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="bot">
        <div className="why">
          <Words text={idea.why} />
        </div>
        <div className="ins-case">
          <i className="bu">▲</i>
          <span>{idea.bull}</span>
        </div>
        <div className="ins-case">
          <i className="be">▼</i>
          <span>{idea.bear}</span>
        </div>
        <div className="ins-case">
          <i className="wr">✕</i>
          <span>
            <b>WRONG IF</b> {idea.wrong}
          </span>
        </div>
        <div className="ins-foot">
          <span className="ins-was">YAHOO · {clock(q.at)}</span>
          <span className="ins-was">NOT SAVED</span>
        </div>
      </div>
    </section>
  )
}
