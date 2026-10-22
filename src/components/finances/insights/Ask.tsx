import { useEffect, useRef, useState } from 'react'

import { AccountLogo } from '@/components/finances/Logo'
import { askCopyText, dayWord, siteWord } from '@/lib/askCopy'
import { SUGGESTED } from '@/lib/marketAsk'
import { factsFor, nextMonthWord } from '@/lib/marketRead'
import type { AskKind } from '@/lib/marketAsk'
import type { Fact } from '@/lib/marketRead'
import { clock } from './parts'
import { Words, factIcon, modelWord, tokens, usd } from './readParts'
import { AskIdeas } from './AskIdeas'
import { CopyPill } from './AskCopy'
import { usePrefill } from './askPrefill'
import type { Turn, useAsk } from './useAsk'
import type { useMarketRead } from './useMarketRead'

/* ASK (I4, 21 Oct; mockup design/treasury-mockup/ask.html round 2, his
   "go"). In the drawer (insights-tabs.html, 21 Oct): the thread fills it, a
   dock is stuck to the bottom. Before the first question, four cards;
   after, four chips folded into SUGGESTED. A
   question shows at once with "asking", then lands as an answer: its
   kind, the model's words, the app's facts it named, the pages it used
   with 🌐, and who answered, what it used and who paid. A failed one
   says so in red and pays nothing; ASK AGAIN is a press. At the cap the
   box gives way to CAP REACHED. Nothing here is saved. */

const LOOK: Record<AskKind, { icon: string; name: string; c: string }> = {
  allocation: { icon: '⚖️', name: 'ALLOCATION', c: 'var(--color-lav-400)' },
  rates: { icon: '🏛️', name: 'RATES', c: 'var(--kind-note)' },
  inflation: { icon: '🌡️', name: 'INFLATION', c: 'var(--line-1)' },
  market: { icon: '📊', name: 'MARKET', c: 'var(--state-warn)' },
  gold: { icon: '🥇', name: 'GOLD', c: 'var(--metal-xau)' },
  ideas: { icon: '💡', name: 'IDEAS', c: 'var(--line-2)' },
  dont: { icon: '⛔', name: "DON'T", c: 'var(--state-danger)' },
  nodata: { icon: '❔', name: 'NO DATA', c: 'var(--color-ink-400)' },
}
const SUGGEST_COLOUR = [
  LOOK.allocation.c,
  LOOK.gold.c,
  LOOK.rates.c,
  LOOK.ideas.c,
]
export const MONTH = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(
  ' ',
)

type Read = ReturnType<typeof useMarketRead>

export function Ask({ r, a }: { r: Read; a: ReturnType<typeof useAsk> }) {
  const { turns, busy, capped, ask } = a
  const [text, setText] = useState('')
  const [web, setWeb] = useState(false)
  /* After the first question the four fold into SUGGESTED. */
  const [unfolded, setUnfolded] = useState(false)
  const thread = useRef<HTMLDivElement>(null)
  const last = turns.at(-1)
  useEffect(() => {
    const el = thread.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, last?.state])

  /* A card's ✦: its question in the box, lit, the caret at its end — a
     phone keeps its keyboard down. Never sent from here. */
  const prefill = usePrefill()
  const box = useRef<HTMLInputElement>(null)
  const [lit, setLit] = useState(false)
  useEffect(() => {
    if (!prefill) return
    setText(prefill.q)
    setLit(true)
    const wide = window.matchMedia('(min-width: 641px)').matches
    const at = requestAnimationFrame(() => {
      const el = box.current
      if (!el || !wide) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(prefill.q.length, prefill.q.length)
    })
    const off = setTimeout(() => setLit(false), 1400)
    return () => {
      cancelAnimationFrame(at)
      clearTimeout(off)
    }
  }, [prefill])

  const off = busy || capped || r.path === null
  const fresh = turns.length === 0
  const folded = !fresh && !unfolded
  const send = (q: string) => {
    if (off || q.trim() === '') return
    void ask(q, web)
    setText('')
    setUnfolded(false)
  }

  return (
    <div
      data-testid="ask"
      className={`ask ${fresh ? 'fresh' : ''} ${folded ? '' : 'sopen'}`}
    >
      {fresh ? (
        <div className="grow" />
      ) : (
        <div ref={thread} data-testid="ask-thread" className="ask-thread">
          {turns.map((t) => (
            <TurnView
              key={t.id}
              t={t}
              again={() => void ask(t.question, t.web, t.id)}
              canAgain={!off}
            />
          ))}
        </div>
      )}

      <div className="ask-dock">
        <div className="ask-srow">
          {fresh ? null : (
            <button
              type="button"
              data-testid="ask-suggested"
              className="ask-stog"
              aria-expanded={!folded}
              onClick={() => setUnfolded((u) => !u)}
            >
              <span>
                <Star />
              </span>
              SUGGESTED <i>{SUGGESTED.length}</i> <b>▾</b>
            </button>
          )}
          <span className="ins-badge dim">RESEARCH · NOT ADVICE</span>
        </div>

        <div className="ask-sugg" inert={folded}>
          <div>
            {fresh ? (
              <div className="ask-cards">
                {SUGGESTED.map((s, i) => (
                  <button
                    type="button"
                    key={s.q}
                    data-testid="ask-suggest"
                    className="ask-card"
                    disabled={off}
                    style={
                      {
                        '--c': SUGGEST_COLOUR[i],
                        '--i': i,
                      } as React.CSSProperties
                    }
                    onClick={() => send(s.q)}
                  >
                    <span className="e">{s.e}</span>
                    <b>{s.kind}</b>
                    <span>{s.q}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="ask-chips">
                {SUGGESTED.map((s, i) => (
                  <button
                    type="button"
                    key={s.q}
                    data-testid="ask-suggest"
                    disabled={off}
                    style={{ '--c': SUGGEST_COLOUR[i] } as React.CSSProperties}
                    onClick={() => send(s.q)}
                  >
                    <i>{s.e}</i>
                    {s.q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {capped ? (
          <div data-testid="ask-cap" className="ask-capbar">
            <span className="e">⛽</span>
            <b>CAP REACHED</b>
            <span className="ins-badge warn">
              {usd(r.spent)} OF {usd(r.cap)}
            </span>
            <span className="grow" />
            <span className="ins-badge dim">NEXT {nextMonthWord(r.month)}</span>
          </div>
        ) : (
          <form
            className={`ask-bar ${busy ? 'busy' : ''}`}
            onSubmit={(e) => {
              e.preventDefault()
              send(text)
            }}
          >
            <input
              ref={box}
              data-testid="ask-input"
              className={lit ? 'lit' : undefined}
              value={text}
              maxLength={400}
              disabled={off}
              placeholder={
                busy ? 'READING…' : 'Ask about the market or the portfolio'
              }
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              data-testid="ask-web"
              aria-pressed={web}
              className={`ask-web ${web ? 'on' : ''}`}
              onClick={() => setWeb((w) => !w)}
            >
              🌐 WEB
            </button>
            <button
              type="submit"
              data-testid="ask-send"
              className="ins-btn"
              disabled={off || text.trim() === ''}
            >
              {busy ? <AskBusy /> : 'ASK'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/** ✦ drawn, not typed: the glyph sits off-centre in a circle. */
/* The ASK button while the model reads (22 Oct, his "nothing is moving"):
   the star turns and the seconds count, from the press. */
export function AskBusy() {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.floor((now - start) / 1000)
  return (
    <span className="ask-busy" data-testid="ask-busy">
      <Star />
      <span className="t">
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </span>
    </span>
  )
}

export function Star() {
  return (
    <svg className="ask-star" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 0.5 C8.6 5.6 10.4 7.4 15.5 8 C10.4 8.6 8.6 10.4 8 15.5 C7.4 10.4 5.6 8.6 0.5 8 C5.6 7.4 7.4 5.6 8 0.5 Z"
        fill="currentColor"
      />
    </svg>
  )
}

function TurnView({
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
        {t.web ? '🌐 ' : ''}
        {t.question}
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
              {t.web ? '🌐 SEARCHING' : 'READING THE FACTS'}
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
      web: t.web,
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
