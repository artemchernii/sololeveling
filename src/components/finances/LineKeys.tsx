import { useMemo } from 'react'

import { Stroke } from '@/components/finances/ChartLines'
import type { Drawn } from '@/components/finances/lineSeries'
import { LINE_COLOUR } from '@/components/finances/lineSeries'
import type { LineId } from '@/lib/indicators'

/* The key under the chart and the words above it for the lit lines
   (mockup indicators.html): each line named with its period, and its
   value on the day under the pointer, in its colour. */

export function LineKeys({
  keys,
}: {
  keys: ReadonlyArray<{ id: LineId; text: string }>
}) {
  return keys.map((k) => (
    <span key={k.id} className="motion-arrive flex items-center gap-1.5">
      <Stroke id={k.id} />
      <span className="text-ink-300">{k.text}</span>
    </span>
  ))
}

export function LineReads({
  lines,
  t,
  say,
}: {
  lines: Drawn
  t: number
  say: (v: number) => string
}) {
  const by = useMemo(
    () =>
      (['sma50', 'sma200', 'rsi'] as const).map(
        (id) => [id, new Map(lines[id]?.map((p) => [p.t, p.v]))] as const,
      ),
    [lines],
  )
  const reads: Array<[LineId, string, string]> = []
  if (lines.avg && t >= lines.avg.from)
    reads.push(['avg', 'AVG BUY', say(lines.avg.price)])
  for (const [id, values] of by) {
    const v = values.get(t)
    if (v !== undefined)
      reads.push([
        id,
        id === 'rsi' ? 'RSI 14' : id === 'sma50' ? 'SMA 50' : 'SMA 200',
        id === 'rsi' ? v.toFixed(1) : say(v),
      ])
  }
  return reads.map(([id, name, v]) => (
    <span
      key={id}
      className="inline-flex items-baseline gap-1.5 text-[12.5px] text-ink-200"
    >
      <span
        className="text-[10px] tracking-[0.12em]"
        style={{ color: `var(${LINE_COLOUR[id][0]})` }}
      >
        {name}
      </span>
      {v}
    </span>
  ))
}
