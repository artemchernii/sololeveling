import { useState } from 'react'

import type { BoardAnswer } from '../../../../convex/insightsBoard'
import type { Doc } from '../../../../convex/_generated/dataModel'
import { TickerLogo } from '@/components/finances/Logo'
import { STRIP } from '@/lib/ideasBoard'
import type { MoverList } from '@/lib/ideasBoard'
import type { Cash } from '@/lib/ideasFacts'
import { ALLOC } from '@/lib/insightsMine'
import type { AllocRow } from '@/lib/insightsMine'
import type { BoardLine, LinePart } from '@/lib/ideasRead'
import { AskBusy } from './Ask'
import { askAbout } from './askPrefill'
import { IdeasLine, Spark, eurWord } from './IdeasLine'
import { clock } from './parts'
import { Words, modelWord, tokens, usd } from './readParts'
import type { IdeasState } from './useIdeas'

/* IDEAS, the board (29 Oct; spec docs/specs/2026-10-29-ideas-board.md,
   mockup design/treasury-mockup/ideas-board.html, his "alright lets
   build"). The plan for his idle cash: the head (cash not invested, the
   model's take, READ AGAIN, the four parts as one bar, the market strip),
   then ADD TO MINE, PROTECT and NEW, then the movers. The numbers are the
   app's; the calls, € and words are the model's, with who wrote it. */

type Read = Doc<'ideasReads'>
export type Owned = {
  symbol: string
  name: string
  valueEur: number | null
  pct: number | null
}

const PART: Record<
  LinePart,
  { name: string; sub: string; c: string; icon: React.ReactNode }
> = {
  add: {
    name: 'ADD TO MINE',
    sub: 'MINE · AFTER TODAY',
    c: 'var(--idb-add)',
    icon: <path d="M12 5v14M5 12h14" />,
  },
  protect: {
    name: 'PROTECT',
    sub: 'GOLD · BONDS · CASH THAT PAYS',
    c: 'var(--idb-protect)',
    icon: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  },
  new: {
    name: 'NEW',
    sub: 'NOT IN MINE · % MINE · % WORLD',
    c: 'var(--idb-new)',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M15 9l-2 4-4 2 2-4z" />
      </>
    ),
  },
}

export function IdeasBoard({
  cash,
  owned,
  alloc,
  board,
  boardFailed,
  read,
  status,
  error,
  canPress,
  onPress,
  lit,
}: {
  cash: Cash | null
  owned: Array<Owned> | null
  alloc: Array<AllocRow> | null
  board: BoardAnswer | null
  boardFailed: boolean
  read: Read | null
  status: IdeasState
  error: string | null
  canPress: boolean
  onPress: () => void
  lit: string | null
}) {
  const b = read?.board
  const tick = new Map(board?.tickers.map((t) => [t.symbol.toUpperCase(), t]))
  /* A ticker Yahoo does not answer is dropped, once the fetch is back. */
  const shown = (b?.lines ?? []).filter(
    (l) => board === null || tick.has(l.ticker),
  )
  const heldOf = (l: BoardLine) => {
    const o = owned?.find((x) => x.symbol.toUpperCase() === l.ticker)
    if (o && o.valueEur !== null)
      return { big: eurWord(o.valueEur), small: `${o.pct ?? 0}% OF MINE` }
    const a = alloc?.find((r) => r.id === l.area)
    if (l.part === 'new' && a && a.mine !== null)
      return {
        big: ALLOC.find((x) => x.id === a.id)?.name ?? '',
        small: `${Math.round(a.mine)}% MINE${a.world !== null ? ` · ${Math.round(a.world)}% WORLD` : ''}`,
      }
    return { big: '—', small: 'NOT IN MINE' }
  }
  const pct =
    cash && cash.worth > 0 ? Math.round((cash.idle / cash.worth) * 100) : null

  return (
    <div data-testid="idb-board" className="idb-board">
      <section className="ins-tile idb-tile" data-testid="idb-head">
        <div className="idb-head">
          <div>
            <span className="label-caps">CASH · NOT INVESTED</span>
            <div className="big" data-testid="idb-cash">
              <b>{cash ? eurWord(cash.idle) : '…'}</b>
              {pct !== null ? ` · ${pct}%` : ''}
            </div>
          </div>
          <p className="take" data-testid="idb-take">
            {b ? <Words text={b.take} /> : null}
          </p>
          <div className="idb-again">
            {read?.stamp ? (
              <span className="idb-meta" data-testid="idb-stamp">
                {modelWord(read.stamp.model)} · {clock(read.readAt ?? 0)} ·{' '}
                {tokens(read.stamp.inputTokens)} IN ·{' '}
                {read.stamp.paidBy === 'pro' ? '⚡ PRO' : usd(read.stamp.cost)}
              </span>
            ) : null}
            {status === 'failed' ? (
              <span data-testid="idb-failed" className="idb-pill bad">
                ✕ {error ?? 'NOT REACHED'}
              </span>
            ) : status === 'cap' ? (
              <span className="idb-pill warn">CAP REACHED</span>
            ) : null}
            <button
              type="button"
              data-testid="idb-read"
              data-state={status}
              className="idb-btn"
              disabled={!canPress}
              onClick={onPress}
            >
              {status === 'reading' ? (
                <>
                  <AskBusy /> READING
                </>
              ) : b ? (
                '↻ READ AGAIN'
              ) : (
                '✦ READ'
              )}
            </button>
          </div>
        </div>
        {b ? (
          <div className="idb-bar" data-testid="idb-bar">
            {(['keep', 'protect', 'add', 'new'] as const).map((k) =>
              b.parts[k] > 0 ? (
                <i
                  key={k}
                  style={
                    {
                      '--c': `var(--idb-${k})`,
                      flex: b.parts[k],
                    } as React.CSSProperties
                  }
                >
                  {k.toUpperCase()} <span>{eurWord(b.parts[k])}</span>
                </i>
              ) : null,
            )}
          </div>
        ) : status !== 'reading' ? (
          <div className="idb-none" data-testid="idb-none">
            <span className="idb-pill ink">NOT READ YET</span>
          </div>
        ) : (
          <div className="ins-scan" />
        )}
        <div className="idb-strip" data-testid="idb-strip">
          {STRIP.map((s) => {
            const c = board?.strip.find((x) => x.id === s.id)?.cell
            return (
              <div key={s.id} className="mk">
                <span className="n">{s.name}</span>
                {c ? (
                  <>
                    <span className="v">
                      {s.unit === 'yield'
                        ? `${c.price.toFixed(2)}%`
                        : `${s.unit === 'USD' ? '$' : ''}${c.price.toLocaleString('en-GB', { maximumFractionDigits: c.price >= 1000 ? 0 : 2 })}`}
                    </span>
                    <span className={c.change >= 0 ? 'd up' : 'd dn'}>
                      {c.change >= 0 ? '+' : '−'}
                      {Math.abs(c.change).toFixed(2)}
                      {s.unit === 'yield' ? ' PTS' : '%'}
                    </span>
                    <Spark points={c.points} w={100} h={14} />
                  </>
                ) : (
                  <span className="v dim">
                    {board || boardFailed ? '❔' : '…'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {board ? (
          <span className="ins-was">
            YAHOO · {clock(board.fetchedAt)} · NOT SAVED
          </span>
        ) : null}
      </section>

      {b
        ? (['add', 'protect', 'new'] as const).map((part) => {
            const lines = shown.filter((l) => l.part === part)
            if (lines.length === 0) return null
            const P = PART[part]
            return (
              <section
                key={part}
                data-testid="idb-part"
                data-part={part}
                className="ins-tile idb-part"
                style={{ '--c': P.c } as React.CSSProperties}
              >
                <div className="idb-phead">
                  <span className="ic">
                    <svg viewBox="0 0 24 24" aria-hidden>
                      {P.icon}
                    </svg>
                  </span>
                  <span className="t">{P.name}</span>
                  <span className="s">{P.sub}</span>
                  <span className="grow" />
                  <span className="sum">{eurWord(b.parts[part])}</span>
                </div>
                {lines.map((l, i) => (
                  <IdeasLine
                    key={l.ticker}
                    i={i}
                    line={l}
                    facts={board ? tick.get(l.ticker) : undefined}
                    held={heldOf(l)}
                    readFacts={read.facts}
                    lit={lit === l.ticker}
                    onAsk={() =>
                      askAbout(`Why ${l.call.toUpperCase()} ${l.ticker}?`, {
                        ticker: l.ticker,
                        part: P.name,
                        call: l.call,
                        eur: l.eur,
                        why: l.why,
                      })
                    }
                  />
                ))}
              </section>
            )
          })
        : null}

      <Movers board={board} failed={boardFailed} owned={owned} />
    </div>
  )
}

const LISTS: Array<MoverList> = ['trending', 'gainers', 'losers']

function Movers({
  board,
  failed,
  owned,
}: {
  board: BoardAnswer | null
  failed: boolean
  owned: Array<Owned> | null
}) {
  const [list, setList] = useState<MoverList>('trending')
  const rows = board?.movers[list]
  const mine = new Set(owned?.map((o) => o.symbol.toUpperCase()))
  return (
    <section className="ins-tile idb-tile" data-testid="idb-movers">
      <div className="flex items-center gap-2">
        <span className="label-caps">MOVERS · US</span>
        <span className="grow" />
        <span className="idb-seg">
          {LISTS.map((l) => (
            <button
              key={l}
              type="button"
              data-testid="idb-list"
              aria-pressed={l === list}
              onClick={() => setList(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <div className="idb-mvs">
        {rows ? (
          rows.map((m) => (
            <button
              key={m.symbol}
              type="button"
              data-testid="idb-mover"
              className={`idb-mv ${mine.has(m.symbol) ? 'mine' : ''}`}
              onClick={() =>
                askAbout(
                  `${m.symbol} ${m.change > 0 ? '+' : ''}${m.change}% today: worth a look?`,
                )
              }
            >
              <TickerLogo symbol={m.symbol} name={m.name} size={22} />
              {m.symbol}
              <span className={m.change >= 0 ? 'up' : 'dn'}>
                {m.change > 0 ? '+' : ''}
                {m.change}%
              </span>
              {mine.has(m.symbol) ? (
                <span className="idb-pill lav">MINE</span>
              ) : null}
            </button>
          ))
        ) : board || failed ? (
          <span data-testid="idb-nodata" className="idb-pill ink">
            ❔ NO DATA
          </span>
        ) : (
          <span className="ask-shim h-[30px] w-full" />
        )}
      </div>
    </section>
  )
}
