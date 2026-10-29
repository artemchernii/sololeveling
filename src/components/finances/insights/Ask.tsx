import { useEffect, useRef, useState } from 'react'

import { SUGGESTED } from '@/lib/marketAsk'
import type { LineContext } from '@/lib/marketAsk'
import { nextMonthWord } from '@/lib/marketRead'
import { usd } from './readParts'
import { LOOK, TurnView } from './AskAnswer'
import { ShotChip, Star, readShot } from './AskBlocks'
import { useOffered, usePrefill } from './askPrefill'
import type { useAsk } from './useAsk'
import type { useMarketRead } from './useMarketRead'

export { Star }

/* ASK (I4, 21 Oct; mockup design/treasury-mockup/ask.html round 2, his
   "go"). In the drawer (insights-tabs.html, 21 Oct): the thread fills it, a
   dock is stuck to the bottom. Before the first question, four cards;
   after, four chips folded into SUGGESTED. A
   question shows at once with "asking", then lands as an answer: its
   kind, the model's words, the app's facts it named, the pages it used
   with 🌐, and who answered, what it used and who paid. A failed one
   says so in red and pays nothing; ASK AGAIN is a press. At the cap the
   box gives way to CAP REACHED. Nothing here is saved. */

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

/** A question offered before the first one; IDEAS passes its own. */
export type Suggestion = {
  e: React.ReactNode
  kind: string
  q: string
  c: string
}
const DEFAULT: Array<Suggestion> = SUGGESTED.map((s, i) => ({
  ...s,
  c: SUGGEST_COLOUR[i],
}))

export function Ask({
  r,
  a,
  suggested: given,
}: {
  r: Read
  a: ReturnType<typeof useAsk>
  suggested?: Array<Suggestion>
}) {
  const offered = useOffered<Suggestion>()
  const suggested = given ?? offered ?? DEFAULT
  const { turns, busy, capped, ask } = a
  const [text, setText] = useState('')
  /* IDEAS (29 Oct): the line a ✦ opened on, and a dropped screenshot —
     sent with the next question, then cleared. */
  const [line, setLine] = useState<LineContext | null>(null)
  const [shot, setShot] = useState<{ url: string; name: string } | null>(null)
  const [over, setOver] = useState(false)
  const take = (f: File | undefined) => {
    if (f && f.type.startsWith('image/'))
      void readShot(f).then((x) => x && setShot(x))
  }
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
    setLine(prefill.line ?? null)
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
    void ask(q, { ...(line && { line }), ...(shot && { shot }) })
    setText('')
    setLine(null)
    setShot(null)
    setUnfolded(false)
  }

  return (
    <div
      data-testid="ask"
      className={`ask ${fresh ? 'fresh' : ''} ${folded ? '' : 'sopen'} ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        if (off || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!off) take(e.dataTransfer.files[0])
      }}
    >
      {fresh ? (
        <div className="grow" />
      ) : (
        <div ref={thread} data-testid="ask-thread" className="ask-thread">
          {turns.map((t) => (
            <TurnView
              key={t.id}
              t={t}
              again={() => void ask(t.question, {}, t.id)}
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
              SUGGESTED <i>{suggested.length}</i> <b>▾</b>
            </button>
          )}
        </div>

        <div className="ask-sugg" inert={folded}>
          <div>
            {fresh ? (
              <div className="ask-cards">
                {suggested.map((s, i) => (
                  <button
                    type="button"
                    key={s.q}
                    data-testid="ask-suggest"
                    className="ask-card"
                    disabled={off}
                    style={
                      {
                        '--c': s.c,
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
                {suggested.map((s) => (
                  <button
                    type="button"
                    key={s.q}
                    data-testid="ask-suggest"
                    disabled={off}
                    style={{ '--c': s.c } as React.CSSProperties}
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
          <>
            {line || shot ? (
              <div className="ask-ctx">
                {line ? (
                  <span data-testid="ask-ctx" className="ask-ctxline">
                    ✦ {line.ticker} · {line.part.toUpperCase()} ·{' '}
                    {line.call.toUpperCase()}
                    {line.eur > 0
                      ? ` · +€${line.eur.toLocaleString('en-GB')}`
                      : ''}
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => setLine(null)}
                    >
                      ✕
                    </button>
                  </span>
                ) : null}
                {shot ? (
                  <ShotChip shot={shot} onRemove={() => setShot(null)} />
                ) : null}
              </div>
            ) : null}
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
                placeholder={busy ? 'READING…' : 'Ask, or drop a screenshot…'}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => take(e.clipboardData.files[0])}
              />
              <label
                data-testid="ask-attach"
                className="ask-attach"
                title="Screenshot"
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  data-testid="ask-file"
                  disabled={off}
                  onChange={(e) => {
                    take(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7L14 5.5a3.3 3.3 0 0 1 4.7 4.7L10.2 18.7a1.7 1.7 0 0 1-2.4-2.4L15.5 8.6" />
                </svg>
              </label>
              <button
                type="submit"
                data-testid="ask-send"
                className="ins-btn"
                disabled={off || text.trim() === ''}
              >
                {busy ? <AskBusy /> : 'ASK'}
              </button>
            </form>
          </>
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
