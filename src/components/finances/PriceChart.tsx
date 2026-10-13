import { money } from '@/lib/currency'
import { BOX, priceChart } from '@/lib/priceChart'
import type { Mark } from '@/lib/priceChart'

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const TONE = {
  up: 'var(--state-good)',
  down: 'var(--state-danger)',
  plain: 'var(--color-lav-400)',
}

/* One position's stored closes as a line, its buys and sells on it
   (13 Oct, mockup portfolio.html). Green or red by whether the position
   is up or down since bought; lavender when that is not known. */
export function PriceChart({
  points,
  marks,
  currency,
  tone,
}: {
  points: ReadonlyArray<{ asOf: number; price: number }> | undefined
  marks: ReadonlyArray<Mark>
  currency: string
  tone: keyof typeof TONE
}) {
  const chart = priceChart(
    (points ?? []).map((p) => ({ t: p.asOf, v: p.price })),
    marks,
  )
  const { w, h, left, right } = BOX
  if (chart === null) {
    return (
      <div
        style={{ aspectRatio: `${w} / ${h}` }}
        className="grid place-items-center rounded-[14px] bg-lift/[0.025] font-mono text-[11px] text-ink-500"
      >
        {points === undefined ? 'reading…' : 'no prices stored for this period'}
      </div>
    )
  }
  const colour = TONE[tone]
  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Price over the period, with buys and sells"
        className="block h-auto w-full overflow-visible"
      >
        <defs>
          <linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={colour} stopOpacity=".22" />
            <stop offset="1" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        {chart.ticks.map((t) => (
          <g key={t.y}>
            <line
              x1={left}
              x2={w - right}
              y1={t.y}
              y2={t.y}
              className="stroke-lift/6"
            />
            <text
              x={w - right + 8}
              y={t.y + 4}
              className="fill-ink-500 font-mono text-[8.5px]"
            >
              {money(Math.round(t.v * 100) / 100, currency)}
            </text>
          </g>
        ))}
        <text
          x={left}
          y={h - 3}
          className="fill-ink-500 font-mono text-[8.5px]"
        >
          {DAY.format(new Date(chart.from))}
        </text>
        <text
          x={w - right}
          y={h - 3}
          textAnchor="end"
          className="fill-ink-500 font-mono text-[8.5px]"
        >
          {DAY.format(new Date(chart.to))}
        </text>
        <path d={chart.area} fill="url(#price-fill)" />
        <path
          key={chart.line}
          d={chart.line}
          pathLength={24}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinejoin="round"
          className="motion-draw"
        />
        {chart.dots.map((d) => (
          <circle
            key={`${d.t}-${d.side}`}
            cx={d.x}
            cy={d.y}
            r={5}
            strokeWidth={2}
            className={`fill-ground ${d.side === 'buy' ? 'stroke-state-good' : 'stroke-state-danger'}`}
          />
        ))}
        <circle cx={chart.last.x} cy={chart.last.y} r={4} fill={colour} />
      </svg>
      {chart.dots.length > 0 ? (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[10.5px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <i className="size-[9px] rounded-full border-2 border-state-good" />
            bought
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-[9px] rounded-full border-2 border-state-danger" />
            sold
          </span>
        </div>
      ) : null}
    </div>
  )
}
