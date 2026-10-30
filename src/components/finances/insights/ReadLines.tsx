import { AccountLogo } from '@/components/finances/Logo'
import { factsFor } from '@/lib/marketRead'
import type { Kind, ReadLine } from '@/lib/marketRead'
import { boxOf, ideaOf, moveWords } from '@/lib/readMine'
import type { Board } from '@/lib/ideasRead'
import { askLine } from '@/lib/askOnCards'
import type { Doc } from '../../../../convex/_generated/dataModel'
import { AskOn } from './AskOn'
import { dayWord } from './parts'
import { Words, labelOf } from './readParts'
import { ReadWeek } from './ReadWeek'

/* Tab 2, READ (29 Oct; spec docs/specs/2026-10-29-read-personal.md, mockup
   design/treasury-mockup/read-personal.html, his "Go" on round 2 after
   "I dont understand LLM style of text, make it more readable for normal
   human"). His money on top; then each line: what happened in a plain
   sentence, what it means in one more, three boxes the app prints (his
   money first), and one move — an IDEAS line, looked up on the board —
   or No action. Beside it, THIS WEEK. HOW IT IS MADE is gone. */

type Row = Doc<'marketReads'>
export type Cash = {
  idle: number
  banks: number
  broker: number
  worth: number
}

const eur = (n: number) => `€${Math.round(n).toLocaleString('en-GB')}`

export function ReadLines({
  shown,
  cash,
  invested,
  board,
  spend,
  onIdea,
}: {
  shown: Row | null
  cash: Cash | null
  invested: number | null
  board: Board | null
  /** A month of spending, from the IDEAS read's own fact. */
  spend: number | null
  /** Opens IDEAS on that line; null opens the whole board. */
  onIdea: (ticker: string | null) => void
}) {
  const read = shown?.read
  return (
    <div className="rm-page">
      <div className="rm-board">
        <section data-testid="read-mine" className="ins-tile rm-head">
          <div className="rm-facts">
            <Fig n="Total" v={cash ? eur(cash.worth) : '—'} s="now" />
            <Fig
              n="Cash"
              v={cash ? eur(cash.idle) : '—'}
              s={
                cash && cash.worth > 0
                  ? `${Math.round((cash.idle / cash.worth) * 100)}% of total`
                  : ''
              }
              warn
            />
            <Fig
              n="In banks"
              v={cash ? eur(cash.banks) : '—'}
              s="bank accounts"
            />
            <Fig
              n="Broker cash"
              v={cash ? eur(cash.broker) : '—'}
              s="not invested"
            />
            <Fig
              n="Investments"
              v={invested !== null ? eur(invested) : '—'}
              s="now"
            />
            <Fig
              n="Spending a month"
              v={spend !== null ? eur(spend) : '—'}
              s={
                spend !== null ? 'bills and day-to-day' : 'after an IDEAS read'
              }
            />
          </div>
        </section>
        <section data-testid="read-lines" className="rm-lines">
          {read ? (
            read.lines.map((l, i) => (
              <Line
                key={i}
                line={l}
                facts={shown.facts}
                board={board}
                i={i}
                onIdea={onIdea}
              />
            ))
          ) : (
            <div className="ins-tile ins-after">
              <span className="text-[22px]">✦</span>
              <span className="label-caps">AFTER THE READ</span>
            </div>
          )}
        </section>
        {read && read.sources.length > 0 ? (
          <div data-testid="read-sources" className="ins-srcs">
            <span className="label-caps">SOURCES</span>
            {read.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ins-src"
              >
                <AccountLogo name={s.site} domain={s.site} size={14} />
                {s.site
                  .replace(/^www\./, '')
                  .split('.')[0]
                  .toUpperCase()}
                {s.day ? ` · ${dayWord(s.day)}` : ''} ↗
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <ReadWeek shown={shown} board={board} cash={cash} onIdea={onIdea} />
    </div>
  )
}

function Fig({
  n,
  v,
  s,
  warn,
}: {
  n: string
  v: string
  s: string
  warn?: boolean
}) {
  return (
    <div className="rm-fig">
      <span className="n">{n}</span>
      <span className={`v ${warn ? 'warn' : ''}`}>{v}</span>
      <span className="s">{s}</span>
    </div>
  )
}

/** Kinds in plain words, each with a line icon (no emoji: his "too many
    emojis"). */
const KIND: Record<Kind, { name: string; c: string; d: string }> = {
  inflation: {
    name: 'INFLATION',
    c: 'var(--state-warn)',
    d: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0zM11.5 10v7',
  },
  rates: {
    name: 'INTEREST RATES',
    c: 'var(--color-lav-300)',
    d: 'M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6',
  },
  market: {
    name: 'MARKETS',
    c: 'var(--idb-protect)',
    d: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  },
  allocation: {
    name: 'MIX',
    c: 'var(--idb-new)',
    d: 'M21.2 15.9A10 10 0 1 1 8 2.8M22 12A10 10 0 0 0 12 2v10z',
  },
  dont: {
    name: "DON'T",
    c: 'var(--state-danger)',
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.7 5.7l12.6 12.6',
  },
  nodata: {
    name: 'NO DATA',
    c: 'var(--color-ink-400)',
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  },
}

function Line({
  line,
  facts,
  board,
  i,
  onIdea,
}: {
  line: ReadLine
  facts: Row['facts']
  board: Board | null
  i: number
  onIdea: (ticker: string | null) => void
}) {
  const k = KIND[line.kind]
  const boxes = factsFor(line.factKeys, facts)
  const move = ideaOf(line.idea, board?.lines ?? null)
  return (
    <div
      data-testid="read-line"
      data-kind={line.kind}
      className="ins-tile rm-ln"
      style={
        { '--c': k.c, animationDelay: `${i * 70}ms` } as React.CSSProperties
      }
    >
      <span className="rm-ic" aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d={k.d} />
        </svg>
      </span>
      <div className="rm-body">
        <div>
          <span className="rm-kind">{k.name}</span>
          <h3 className="rm-title">{line.title}</h3>
          <p className="rm-sub">
            <Words text={line.line} />
          </p>
        </div>
        {boxes.length > 0 ? (
          <div className="rm-boxes">
            {boxes.map((f) => {
              const b = boxOf(f)
              return (
                <div
                  key={f.key}
                  data-testid="read-box"
                  className={`rm-box ${f.tone ?? ''}`}
                >
                  <span className="n">{labelOf(f)}</span>
                  <span className="v">{b.value}</span>
                  {b.note ? <span className="s">{b.note}</span> : null}
                </div>
              )
            })}
          </div>
        ) : null}
        <div className="rm-act">
          {move ? (
            <>
              <button
                type="button"
                data-testid="read-move"
                className="rm-go"
                onClick={() => onIdea(move.ticker)}
              >
                <span aria-hidden>→</span>
                {moveWords(move)}
              </button>
              <span className="rm-hint">Opens in Ideas</span>
            </>
          ) : (
            <span data-testid="read-none" className="rm-none">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              No action
            </span>
          )}
          <span className="grow" />
          <AskOn q={askLine(line.title)} wide />
        </div>
      </div>
    </div>
  )
}
