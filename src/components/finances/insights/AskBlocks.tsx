import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { AskChart, AskTable } from '@/lib/marketAsk'
import { changeWord, dayWord } from './parts'

/* ASK's blocks beside its words (IDEAS, 29 Oct; mockup
   design/treasury-mockup/ideas-board.html): a chart the app draws from
   closes it fetches when the answer lands — never the model's numbers —,
   a small table, and the screenshot chip. Nothing here is stored. */

/** ✦ drawn, not typed: the glyph sits off-centre in a circle. */
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

/** A dropped image as a JPEG data URL, its long side at most 1600 px. */
export async function readShot(
  f: File,
): Promise<{ url: string; name: string } | null> {
  try {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
    return { url: c.toDataURL('image/jpeg', 0.85), name: f.name || 'image' }
  } catch {
    return null
  }
}

export function ShotChip({
  shot,
  onRemove,
}: {
  shot: { url: string; name: string }
  onRemove?: () => void
}) {
  return (
    <span data-testid="ask-shot" className="ask-shot">
      <img src={shot.url} alt="" />
      <span className="label-caps">{shot.name.slice(0, 24)}</span>
      {onRemove ? (
        <button type="button" aria-label="Remove" onClick={onRemove}>
          ✕
        </button>
      ) : (
        <span className="ins-badge dim">NOT SAVED</span>
      )}
    </span>
  )
}

const COLOURS = ['var(--color-lav-400)', 'var(--line-1)', 'var(--line-3)']
const RANGE_WORD = { '1mo': '1M', '6mo': '6M', '1y': '1Y' } as const
type Lines = Array<{ symbol: string; points: Array<{ t: number; v: number }> }>

export function AskChartCard({ c }: { c: AskChart }) {
  const fetchChart = useAction(api.insightsBoard.chartOf)
  const [lines, setLines] = useState<Lines | null>(null)
  const key = `${c.tickers.join(',')}|${c.range}`
  useEffect(() => {
    let live = true
    fetchChart({ symbols: c.tickers, range: c.range })
      .then((l) => live && setLines(l))
      .catch(() => live && setLines([]))
    return () => {
      live = false
    }
  }, [fetchChart, key])
  if (lines !== null && lines.length === 0) return null
  const W = 300
  const H = 96
  /* Each line in percent from its first close, so two tickers share an axis. */
  const rel = (lines ?? []).map((l) => ({
    ...l,
    pct: l.points.map((p) => (p.v / l.points[0].v - 1) * 100),
  }))
  const all = rel.flatMap((l) => l.pct)
  const lo = Math.min(0, ...all)
  const hi = Math.max(0, ...all)
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4)
  return (
    <div data-testid="ask-chart" className="ask-blk">
      <span className="label-caps">
        {c.tickers.join(' · ')} · {RANGE_WORD[c.range]}
      </span>
      {lines === null ? (
        <span className="ask-shim h-[96px]" />
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="zero" />
            {rel.map((l, i) => (
              <polyline
                key={l.symbol}
                className="draw"
                style={{ stroke: COLOURS[i] }}
                points={l.pct
                  .map(
                    (v, j) =>
                      `${(j / Math.max(1, l.pct.length - 1)) * W},${y(v)}`,
                  )
                  .join(' ')}
              />
            ))}
          </svg>
          <div className="ask-legend">
            {rel.map((l, i) => {
              const first = l.points[0]
              const last = l.points[l.points.length - 1]
              const ch = (last.v / first.v - 1) * 100
              return (
                <span
                  key={l.symbol}
                  style={{ '--c': COLOURS[i] } as React.CSSProperties}
                >
                  <i />
                  {l.symbol} {dayWord(first.t)} {num(first.v)} → {num(last.v)}{' '}
                  <b
                    className={
                      ch >= 0 ? 'text-state-good' : 'text-state-danger'
                    }
                  >
                    {changeWord(Math.round(ch * 100) / 100)}
                  </b>
                </span>
              )
            })}
          </div>
          <span className="ins-was">YAHOO · NOT SAVED</span>
        </>
      )}
    </div>
  )
}

const num = (n: number) =>
  n.toLocaleString('en-GB', { maximumFractionDigits: n >= 100 ? 0 : 2 })

export function AskTableCard({ t }: { t: AskTable }) {
  return (
    <table data-testid="ask-table" className="ask-tbl">
      <thead>
        <tr>
          {t.head.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
