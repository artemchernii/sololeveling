import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Veiled } from '@/components/finances/Veil'
import {
  accountLines,
  firstDay,
  joinGroups,
  laneClusters,
  layout,
  niceStep,
  stackBands,
  stackOrder,
} from '@/lib/accountLines'
import { euros } from '@/lib/money'
import { useVeil } from '@/lib/veil'

/* ACCOUNTS (3 Oct): one line per account on Overview's chart, as
   design/treasury-mockup/accounts-chart.html draws it. Spec:
   docs/specs/2026-10-03-chart-by-account.md. An account new in the range
   is a pin on the right, not the scale; who joined and what moved sit in
   a lane under the plot; the list beside it is each account now — or, on
   hover, that day; tapping a point opens that day's rows. Everything is
   aggregate.worthHistory's own per-account series, added up per account. */

type History = FunctionReturnType<typeof api.aggregate.worthHistory>
type AccountId = Id<'accounts'>

const LINE_TOKENS: Record<string, string> = {
  bpi: '--line-bpi',
  revolut: '--line-revolut',
  activo: '--line-activo',
  'trade-republic': '--line-trade-republic',
  'trading-212': '--line-trading-212',
}
const SPARES = ['--line-1', '--line-2', '--line-3', '--line-4']

/** Its bank's own hue where the catalogue knows the bank; cash in the
    money colour; a spare for the rest, by its place in his list. */
function colourOf(a: Doc<'accounts'>, i: number): string {
  if (a.kinds.includes('cash') && !a.kinds.includes('bank'))
    return 'var(--line-cash)'
  const t = a.institution ? LINE_TOKENS[a.institution] : undefined
  return `var(${t ?? SPARES[i % SPARES.length]})`
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})
const short = (t: number) => DATE.format(new Date(t))
const kindOf = (a: Doc<'accounts'>) =>
  a.kinds.length === 1 && a.kinds[0] === 'cash' ? 'notes' : a.kinds.join(' · ')

const H = 340
const T = 14
const R = 72
const L = 4
const LANE = 26
const B = 22
/* Two events closer than this share one dot in the lane. */
const LANE_GAP = 22

export type AccountsMode = 'bands' | 'lines'

export function AccountsChart({
  history,
  dayEnds,
  days,
  rangeLabel,
  mode,
}: {
  history: History
  dayEnds: ReadonlyArray<number>
  days: number
  rangeLabel: string
  /* Stacked bands by default (his pick "A", 3 Oct); lines to compare
     accounts on their own — a toggle beside the ranges. */
  mode: AccountsMode
}) {
  const accounts = useQuery(api.accounts.list, {})
  const { shown } = useVeil()
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(760)
  /* Lines start without Cash: it never moves, and it lies across the
     others at €5,000. Bands show everything — they never cross. */
  const [hiddenBands, setHiddenBands] = useState<ReadonlySet<AccountId>>(
    new Set(),
  )
  const [hiddenLines, setHiddenLines] = useState<ReadonlySet<AccountId> | null>(
    null,
  )
  const [hover, setHover] = useState<number | null>(null)
  const [hot, setHot] = useState<AccountId | null>(null)
  const [tap, setTap] = useState<{ id: AccountId; i: number } | null>(null)

  useEffect(() => {
    if (!box.current) return
    const o = new ResizeObserver(([e]) =>
      setW(Math.max(280, e.contentRect.width)),
    )
    o.observe(box.current)
    return () => o.disconnect()
  }, [])

  const from = Math.max(0, dayEnds.length - days)
  const lines = useMemo(
    () => accountLines(history.cashAccounts, history.investedAccounts),
    [history],
  )
  const live = (accounts ?? []).filter((a) =>
    lines.some((l) => l.accountId === a._id && firstDay(l.values) !== null),
  )
  const cashIds = live
    .filter((a) => a.kinds.includes('cash') && !a.kinds.includes('bank'))
    .map((a) => a._id)
  const hidden =
    mode === 'bands' ? hiddenBands : (hiddenLines ?? new Set(cashIds))
  const setHidden = (next: ReadonlySet<AccountId>) => {
    if (mode === 'bands') setHiddenBands(next)
    else setHiddenLines(next)
  }
  const colour = new Map(live.map((a, i) => [a._id, colourOf(a, i)]))
  const valuesOf = (id: AccountId) =>
    lines.find((l) => l.accountId === id)?.values ?? []
  const shownLines = lines.filter(
    (l) => !hidden.has(l.accountId) && colour.has(l.accountId),
  )
  const lay = layout(shownLines, from)
  const n = dayEnds.length - 1

  /* Bands: steadiest at the bottom; the top edge is the total. */
  const order = stackOrder(
    shownLines.filter((l) => lay.lined.includes(l.accountId)),
  )
  const bands = stackBands(shownLines, order)
  const topOfStack = order.length
    ? Math.max(
        ...Array.from(
          { length: n - from + 1 },
          (_, k) => bands.get(order[order.length - 1])?.[from + k]?.[1] ?? 0,
        ),
      )
    : 0
  const step =
    mode === 'bands' && order.length ? niceStep(topOfStack) : lay.step
  const top = step * 4
  const PB = H - B - LANE
  const x = (i: number) =>
    L + ((i - from) / Math.max(1, n - from)) * (W - L - R)
  const y = (v: number) => T + (1 - Math.min(v, top) / top) * (PB - T)
  const indexAt = (t: number) => {
    const i = dayEnds.findIndex((e) => e >= t)
    return i < 0 ? n : i
  }

  if (accounts === undefined) return <div className="h-[340px]" />
  if (live.length === 0)
    return (
      <div className="grid h-[340px] place-items-center px-6 text-center text-[13.5px] text-ink-400">
        <span>
          <b className="mb-1 block text-[15px] font-normal text-foreground">
            No accounts yet
          </b>
          Each account you add draws its own line here. Press ADD, or drop a
          statement.
        </span>
      </div>
    )

  /* The lane: who joined and what moved, as quiet dots; the words on
     hover (3 Oct: labels on his data were a smear). */
  const nameOf = (id: AccountId) => live.find((a) => a._id === id)?.name ?? ''
  const joins = joinGroups(
    lay.lined.flatMap((id) => {
      const f = firstDay(valuesOf(id))
      return f !== null && f > from ? [{ accountId: id, at: dayEnds[f] }] : []
    }),
  )
  const moves = history.moves.filter(
    (m) =>
      indexAt(m.at) >= from &&
      lay.lined.includes(m.from) &&
      lay.lined.includes(m.to),
  )
  const events = [
    ...joins.map((j) => ({
      at: j.at,
      move: false,
      colours: j.accountIds.map((id) => colour.get(id) ?? ''),
      text: `${j.accountIds.map(nameOf).join(', ')} joined`,
    })),
    ...moves.map((m) => ({
      at: m.at,
      move: true,
      colours: [colour.get(m.from) ?? '', colour.get(m.to) ?? ''],
      text: `${euros(m.amount)} ${nameOf(m.from)} → ${nameOf(m.to)}`,
    })),
  ].sort((a, b) => a.at - b.at)
  const marks = laneClusters(
    events.map((e) => x(indexAt(e.at))),
    LANE_GAP,
  ).map((members) => {
    const list = members.map((i) => events[i])
    return {
      at: list[0].at,
      move: list.every((e) => e.move),
      colour: list[0].colours[0],
      count: list.length,
      title: list.map((e) => `${short(e.at)} — ${e.text}`).join('\n'),
    }
  })

  /* Steps: a balance jumps on the day, it does not slide between days. */
  const stepPath = (pts: ReadonlyArray<[number, number]>) => {
    let d = ''
    pts.forEach(([i, v], k) => {
      d += `${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      const next = pts[k + 1] as [number, number] | undefined
      if (next) d += `L${x(next[0]).toFixed(1)},${y(v).toFixed(1)}`
    })
    return d
  }
  const pointsOf = (id: AccountId): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    const vals = valuesOf(id)
    for (let i = from; i <= n; i++) {
      const v = vals[i]
      if (v !== null) out.push([i, v])
    }
    return out
  }
  const bandPath = (id: AccountId) => {
    const b = bands.get(id) ?? []
    const vals = valuesOf(id)
    const idx: Array<number> = []
    for (let i = from; i <= n; i++) if (vals[i] !== null) idx.push(i)
    if (idx.length === 0) return { area: '', edge: '' }
    const upper = stepPath(idx.map((i) => [i, b[i][1]]))
    let lower = ''
    for (let k = idx.length - 1; k >= 0; k--) {
      const i = idx[k]
      const nextX = k < idx.length - 1 ? x(idx[k + 1]) : x(i)
      lower += `L${nextX.toFixed(1)},${y(b[i][0]).toFixed(1)}L${x(i).toFixed(1)},${y(b[i][0]).toFixed(1)}`
    }
    return { area: `${upper}${lower}Z`, edge: upper }
  }

  const iAt = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect()
    const px = ((clientX - r.left) / r.width) * W
    return Math.max(
      from,
      Math.min(n, Math.round(from + ((px - L) / (W - L - R)) * (n - from))),
    )
  }
  const pick = (i: number, py: number): AccountId | null => {
    if (mode === 'bands') {
      for (const id of order) {
        const b = bands.get(id)?.[i]
        if (b && b[1] > b[0] && py <= y(b[0]) && py >= y(b[1])) return id
      }
      return null
    }
    let best: { id: AccountId; d: number } | null = null
    for (const id of lay.lined) {
      const v = valuesOf(id)[i]
      if (v === null) continue
      const d = Math.abs(y(v) - py)
      if (!best || d < best.d) best = { id, d }
    }
    return best && best.d < 40 ? best.id : null
  }
  const lit = hot ?? tap?.id ?? null
  const tapY =
    tap === null
      ? null
      : mode === 'bands'
        ? (bands.get(tap.id)?.[tap.i]?.[1] ?? null)
        : valuesOf(tap.id)[tap.i]

  const ticks = days > 200 ? 6 : 4
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
      <div ref={box} className="relative min-w-0">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className={`block overflow-visible transition-[filter] ${shown ? '' : 'blur-[8px]'}`}
          onMouseMove={(e) => setHover(iAt(e.clientX, e.currentTarget))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const i = iAt(e.clientX, e.currentTarget)
            const r = e.currentTarget.getBoundingClientRect()
            const id = pick(i, ((e.clientY - r.top) / r.height) * H)
            setTap(id === null ? null : { id, i })
          }}
          role="img"
          aria-label="Each account's balance per day"
        >
          <defs>
            {lay.lined.map((id) => (
              <linearGradient
                key={id}
                id={`fill-${id}`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  offset="0"
                  style={{ stopColor: colour.get(id), stopOpacity: 0.22 }}
                />
                <stop
                  offset="1"
                  style={{ stopColor: colour.get(id), stopOpacity: 0 }}
                />
              </linearGradient>
            ))}
          </defs>
          {[0, 1, 2, 3, 4].map((k) => (
            <g key={k}>
              <line
                x1={L}
                x2={W - R}
                y1={y(step * k)}
                y2={y(step * k)}
                className="stroke-lift/5"
              />
              <text
                x={W - R + 8}
                y={y(step * k) + 4}
                className="fill-ink-500 font-mono text-[10.5px]"
              >
                {euros(step * k)}
              </text>
            </g>
          ))}
          {Array.from({ length: ticks + 1 }, (_, k) => {
            const i = Math.round(from + ((n - from) * k) / ticks)
            return (
              <text
                key={k}
                x={x(i)}
                y={H - 5}
                textAnchor={k === 0 ? 'start' : k === ticks ? 'end' : 'middle'}
                className="fill-ink-500 font-mono text-[10.5px]"
              >
                {short(dayEnds[i])}
              </text>
            )
          })}

          {mode === 'bands'
            ? order.map((id) => {
                const { area, edge } = bandPath(id)
                const c = colour.get(id)
                const dim = lit !== null && lit !== id
                return (
                  <g key={id} className="motion-land transition-opacity">
                    <path
                      d={area}
                      style={{
                        fill: c,
                        opacity: dim ? 0.1 : lit === id ? 0.72 : 0.42,
                      }}
                      className="transition-opacity"
                    />
                    <path
                      d={edge}
                      fill="none"
                      strokeWidth={1.6}
                      style={{ stroke: c, opacity: dim ? 0.2 : 1 }}
                    />
                  </g>
                )
              })
            : lay.lined.map((id) => {
                const pts = pointsOf(id)
                const d = stepPath(pts)
                const c = colour.get(id)
                const dim = lit !== null && lit !== id
                const first = pts[0] as [number, number] | undefined
                const last = pts.at(-1)
                return (
                  <g key={id} className="motion-land">
                    {first && last ? (
                      <path
                        d={`${d}L${x(last[0])},${y(0)}L${x(first[0])},${y(0)}Z`}
                        fill={`url(#fill-${id})`}
                        style={{ opacity: dim ? 0.1 : 1 }}
                      />
                    ) : null}
                    <path
                      d={d}
                      fill="none"
                      strokeWidth={lit === id ? 2.6 : 1.8}
                      strokeLinejoin="round"
                      style={{ stroke: c, opacity: dim ? 0.18 : 1 }}
                    />
                    {last ? (
                      <circle
                        cx={x(last[0])}
                        cy={y(last[1])}
                        r={3.5}
                        style={{ fill: c, opacity: dim ? 0.2 : 1 }}
                      />
                    ) : null}
                  </g>
                )
              })}

          {lay.pinned.map((id, k) => {
            const v = valuesOf(id)[n] ?? 0
            const over = mode === 'bands' || v > top
            const py = over ? T + 2 + k * 16 : y(v)
            return (
              <g key={id}>
                <circle
                  cx={W - R}
                  cy={py}
                  r={4.5}
                  style={{ fill: colour.get(id) }}
                />
                <text
                  x={W - R - 10}
                  y={py + 3.5}
                  textAnchor="end"
                  className="font-mono text-[10px] tracking-[0.08em] uppercase"
                  style={{ fill: colour.get(id) }}
                >
                  {v > top ? '▲ ' : ''}
                  {nameOf(id)} {euros(Math.round(v))} · new today
                </text>
              </g>
            )
          })}

          <line
            x1={L}
            x2={W - R}
            y1={PB + 6}
            y2={PB + 6}
            className="stroke-lift/8"
          />
          {marks.map((m, k) => {
            const mx = x(indexAt(m.at))
            return (
              <g key={k} className="cursor-default">
                <title>{m.title}</title>
                <circle
                  cx={mx}
                  cy={PB + 16}
                  r={m.count > 1 ? 6 : 4}
                  strokeWidth={1.4}
                  style={{
                    stroke: m.colour,
                    fill: m.move ? 'transparent' : m.colour,
                  }}
                />
                {m.count > 1 ? (
                  <text
                    x={mx}
                    y={PB + 19}
                    textAnchor="middle"
                    className="fill-ink-200 font-mono text-[8.5px]"
                  >
                    {m.count}
                  </text>
                ) : null}
              </g>
            )
          })}

          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={T}
              y2={PB}
              className="stroke-lift/25"
            />
          ) : null}
          {tap !== null && tapY !== null ? (
            <circle
              cx={x(tap.i)}
              cy={y(tapY)}
              r={6}
              fill="none"
              strokeWidth={2}
              style={{ stroke: colour.get(tap.id) }}
            />
          ) : null}
        </svg>
        {tap !== null ? (
          <DayRows
            accountId={tap.id}
            name={nameOf(tap.id)}
            dayStart={(dayEnds[tap.i - 1] ?? dayEnds[tap.i] - 86_400_000) + 1}
            dayEnd={dayEnds[tap.i]}
            before={valuesOf(tap.id)[tap.i - 1] ?? null}
            after={valuesOf(tap.id)[tap.i] ?? null}
            onClose={() => setTap(null)}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="px-2.5 pb-1.5 font-mono text-[10.5px] tracking-[0.16em] text-ink-500 uppercase">
          {hover === null
            ? `accounts · ${rangeLabel}`
            : DATE.format(new Date(dayEnds[hover]))}
        </span>
        {live.map((a) => {
          const vals = valuesOf(a._id)
          const at = hover ?? n
          const here = vals[at] ?? null
          const f = firstDay(vals)
          const start = vals[from] ?? null
          const off = hidden.has(a._id)
          let note: string
          let tone = 'text-ink-500'
          if (here === null)
            note = f === null ? '' : `from ${short(dayEnds[f])}`
          else if (f !== null && f > from)
            note = f === n ? 'new today' : `joined ${short(dayEnds[f])}`
          else if (start !== null) {
            const ch = Math.round((here - start) * 100) / 100
            tone =
              ch > 0
                ? 'text-state-good'
                : ch < 0
                  ? 'text-state-danger'
                  : 'text-ink-500'
            note = `${ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : ''}${euros(Math.abs(Math.round(ch)))}`
          } else note = ''
          return (
            <button
              key={a._id}
              type="button"
              onMouseEnter={() => setHot(a._id)}
              onMouseLeave={() => setHot(null)}
              onClick={() => {
                const next = new Set(hidden)
                if (off) next.delete(a._id)
                else next.add(a._id)
                setHidden(next)
                setTap(null)
              }}
              aria-pressed={!off}
              className={`motion-press grid grid-cols-[10px_1fr_auto] items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left ring-1 ring-transparent transition ring-inset hover:bg-lift/[0.04] hover:ring-lift/10 ${off ? 'opacity-40' : ''}`}
            >
              <span
                className={`size-2.5 ${mode === 'bands' ? 'rounded-[3px]' : 'rounded-full'}`}
                style={
                  off
                    ? { boxShadow: `inset 0 0 0 1.5px ${colour.get(a._id)}` }
                    : { background: colour.get(a._id) }
                }
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13.5px] text-foreground">
                  {a.name}
                </span>
                <span className="font-mono text-[10px] tracking-[0.06em] text-ink-500">
                  {kindOf(a)}
                </span>
              </span>
              <span className="flex flex-col items-end font-mono">
                <span className="text-[13.5px] text-foreground">
                  {here === null ? (
                    '—'
                  ) : (
                    <Veiled>{euros(Math.round(here))}</Veiled>
                  )}
                </span>
                <span className={`text-[11px] ${tone}`}>
                  {note.startsWith('▲') || note.startsWith('▼') ? (
                    <Veiled>{note}</Veiled>
                  ) : (
                    note
                  )}
                </span>
              </span>
            </button>
          )
        })}
        <span className="mt-1 flex justify-between border-t border-lift/8 px-2.5 pt-2.5 font-mono text-[12px] text-ink-300">
          <span>all accounts</span>
          <Veiled>
            {euros(
              live.reduce((t, a) => t + (valuesOf(a._id)[hover ?? n] ?? 0), 0),
            )}
          </Veiled>
        </span>
        {live.length === 1 ? (
          <span className="px-2.5 pt-2 font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase">
            the others draw here as you add them
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* The rows behind a tapped point: that account's rows that day, from its
   own sheet — the same rows that made the line. */
function DayRows({
  accountId,
  name,
  dayStart,
  dayEnd,
  before,
  after,
  onClose,
}: {
  accountId: AccountId
  name: string
  dayStart: number
  dayEnd: number
  before: number | null
  after: number | null
  onClose: () => void
}) {
  const sheet = useQuery(api.aggregate.accountSheet, { accountId })
  const rows = (sheet?.rows ?? []).filter(
    (r) => r.at >= dayStart && r.at <= dayEnd,
  )
  const moved = rows.some((r) => r.kind === 'move' && r.other !== null)
  return (
    <div className="system-frame motion-arrive absolute top-2 right-2 z-10 flex bg-popover shadow-2xl w-[320px] max-w-[calc(100%-16px)] flex-col gap-3 rounded-[18px] p-4">
      <div className="flex items-center justify-between">
        <span className="system-title min-w-0 truncate font-mono text-[11px] tracking-[0.2em] whitespace-nowrap uppercase">
          [ {name} · {short(dayEnd)} ]
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-7 place-items-center rounded-full text-ink-300 ring-1 ring-lift/14 ring-inset hover:text-foreground"
        >
          ✕
        </button>
      </div>
      {after !== null ? (
        <span className="font-mono text-[12px] text-ink-400">
          <Veiled>
            {before !== null ? `${euros(before)} → ` : ''}
            <span className="text-foreground">{euros(after)}</span>
          </Veiled>{' '}
          at the day's end
        </span>
      ) : null}
      {sheet === undefined ? null : rows.length === 0 ? (
        <span className="text-[13px] text-ink-400">
          No rows that day — the line moved with its prices, or a balance was
          read.
        </span>
      ) : (
        <div className="flex flex-col">
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_auto] gap-2 border-b border-lift/5 py-2 text-[13px] last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-foreground">{r.text}</span>
                <span className="font-mono text-[10px] tracking-[0.06em] text-ink-500">
                  {r.kind === 'move'
                    ? `your move${r.other ? ` · ${r.amount < 0 ? 'to' : 'from'} ${r.other}` : ''}`
                    : (r.category ?? r.kind)}
                </span>
              </span>
              <span
                className={`font-mono ${r.amount > 0 ? 'text-state-good' : 'text-foreground'}`}
              >
                <Veiled>
                  {r.amount < 0 ? '−' : '+'}
                  {euros(Math.abs(r.amount))}
                </Veiled>
              </span>
            </div>
          ))}
        </div>
      )}
      {moved ? (
        <span className="self-start rounded-full bg-lift/[0.05] px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-ink-400 uppercase">
          a move between your accounts — the total did not change
        </span>
      ) : null}
    </div>
  )
}
