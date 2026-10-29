import { useRef } from 'react'

import { AccountLogo } from '@/components/finances/Logo'
import { askCopyText, dayWord, siteWord } from '@/lib/askCopy'
import { factsFor } from '@/lib/marketRead'
import type { AskKind } from '@/lib/marketAsk'
import type { Fact } from '@/lib/marketRead'
import { clock } from './parts'
import { Words, factIcon, modelWord, tokens, usd } from './readParts'
import { AskIdeas } from './AskIdeas'
import { AskChartCard, AskTableCard, ShotChip, Star } from './AskBlocks'
import { CopyPill } from './AskCopy'
import type { Turn } from './useAsk'

/* One turn of ASK (I4; split out of Ask.tsx on 29 Oct when IDEAS added
   charts, tables, the line and the screenshot): the question, asking, a
   failure in red, or the answer — its kind, the model's words, the
   app's facts it named, a chart the app draws, a table, idea cards, the
   pages it used and who answered. Nothing here is saved. */

export const LOOK: Record<AskKind, { icon: string; name: string; c: string }> =
  {
    allocation: { icon: '⚖️', name: 'ALLOCATION', c: 'var(--color-lav-400)' },
    rates: { icon: '🏛️', name: 'RATES', c: 'var(--kind-note)' },
    inflation: { icon: '🌡️', name: 'INFLATION', c: 'var(--line-1)' },
    market: { icon: '📊', name: 'MARKET', c: 'var(--state-warn)' },
    gold: { icon: '🥇', name: 'GOLD', c: 'var(--metal-xau)' },
    ideas: { icon: '💡', name: 'IDEAS', c: 'var(--line-2)' },
    dont: { icon: '⛔', name: "DON'T", c: 'var(--state-danger)' },
    nodata: { icon: '❔', name: 'NO DATA', c: 'var(--color-ink-400)' },
  }
export function TurnView({
  t,
  again,
  canAgain,
}: {
  t: Turn
  again: () => void
  canAgain: boolean
}) {
  return (
    <>
      <div
        data-testid="ask-q"
        className={`ask-q ${t.state === 'failed' ? 'miss' : ''}`}
      >
        {t.line ? (
          <span data-testid="ask-q-line" className="ask-qline">
            ✦ {t.line.ticker}
          </span>
        ) : null}
        {t.question}
        {t.shot ? <ShotChip shot={t.shot} /> : null}
        <small>
          {t.state === 'failed' ? '✕ NOT ANSWERED · ' : ''}
          {clock(t.at)}
        </small>
      </div>
      {t.state === 'asking' ? (
        <div data-testid="ask-asking" className="ask-a">
          <span className="ask-orb busy">
            <Star />
          </span>
          <div className="body think">
            <span className="label-caps text-lav-300">
              {t.shot ? 'READING THE SCREENSHOT · 🌐' : '🌐 SEARCHING'}
            </span>
            <div className="ins-scan" />
          </div>
        </div>
      ) : t.state === 'failed' ? (
        <div data-testid="ask-failed" className="ask-a bad">
          <span className="ask-orb">
            <span>✕</span>
          </span>
          <div className="body">
            <div className="ask-fail">
              <span className="big">✕ {t.error ?? 'NOT REACHED'}</span>
              <span className="grow" />
              <button
                type="button"
                data-testid="ask-again"
                className="ins-btn again"
                disabled={!canAgain}
                onClick={again}
              >
                ↻ ASK AGAIN
              </button>
            </div>
            <div className="ask-stamp">
              {t.cost ? (
                <span className="ask-pill c">{usd(t.cost)} · PAID</span>
              ) : (
                <span className="ask-pill g">$0.00 · NOTHING PAID</span>
              )}
              <span className="ask-pill">NO RETRY</span>
            </div>
          </div>
        </div>
      ) : t.answer ? (
        <Answer t={t} />
      ) : null}
    </>
  )
}

function Answer({ t }: { t: Turn }) {
  const a = t.answer!
  const look = LOOK[a.kind]
  const facts = factsFor(a.factKeys, t.facts ?? [])
  const s = t.stamp
  const card = useRef<HTMLDivElement>(null)
  /* What the card shows, as text — built on the press, never stored. */
  const text = () =>
    askCopyText({
      question: t.question,
      web: false,
      kind: `${look.icon} ${look.name}`,
      answer: a.answer,
      facts: facts.map((f) => `${factIcon(f.key)} ${f.label} ${f.value}`),
      inNext: a.kind === 'ideas' ? (t.skip ?? []) : [],
      ideas: a.ideas,
      sources: a.sources,
      model: s ? modelWord(s.model) : '',
      searches: s?.searches ?? 0,
      at: t.at,
    })
  /* The card glows once on every copy. */
  const glow = () => {
    const el = card.current
    if (!el) return
    el.classList.remove('copied')
    void el.offsetWidth
    el.classList.add('copied')
  }
  return (
    <div
      ref={card}
      data-testid="ask-answer"
      data-kind={a.kind}
      className="ask-a land"
      style={{ '--k': look.c } as React.CSSProperties}
    >
      <span className="ask-orb">
        <Star />
      </span>
      <div className="body">
        <span className="ask-kind">
          {look.icon} {look.name}
        </span>
        <p>
          <Words text={a.answer} />
        </p>
        {facts.length > 0 || (a.kind === 'ideas' && t.skip?.length) ? (
          <div className="ask-facts">
            {facts.map((f) => (
              <FactPill key={f.key} f={f} />
            ))}
            {a.kind === 'ideas' && t.skip?.length ? (
              <span data-testid="ask-in-next" className="ins-fact">
                💡 IN NEXT · {t.skip.join(' · ')}
              </span>
            ) : null}
          </div>
        ) : null}
        {a.charts.map((c) => (
          <AskChartCard key={c.tickers.join(',')} c={c} />
        ))}
        {a.tables.map((tb, i) => (
          <AskTableCard key={i} t={tb} />
        ))}
        {a.ideas.length > 0 ? <AskIdeas ideas={a.ideas} /> : null}
        {a.sources.length > 0 ? (
          <div data-testid="ask-sources" className="ins-srcs">
            {a.sources.map((src) => (
              <a
                key={src.url}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="ins-src"
              >
                <AccountLogo name={src.site} domain={src.site} size={14} />
                {siteWord(src.site)}
                {src.day ? ` · ${dayWord(src.day)}` : ''} ↗
              </a>
            ))}
          </div>
        ) : null}
        {s ? (
          <div data-testid="ask-stamp" className="ask-stamp">
            <span className="ask-pill m">✦ {modelWord(s.model)}</span>
            {s.searches > 0 ? (
              <span className="ask-pill m">
                🌐 {s.searches} {s.searches === 1 ? 'SEARCH' : 'SEARCHES'}
              </span>
            ) : null}
            <span className="ask-pill">
              {tokens(s.inputTokens)} IN · {tokens(s.outputTokens)} OUT
            </span>
            {s.paidBy === 'pro' ? (
              <span className="ask-pill g">⚡ PRO</span>
            ) : (
              <span className="ask-pill c">💳 {usd(s.cost)}</span>
            )}
            <span className="ask-pill">{clock(t.at)}</span>
            <CopyPill text={text} onCopied={glow} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function FactPill({ f }: { f: Fact }) {
  return (
    <span
      data-testid="ask-fact"
      className={`ins-fact ask-fact ${f.tone === 'good' ? 'up' : f.tone === 'bad' ? 'dn' : ''}`}
    >
      {factIcon(f.key)} {f.label} {f.value}
    </span>
  )
}
