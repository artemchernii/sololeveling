import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { IChartApi, Logical } from 'lightweight-charts'

import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import type { Main, View } from '@/components/finances/chartSeries'
import { between, ruler } from '@/lib/priceChart'
import type { Pt } from '@/lib/priceChart'

export type Tool = 'compare' | 'ruler'
/** What a tool measured: two days, two prices, the difference. */
export type Measured =
  | ({ kind: 'compare' } & ReturnType<typeof between>)
  | ({ kind: 'ruler' } & ReturnType<typeof ruler>)

const TOOLS: ReadonlyArray<{ id: Tool; icon: string }> = [
  {
    id: 'compare',
    icon: 'M5 4v16M19 4v16M9 12h6M9 12l2-2M9 12l2 2M15 12l-2-2M15 12l-2 2',
  },
  { id: 'ruler', icon: 'M4 19 20 5' },
]

/** "+$28 · ▲ 29.2%" — the difference as the line of words and the
    ruler's own label say it. */
export const change = (
  m: { diff: number; pct: number },
  say: (v: number) => string,
) =>
  `${m.diff >= 0 ? '+' : '−'}${say(Math.abs(m.diff))} · ${m.diff >= 0 ? '▲' : '▼'} ${Math.abs(m.pct).toFixed(1)}%`

export const daysBetween = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/* The two buttons beside "price". A tool takes the pointer only while
   its button is lit; pressed again, a drag moves the chart as before. */
export function ToolPills({
  tool,
  onTool,
}: {
  tool: Tool | null
  onTool: (tool: Tool | null) => void
}) {
  return (
    <div className="flex gap-1.5">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={tool === t.id}
          onClick={() => onTool(tool === t.id ? null : t.id)}
          className={`${tool === t.id ? PILL_LOUD : PILL_QUIET} inline-flex items-center gap-1.5`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className={`size-[13px] fill-none stroke-current stroke-2 ${tool === t.id ? 'animate-pulse' : ''}`}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {t.id === 'ruler' ? (
              <rect
                x="4"
                y="5"
                width="16"
                height="14"
                rx="2"
                strokeDasharray="3 3"
              />
            ) : null}
            <path d={t.icon} />
          </svg>
          {t.id}
        </button>
      ))}
    </div>
  )
}

/* Line or candles, and volume (13 Oct, chart.html) — each offered only
   where the stored days can be drawn that way: a pill that would draw
   nothing is not shown. */
export function ViewPills({
  can,
  view,
  onView,
  volume,
  onVolume,
}: {
  can: { candles: boolean; volume: boolean }
  view: View
  onView: (view: View) => void
  volume: boolean
  onVolume: (on: boolean) => void
}) {
  if (!can.candles && !can.volume) return null
  return (
    <div className="flex gap-1.5">
      {can.candles
        ? (['line', 'candles'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onView(v)}
              className={view === v ? PILL_LOUD : PILL_QUIET}
            >
              {v}
            </button>
          ))
        : null}
      {can.volume ? (
        <button
          type="button"
          aria-pressed={volume}
          onClick={() => onVolume(!volume)}
          className={volume ? PILL_LOUD : PILL_QUIET}
        >
          volume
        </button>
      ) : null}
    </div>
  )
}

type Shape = { kind: Tool; a: number; b: number; p0: number; p1: number }

/* The layer the tools draw on, above the chart's own canvases. Compare
   is a band between two days on the line; the ruler is a rectangle from
   any point to any point. One shape, moved once a frame — never rebuilt
   while the pointer drags (13 Oct: "a bit luggy"). It is kept in days
   and prices, so it stays in place when the chart is resized or a range
   is pressed. Dotted lavender, never the line's green on green. */
export function ToolLayer({
  tool,
  chart,
  line,
  pts,
  say,
  onPoint,
  onRead,
}: {
  tool: Tool | null
  chart: RefObject<IChartApi | null>
  line: RefObject<Main | null>
  pts: ReadonlyArray<Pt>
  say: (v: number) => string
  /** The day pressed, before anything is measured. */
  onPoint: (i: number | null) => void
  onRead: (m: Measured | null) => void
}) {
  const layer = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const tag = useRef<HTMLSpanElement>(null)
  /* The page hands new ones on every render; a drag reads the latest. */
  const live = useRef({ pts, say, onPoint, onRead })
  useEffect(() => {
    live.current = { pts, say, onPoint, onRead }
  })

  useEffect(() => {
    const el = layer.current
    const rect = box.current
    const words = tag.current
    const c = chart.current
    if (!tool || !el || !rect || !words || !c) return
    const scale = c.timeScale()
    let shape: Shape | null = null
    let from: { i: number; p: number } | null = null
    let last: { x: number; y: number } | null = null
    let label = ''
    let due = false
    let gone = false

    const dayAt = (x: number) =>
      Math.max(
        0,
        Math.min(
          live.current.pts.length - 1,
          Math.round(scale.coordinateToLogical(x) ?? 0),
        ),
      )
    const measure = ({ x, y }: { x: number; y: number }) => {
      if (!from) return
      const { pts: days, onRead: read, say: money } = live.current
      const i = dayAt(x)
      if (tool === 'compare') {
        shape = {
          kind: tool,
          a: Math.min(from.i, i),
          b: Math.max(from.i, i),
          p0: 0,
          p1: 0,
        }
        read(
          from.i === i
            ? null
            : { kind: 'compare', ...between(days[from.i], days[i]) },
        )
        return
      }
      const p1 = line.current?.coordinateToPrice(y) ?? null
      if (p1 === null) return
      const m = ruler({ t: days[from.i].t, v: from.p }, { t: days[i].t, v: p1 })
      shape = { kind: tool, a: from.i, b: i, p0: from.p, p1 }
      label = `${change(m, money)} · ${daysBetween(m.days)}`
      read({ kind: 'ruler', ...m })
    }
    const draw = () => {
      const band = shape?.kind === 'compare'
      const a = shape ? scale.logicalToCoordinate(shape.a as Logical) : null
      const b = shape ? scale.logicalToCoordinate(shape.b as Logical) : null
      const y0 = band
        ? 0
        : (line.current?.priceToCoordinate(shape?.p0 ?? 0) ?? null)
      const y1 = band
        ? el.clientHeight - scale.height()
        : (line.current?.priceToCoordinate(shape?.p1 ?? 0) ?? null)
      if (!shape || a === null || b === null || y0 === null || y1 === null) {
        rect.style.display = 'none'
        return
      }
      rect.style.display = 'block'
      rect.style.transform = `translate(${Math.min(a, b)}px,${Math.min(y0, y1)}px)`
      rect.style.width = `${Math.abs(b - a)}px`
      rect.style.height = `${Math.abs(y1 - y0)}px`
      rect.style.borderBlockWidth = band ? '0' : ''
      words.style.display = band ? 'none' : ''
      if (!band && words.textContent !== label) words.textContent = label
    }
    const soon = () => {
      if (due) return
      due = true
      requestAnimationFrame(() => {
        due = false
        if (gone) return
        if (last) measure(last)
        draw()
      })
    }
    const where = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const clear = () => {
      shape = null
      from = null
      last = null
      live.current.onRead(null)
      live.current.onPoint(null)
      soon()
    }
    const down = (e: PointerEvent) => {
      const at = where(e)
      const p = line.current?.coordinateToPrice(at.y) ?? null
      if (p === null) return
      clear()
      from = { i: dayAt(at.x), p }
      el.setPointerCapture(e.pointerId)
      live.current.onPoint(from.i)
    }
    const move = (e: PointerEvent) => {
      if (!from) return
      last = where(e)
      soon()
    }
    const up = () => {
      if (last) measure(last)
      from = null
      last = null
      soon()
    }
    /* The wheel still zooms with a tool lit: it is handed to the
       chart under the layer, and what was measured follows. */
    const wheel = (e: WheelEvent) => {
      const under = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((n) => n instanceof HTMLCanvasElement)
      if (!under) return
      e.preventDefault()
      under.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaMode: e.deltaMode,
          clientX: e.clientX,
          clientY: e.clientY,
          ctrlKey: e.ctrlKey,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    const sized = new ResizeObserver(soon)
    sized.observe(el)
    scale.subscribeVisibleLogicalRangeChange(soon)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', esc)
    return () => {
      gone = true
      sized.disconnect()
      scale.unsubscribeVisibleLogicalRangeChange(soon)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', esc)
      rect.style.display = 'none'
      live.current.onRead(null)
      live.current.onPoint(null)
    }
  }, [tool, chart, line])

  return (
    <div
      ref={layer}
      className={`absolute inset-0 z-[5] touch-pan-y select-none ${tool ? 'cursor-crosshair' : 'pointer-events-none'}`}
    >
      <div
        ref={box}
        data-testid="tool-shape"
        style={{ display: 'none' }}
        className="absolute top-0 left-0 rounded-[4px] border-[1.5px] border-dotted border-lav-400 bg-lav-400/13 will-change-transform"
      >
        <span
          ref={tag}
          className="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 rounded-lg bg-popover px-[9px] py-1 font-mono text-[11.5px] whitespace-nowrap text-foreground shadow-lg ring-1 ring-lav-400/55 ring-inset"
        />
      </div>
    </div>
  )
}
