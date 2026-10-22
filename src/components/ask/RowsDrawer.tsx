import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useConvex } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '../../../convex/_generated/api'
import { MONTH, Star } from '@/components/finances/insights/Ask'
import { clock } from '@/components/finances/insights/parts'
import { usd } from '@/components/finances/insights/readParts'
import { monthKey, nextMonthWord } from '@/lib/marketRead'
import { MAX_QUESTION } from '@/lib/rowsAskPrompt'
import { PeriodBadges, RowsAnswer, Strip, areaColour } from './RowsAnswer'
import { openReply, useRowsAsk } from './useRowsAsk'
import type { RowsTurn } from './useRowsAsk'

/* R7 Ask AI (22 Oct, mockup design/ask-mockup/index.html round 2, his
   "go — round 2, ⌘J, logs/tasks/projects/commits/goals, not saved, Sonnet
   from the $2 cap"). ⌘J or ✦ Ask in the top bar opens it over any page:
   the Insights ASK drawer's shape — from the right, a bottom sheet on a
   phone; ✕, a tap outside and Esc close it. Before the first question,
   what it reads and four questions; after, they fold into SUGGESTED. */

const READS: Array<[string, string, string]> = [
  ['task', '📒', 'LOGS'],
  ['task', '✅', 'TASKS'],
  ['projects', '🛠️', 'PROJECTS'],
  ['projects', '⌥', 'COMMITS'],
  ['portuguese', '🎯', 'GOALS'],
]
const CARDS: Array<[string, string, string, string]> = [
  ['task', '🗓️', 'MONTH', 'What did I actually do in August?'],
  ['body', '🏋️', 'BODY', 'How many workouts since 1 September?'],
  ['portuguese', '🗣️', 'PORTUGUESE', 'Portuguese this month and last month'],
  ['money', '💶', 'MONEY', 'Where did the money go last week?'],
]
/* `?ask=` ids this page has opened already. */
const opened = new Set<string>()

const CHIPS: Array<[string, string, string]> = [
  ['projects', '🛠️', 'Which projects got commits in October?'],
  ['task', '✅', 'Tasks done this week'],
]

export function RowsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const a = useRowsAsk()
  const convex = useConvex()
  const [ready, setReady] = useState(false)
  const [text, setText] = useState('')
  const [unfolded, setUnfolded] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const thread = useRef<HTMLDivElement>(null)
  useEffect(() => setReady(true), [])
  const month = monthKey(Date.now())
  /* The month's spend only while it is open and deployed. */
  const spend = useQuery(
    api.rowsAsk.spend,
    open && a.path === 'api' ? { month } : 'skip',
  )
  const capped =
    a.path === 'api' && spend !== undefined && spend.spent >= spend.cap
  const off = a.busy || capped || a.path === null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    if (window.matchMedia('(min-width: 641px)').matches)
      panel.current
        ?.querySelector<HTMLInputElement>('[data-testid="rows-input"]')
        ?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  /* N4: the push and the bell open `/dashboard?ask=<id>` — the drawer
     opens on that answer, kept on the server for a day. */
  const href = useRouterState({ select: (st) => st.location.href })
  const navigate = useNavigate()
  useEffect(() => {
    /* The router's href, not window.location: the router has it first. */
    const url = new URL(href, window.location.origin)
    const id = url.searchParams.get('ask')
    if (id === null || opened.has(id)) return
    opened.add(id)
    onOpenChange(true)
    void openReply(convex, id)
    url.searchParams.delete('ask')
    void navigate({ href: url.pathname + url.search + url.hash, replace: true })
  }, [href, convex, onOpenChange, navigate])

  const last = a.turns.at(-1)
  /* A new question, and its answer landing: the question at the top of
     the thread, so the answer reads from its period down. */
  useEffect(() => {
    const qs = thread.current?.querySelectorAll('[data-testid="rows-q"]')
    qs?.[qs.length - 1]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [a.turns.length, last?.state])

  if (!ready) return null
  const fresh = a.turns.length === 0
  const folded = !fresh && !unfolded
  const send = (q: string) => {
    if (off || q.trim() === '') return
    void a.ask(q)
    setText('')
    setUnfolded(false)
  }

  return createPortal(
    <div className={`ask-layer ${open ? 'open' : ''}`}>
      <div
        data-testid="rows-scrim"
        className="ask-scrim"
        onClick={() => onOpenChange(false)}
      />
      <aside
        ref={panel}
        data-testid="rows-drawer"
        className="ask-drawer r7-drawer"
        aria-label="Ask"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="ask-dh">
          <span className={`ask-orb ${a.busy ? 'busy' : ''}`}>
            <Star />
          </span>
          <span className="system-title whitespace-nowrap">[ ASK ]</span>
          <span className="grow" />
          {a.path === 'pro' ? (
            <span data-testid="rows-pay" className="ins-badge good">
              <span className="ask-ping" />⚡ PRO PLAN · NO CREDITS
            </span>
          ) : a.path === 'api' && spend ? (
            <span
              data-testid="rows-pay"
              className={`ins-badge ${capped ? 'bad' : 'warn'}`}
            >
              {capped ? '⛽' : '💳'} {MONTH[Number(month.slice(5, 7)) - 1]} ·{' '}
              {usd(spend.spent)} OF {usd(spend.cap)}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="rows-close"
            className="ask-x"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </button>
        </div>

        <div className={`ask ${fresh ? 'fresh' : ''} ${folded ? '' : 'sopen'}`}>
          {fresh ? (
            <div className="r7-hero">
              <span className="ask-orb big">
                <Star />
              </span>
              <span className="system-title">[ MY ROWS ]</span>
              <div className="r7-reads">
                {READS.map(([c, e, n], i) => (
                  <span
                    key={n}
                    className="r7-read"
                    style={
                      { '--c': areaColour(c), '--i': i } as React.CSSProperties
                    }
                  >
                    <i>{e}</i>
                    {n}
                  </span>
                ))}
                <span
                  className="r7-read off"
                  style={{ '--i': READS.length } as React.CSSProperties}
                >
                  <i>📝</i>NOTES
                </span>
              </div>
            </div>
          ) : (
            <div ref={thread} data-testid="rows-thread" className="ask-thread">
              {a.turns.map((t) => (
                <TurnView
                  key={t.id}
                  t={t}
                  again={() => void a.ask(t.question, t.id)}
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
                  data-testid="rows-suggested"
                  className="ask-stog"
                  aria-expanded={!folded}
                  onClick={() => setUnfolded((u) => !u)}
                >
                  <span>
                    <Star />
                  </span>
                  SUGGESTED <i>{CARDS.length + CHIPS.length}</i> <b>▾</b>
                </button>
              )}
              <span className="ins-badge dim">🔒 NOT SAVED</span>
            </div>
            <div className="ask-sugg" inert={folded}>
              <div>
                {fresh ? (
                  <>
                    <div className="ask-cards">
                      {CARDS.map(([c, e, k, q], i) => (
                        <button
                          type="button"
                          key={q}
                          data-testid="rows-suggest"
                          className="ask-card"
                          disabled={off}
                          style={
                            {
                              '--c': areaColour(c),
                              '--i': i,
                            } as React.CSSProperties
                          }
                          onClick={() => send(q)}
                        >
                          <span className="e">{e}</span>
                          <b>{k}</b>
                          <span>{q}</span>
                        </button>
                      ))}
                    </div>
                    <div className="ask-chips r7-chips">
                      {CHIPS.map(([c, e, q]) => (
                        <button
                          type="button"
                          key={q}
                          data-testid="rows-suggest"
                          disabled={off}
                          style={
                            { '--c': areaColour(c) } as React.CSSProperties
                          }
                          onClick={() => send(q)}
                        >
                          <i>{e}</i>
                          {q}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="ask-chips">
                    {[
                      ...CARDS.map(([c, e, , q]) => [c, e, q] as const),
                      ...CHIPS,
                    ].map(([c, e, q]) => (
                      <button
                        type="button"
                        key={q}
                        data-testid="rows-suggest"
                        disabled={off}
                        style={{ '--c': areaColour(c) } as React.CSSProperties}
                        onClick={() => send(q)}
                      >
                        <i>{e}</i>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {spend && capped ? (
              <div data-testid="rows-cap" className="ask-capbar">
                <span className="e">⛽</span>
                <b>CAP REACHED</b>
                <span className="ins-badge warn">
                  {usd(spend.spent)} OF {usd(spend.cap)}
                </span>
                <span className="grow" />
                <span className="ins-badge dim">
                  NEXT {nextMonthWord(month)}
                </span>
              </div>
            ) : (
              <form
                className={`ask-bar ${a.busy ? 'off' : ''}`}
                onSubmit={(e) => {
                  e.preventDefault()
                  send(text)
                }}
              >
                <input
                  data-testid="rows-input"
                  value={text}
                  maxLength={MAX_QUESTION}
                  disabled={off}
                  placeholder="What did I do in August?"
                  onChange={(e) => setText(e.target.value)}
                />
                <button
                  type="submit"
                  data-testid="rows-send"
                  className="ins-btn"
                  disabled={off || text.trim() === ''}
                >
                  {a.busy ? '…' : 'ASK'}
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function TurnView({
  t,
  again,
  canAgain,
}: {
  t: RowsTurn
  again: () => void
  canAgain: boolean
}) {
  return (
    <>
      <div
        data-testid="rows-q"
        className={`ask-q ${t.state === 'failed' ? 'miss' : ''}`}
      >
        {t.question}
        <small>
          {t.state === 'failed' ? '✕ NOT ANSWERED · ' : ''}
          {clock(t.at)}
          {t.rang !== undefined ? (
            <span data-testid="rows-rang">
              {' · 📲 '}
              {t.state === 'failed' ? 'RANG' : 'ANSWERED'} {clock(t.rang)}
            </span>
          ) : null}
        </small>
      </div>
      {t.state === 'asking' ? (
        <div data-testid="rows-asking" className="ask-a">
          <span className="ask-orb busy">
            <Star />
          </span>
          <div className="body think">
            <PeriodBadges period={t.period} rows={t.rows} />
            {t.rows ? (
              <Strip rows={t.rows} period={t.period} labels={t.labels} />
            ) : null}
            <span className="label-caps text-lav-300">
              {t.rows
                ? `READING ${t.rows.logs.length + t.rows.commits.length} ROWS`
                : 'FINDING THE ROWS'}
            </span>
            <div className="ins-scan" />
          </div>
        </div>
      ) : t.state === 'failed' ? (
        <div data-testid="rows-failed" className="ask-a bad">
          <span className="ask-orb">
            <span>✕</span>
          </span>
          <div className="body">
            <div className="ask-fail">
              <span className="big">✕ {t.error ?? 'NOT REACHED'}</span>
              <span className="grow" />
              <button
                type="button"
                data-testid="rows-again"
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
      ) : t.answer && t.rows ? (
        <RowsAnswer t={t} />
      ) : null}
    </>
  )
}
