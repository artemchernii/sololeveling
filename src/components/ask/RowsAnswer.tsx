import { useEffect, useRef, useState } from 'react'

import { CountUp } from '@/components/finances/CountUp'
import { CopyPill } from '@/components/finances/insights/AskCopy'
import { Star } from '@/components/finances/insights/Ask'
import {
  modelWord,
  tokens,
  usd,
} from '@/components/finances/insights/readParts'
import { MONTHS, dayAreas, eur, kindWord } from '@/lib/rowsAsk'
import type { AskRows, Period, RowFact } from '@/lib/rowsAsk'
import type { LineArea } from '@/lib/rowsAskPrompt'
import type { RowsTurn } from './useRowsAsk'

/* R7 Ask AI, one answer (mockup design/ask-mockup/index.html round 2,
   his "go"): the period, a strip of the days with rows by area, the
   model's headline, up to four of the app's counts as big numbers, the
   rows behind a number on a tap, the model's lines with the counts they
   rest on, and who answered, what it read and what it cost. Every number
   here is the app's; the model's words are its own. */

const LINE: Record<LineArea, { e: string; c: string }> = {
  projects: { e: '🛠️', c: 'var(--area-projects)' },
  body: { e: '🏋️', c: 'var(--area-body)' },
  languages: { e: '🗣️', c: 'var(--area-portuguese)' },
  money: { e: '💶', c: 'var(--area-money)' },
  tasks: { e: '✅', c: 'var(--color-lav-400)' },
  other: { e: '📒', c: 'var(--color-ink-400)' },
  nodata: { e: '❔', c: 'var(--color-ink-400)' },
}
export const areaColour = (slug: string) =>
  slug === 'task' ? 'var(--color-lav-400)' : `var(--area-${slug})`
export function factIcon(key: string): string {
  if (key.startsWith('commits')) return '🛠️'
  if (key.startsWith('workout')) return '🏋️'
  if (key.startsWith('session')) return '🗣️'
  if (key.startsWith('spent') || key.startsWith('in')) return '💶'
  if (key.startsWith('task_done')) return '✅'
  if (key.startsWith('weight')) return '⚖️'
  return '📒'
}
const day = (at: number) => {
  const d = new Date(at)
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`
}

type Row = { id: string; at: number; kind: string; text: string; value: string }
function rowsById(rows: AskRows): Map<string, Row> {
  const m = new Map<string, Row>()
  for (const l of rows.logs)
    m.set(l.id, {
      id: l.id,
      at: l.at,
      kind: kindWord(l.kind),
      text: l.text ?? '',
      value:
        l.value === undefined
          ? ''
          : l.unit === 'eur'
            ? eur(l.value)
            : `${l.value}${l.unit ? ` ${l.unit.toUpperCase()}` : ''}`,
    })
  for (const c of rows.commits)
    m.set(c.id, {
      id: c.id,
      at: c.at,
      kind: c.project.toUpperCase(),
      text: c.message,
      value: '',
    })
  return m
}

export function PeriodBadges({
  period,
  rows,
  children,
}: {
  period: Period
  rows?: AskRows
  children?: React.ReactNode
}) {
  const n = rows ? rows.logs.length + rows.commits.length : null
  return (
    <div className="r7-per">
      <span className="ask-kind">🗓️ {period.title}</span>
      <span className="ins-badge dim">{period.range}</span>
      {n !== null ? (
        <span data-testid="rows-count" className="ins-badge lav">
          {n} ROWS
        </span>
      ) : null}
      {children}
    </div>
  )
}

const STRIP_DAYS = 62

const LEGEND: Record<string, string> = {
  projects: 'PROJECTS',
  money: 'MONEY',
  task: 'TASKS',
}

export function Strip({
  rows,
  period,
  pick,
  labels = {},
}: {
  rows: AskRows
  period: Period
  pick?: string | null
  labels?: Record<string, string>
}) {
  const days = dayAreas(rows, period)
  if (days.length > STRIP_DAYS) return null
  const areas = [...new Set(days.flatMap((d) => d.areas))].sort()
  return (
    <>
      <div
        data-testid="rows-strip"
        className={`r7-strip ${pick ? 'pick' : ''}`}
        style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
      >
        {days.map((d, i) => (
          <div
            key={i}
            className={`r7-day ${d.day % 7 === 1 ? 'wk' : ''}`}
            data-areas={d.areas.join(' ')}
          >
            <div className="dots">
              {d.areas.map((a) => (
                <span
                  key={a}
                  className={pick === a ? 'sel' : ''}
                  style={
                    { '--c': areaColour(a), '--d': i } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <b>{d.day % 7 === 1 || i === days.length - 1 ? d.day : ''}</b>
          </div>
        ))}
      </div>
      {areas.length > 0 ? (
        <div data-testid="rows-legend" className="r7-legend">
          {areas.map((a) => (
            <span
              key={a}
              style={{ '--c': areaColour(a) } as React.CSSProperties}
            >
              {LEGEND[a] ?? (labels[a] ?? a).toUpperCase()}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}

function asNumber(value: string): { n: number; cur: boolean } | null {
  const cur = value.startsWith('€')
  const n = Number((cur ? value.slice(1) : value).replace(/,/g, ''))
  return Number.isFinite(n) ? { n, cur } : null
}

function Big({ value }: { value: string }) {
  const v = asNumber(value)
  if (!v) return <>{value}</>
  return v.cur ? (
    <>
      <small>€</small>
      <CountUp value={v.n} format={(x) => eur(x).slice(1)} />
    </>
  ) : (
    <CountUp value={v.n} format={(x) => String(Math.round(x))} />
  )
}

function RowsList({ f, byId }: { f: RowFact; byId: Map<string, Row> }) {
  const list = f.ids
    .map((id) => byId.get(id))
    .filter((r): r is Row => r !== undefined)
    .sort((a, b) => a.at - b.at)
  return (
    <div
      data-testid="rows-list"
      className="r7-list"
      style={{ '--c': areaColour(f.area) } as React.CSSProperties}
    >
      <div className="hd">
        {factIcon(f.key)} {f.label}
        <span className="grow" />
        <span>
          {list.length} {list.length === 1 ? 'ROW' : 'ROWS'}
          {f.value !== String(list.length) ? ` · ${f.value}` : ''}
        </span>
      </div>
      <div className="sc">
        {list.map((r, i) => (
          <div
            key={r.id}
            data-testid="rows-row"
            className="r7-row"
            style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
          >
            <span className="d">{day(r.at)}</span>
            <span className="k">{r.kind}</span>
            <span className="t">{r.text}</span>
            <span className="v">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RowsAnswer({ t }: { t: RowsTurn }) {
  const a = t.answer!
  const facts = t.facts ?? []
  const rows = t.rows!
  const byKey = new Map(facts.map((f) => [f.key, f]))
  const byId = rowsById(rows)
  const [pick, setPick] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  /* Opened rows come into view once they have unfolded. */
  useEffect(() => {
    if (!pick) return
    const timer = setTimeout(
      () =>
        list.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      360,
    )
    return () => clearTimeout(timer)
  }, [pick])
  const picked = pick ? byKey.get(pick) : undefined
  const toggle = (k: string) => setPick((p) => (p === k ? null : k))
  const tiles = a.tiles.map((k) => byKey.get(k)).filter((f) => f !== undefined)
  const s = t.stamp
  const n = rows.logs.length + rows.commits.length

  const copyText = () =>
    [
      `Q: ${t.question}`,
      `${t.period.title} · ${t.period.range} · ${n} ROWS`,
      a.headline,
      ...tiles.map((f) => `${f.label} ${f.value}`),
      ...a.lines.map(
        (l) =>
          `${LINE[l.area].e} ${l.text}${l.factKeys.length ? ` (${l.factKeys.map((k) => `${byKey.get(k)!.label} ${byKey.get(k)!.value}`).join(' · ')})` : ''}`,
      ),
      s ? `✦ ${modelWord(s.model)} · ${day(t.at)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
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
      data-testid="rows-answer"
      className="ask-a land"
      style={{ '--k': 'var(--color-lav-400)' } as React.CSSProperties}
    >
      <span className="ask-orb">
        <Star />
      </span>
      <div className="body">
        <PeriodBadges period={t.period} rows={rows}>
          <span className="r7-copy">
            <CopyPill text={copyText} onCopied={glow} />
          </span>
        </PeriodBadges>
        <Strip
          rows={rows}
          period={t.period}
          pick={picked ? picked.area : null}
          labels={t.labels}
        />
        {a.headline ? (
          <p data-testid="rows-headline" className="r7-head">
            {a.headline}
          </p>
        ) : null}
        {tiles.length > 0 ? (
          <div className="r7-tiles">
            {tiles.map((f, i) => (
              <button
                key={f.key}
                type="button"
                data-testid="rows-tile"
                data-key={f.key}
                aria-expanded={pick === f.key}
                className={`r7-tile ${pick === f.key ? 'on' : ''}`}
                style={
                  { '--c': areaColour(f.area), '--i': i } as React.CSSProperties
                }
                onClick={() => toggle(f.key)}
              >
                <span className="top">
                  <i>{factIcon(f.key)}</i>
                  <b>{f.label}</b>
                  <em>›</em>
                </span>
                <span className="n">
                  <Big value={f.value} />
                </span>
                {f.sub ? <span className="s">{f.sub}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        <div ref={list} className={`r7-rows ${picked ? 'open' : ''}`}>
          <div>{picked ? <RowsList f={picked} byId={byId} /> : null}</div>
        </div>
        <div className="r7-lines">
          {a.lines.map((l, i) => (
            <div
              key={i}
              data-testid="rows-line"
              data-area={l.area}
              className="r7-line"
              style={
                {
                  '--c': l.factKeys[0]
                    ? areaColour(byKey.get(l.factKeys[0])!.area)
                    : LINE[l.area].c,
                  '--i': i,
                } as React.CSSProperties
              }
            >
              <i>{LINE[l.area].e}</i>
              <div>
                <p>{l.text}</p>
                {l.factKeys.length > 0 || l.stray ? (
                  <div className="ask-facts">
                    {l.factKeys.map((k) => {
                      const f = byKey.get(k)!
                      return (
                        <button
                          key={k}
                          type="button"
                          data-testid="rows-fact"
                          className={`r7-fact ${pick === k ? 'on' : ''}`}
                          style={
                            { '--c': areaColour(f.area) } as React.CSSProperties
                          }
                          onClick={() => toggle(k)}
                        >
                          {f.label} <b>{f.value}</b>
                        </button>
                      )
                    })}
                    {l.stray ? (
                      <span data-testid="rows-stray" className="ins-badge warn">
                        ❔ NUMBER NOT IN ROWS
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {s ? (
          <div data-testid="rows-stamp" className="ask-stamp">
            <span className="ask-pill m">✦ {modelWord(s.model)}</span>
            <span className="ask-pill">{n} ROWS</span>
            <span className="ask-pill">
              {tokens(s.inputTokens)} IN · {tokens(s.outputTokens)} OUT
            </span>
            {s.paidBy === 'pro' ? (
              <span className="ask-pill g">⚡ PRO · $0.00</span>
            ) : (
              <span className="ask-pill c">💳 {usd(s.cost)}</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
