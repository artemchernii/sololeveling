import { Euro, Wallet } from 'lucide-react'

import { TickerLogo } from '@/components/finances/Logo'
import { factsFor } from '@/lib/marketRead'
import type { Fact } from '@/lib/marketRead'
import { factStories, weekBox } from '@/lib/marketWeek'
import type { WeekKind, WeekStory } from '@/lib/marketWeek'
import { weekMoney } from '@/lib/weekMoney'
import type { MoneyChip, MoneyInput } from '@/lib/weekMoney'
import { ideaOf } from '@/lib/readMine'
import type { Board, BoardLine } from '@/lib/ideasRead'
import { askLine } from '@/lib/askOnCards'
import type { Doc } from '../../../../convex/_generated/dataModel'
import { AskOn } from './AskOn'
import { dayWord } from './parts'

/* THE WEEK, on top of MARKET (30 Oct; spec docs/specs/2026-10-30-market.md,
   mockup design/treasury-mockup/market-story.html, his "Go"). The week's
   headline, then 3–5 stories as READ's lines are drawn: kind with its
   line icon, a title and a line (the model's), three boxes the app
   prints, YOUR MONEY (his holdings and cash in the story, the app's own
   sum), one move to an IDEAS line or No action, ✦ Ask. Before a read:
   the stories the app tells from its facts alone, no words, no move. */

const KIND: Record<
  WeekKind,
  { name: string; c: string; d: string; src: string }
> = {
  rates: {
    name: 'INTEREST RATES',
    c: 'var(--color-lav-300)',
    d: 'M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6',
    src: 'FRED · ECB',
  },
  earn: {
    name: 'EARNINGS',
    c: 'var(--line-2)',
    d: 'M4 4h16v16H4zM8 16v-4M12 16V8M16 16v-6',
    src: 'FINNHUB · YAHOO',
  },
  eu: {
    name: 'EUROPE',
    c: 'var(--color-lav-400)',
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    src: 'ECB · EUROSTAT · YAHOO',
  },
  gold: {
    name: 'GOLD',
    c: 'var(--metal-xau)',
    d: 'M6 9h12l3 10H3zM9 9l1-5h4l1 5',
    src: 'YAHOO',
  },
  em: {
    name: 'EMERGING MARKETS',
    c: 'var(--state-warn)',
    d: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7v5M12 15h.01',
    src: 'YAHOO',
  },
  mkt: {
    name: 'MARKETS',
    c: 'var(--kind-note)',
    d: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    src: 'YAHOO',
  },
  none: {
    name: 'NO DATA',
    c: 'var(--color-ink-400)',
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
    src: 'NO ANSWER',
  },
}

const PART_WORD: Record<BoardLine['part'], string> = {
  protect: 'IDEAS · PROTECT',
  add: 'IDEAS · ADD TO MINE',
  new: 'IDEAS · NEW',
}
/** A bond rate moves in points: ink, never a gain or a loss. */
const RATE = new Set(['mkt-us10y'])
const eur = (n: number) => `€${Math.round(n).toLocaleString('en-GB')}`

/** Monday of this week to today, "27–30 OCT"; Monday alone for the head. */
function weekOf(now: number) {
  const d = new Date(now)
  const monday = new Date(now - ((d.getUTCDay() + 6) % 7) * 86_400_000)
  const [m, today] = [dayWord(monday.getTime()), dayWord(now)]
  const range =
    m.split(' ')[1] === today.split(' ')[1]
      ? `${m.split(' ')[0]}–${today}`
      : `${m}–${today}`
  return { monday: m, range }
}

export function WeekStories({
  shown,
  facts,
  money,
  board,
  onIdea,
}: {
  /** The read on screen: this month's, else the last kept. */
  shown: Doc<'marketReads'> | null
  /** The room's facts now, for the stories before a read. */
  facts: Array<Fact>
  money: MoneyInput
  board: Board | null
  onIdea: (ticker: string | null) => void
}) {
  const read = shown?.read
  const stories = read?.week ?? []
  const isRead = stories.length > 0
  const list: Array<WeekStory> = isRead ? stories : factStories(facts)
  const from = isRead && shown ? shown.facts : facts
  const at = (isRead ? shown?.readAt : undefined) ?? Date.now()
  const { monday, range } = weekOf(at)
  return (
    <>
      <section data-testid="week-head" className="ins-tile wk-head">
        <span className="label-caps">THE MARKET · WEEK OF {monday}</span>
        <h2 data-testid="week-headline" className="wk-h1">
          {isRead ? read?.weekHead : 'Not read yet'}
        </h2>
        <p className="wk-take">
          {isRead
            ? read?.weekTake
            : 'Facts only · no stories before ✦ READ MARKET'}
        </p>
      </section>
      <div className="wk-sec">
        <h2>THE WEEK</h2>
        <span data-testid="week-count" className="label-caps">
          {isRead
            ? `${list.length} ${list.length === 1 ? 'STORY' : 'STORIES'} · ${range}`
            : `FACTS ONLY · ${range}`}
        </span>
      </div>
      <div data-testid="week-stories" className="rm-lines">
        {list.map((s, i) => (
          <Story
            key={`${s.kind}-${i}`}
            s={s}
            i={i}
            facts={from}
            money={money}
            board={board}
            day={dayWord(at)}
            words={isRead}
            onIdea={onIdea}
          />
        ))}
      </div>
    </>
  )
}

function Story({
  s,
  i,
  facts,
  money,
  board,
  day,
  words,
  onIdea,
}: {
  s: WeekStory
  i: number
  facts: Array<Fact>
  money: MoneyInput
  board: Board | null
  day: string
  /** A read's story: the model's words, a move or No action, ✦ Ask. */
  words: boolean
  onIdea: (ticker: string | null) => void
}) {
  const k = KIND[s.kind]
  const boxes = factsFor(s.factKeys, facts)
  const mine = weekMoney(s.kind, s.factKeys, money)
  const move = words ? ideaOf(s.move?.ticker, board?.lines ?? null) : null
  return (
    <div
      data-testid="week-story"
      data-kind={s.kind}
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
          <div className="wk-top">
            <span className="rm-kind">{k.name}</span>
            <span className="wk-src">
              {k.src} · {day}
            </span>
          </div>
          <h3 className="rm-title">{s.title}</h3>
          {s.line ? <p className="rm-sub">{s.line}</p> : null}
        </div>
        {boxes.length > 0 ? (
          <div className="rm-boxes">
            {boxes.map((f) => {
              const b = weekBox(f)
              return (
                <div
                  key={f.key}
                  data-testid="week-box"
                  className={`rm-box ${RATE.has(f.key) ? '' : (f.tone ?? '')}`}
                >
                  <span className="n">{f.label.toUpperCase()}</span>
                  <span className="v">{b.value}</span>
                  {b.note ? <span className="s">{b.note}</span> : null}
                </div>
              )
            })}
          </div>
        ) : null}
        {mine ? (
          <div
            data-testid="week-money"
            data-zero={mine.zero}
            className={`wk-mine ${mine.zero ? 'zero' : ''}`}
          >
            <span className="lab">YOUR MONEY</span>
            {mine.chips.map((c) => (
              <Chip key={`${c.symbol}-${c.name}`} c={c} />
            ))}
            {mine.total ? <span className="tot">{mine.total}</span> : null}
          </div>
        ) : null}
        {words ? (
          <div className="rm-act">
            {move ? (
              <>
                <button
                  type="button"
                  data-testid="week-move"
                  className="rm-go"
                  onClick={() => onIdea(move.ticker)}
                >
                  <span aria-hidden>→</span>
                  Open {move.name} in Ideas
                </button>
                <span className="rm-hint">{PART_WORD[move.part]}</span>
              </>
            ) : (
              <span data-testid="week-none" className="rm-none">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                No action
              </span>
            )}
            <span className="grow" />
            <AskOn q={askLine(s.title)} wide />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Chip({ c }: { c: MoneyChip }) {
  return (
    <span data-testid="week-chip" className="wk-hold">
      {c.symbol ? (
        <TickerLogo symbol={c.symbol} size={22} />
      ) : (
        <span className="wk-cash" aria-hidden>
          {c.name === 'Investments' ? <Wallet size={13} /> : <Euro size={13} />}
        </span>
      )}
      {c.name}
      <span className="e">
        {eur(c.eur)}
        {c.share !== null ? ` · ${c.share}%` : ''}
      </span>
    </span>
  )
}
