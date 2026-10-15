import { Loader2, TriangleAlert } from 'lucide-react'

import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import type { useOlderYears } from '@/components/finances/useOlderYears'

export const RANGES = [
  { id: '1M', days: 31 },
  { id: '6M', days: 183 },
  { id: '1Y', days: 366 },
] as const
export type Range = (typeof RANGES)[number]['id'] | 'all'

/* What of the stored days is in view (13 Oct, chart.html); "all" reads
   the older years first (split out of PortfolioPosition, 15 Oct). */
export function RangePills({
  range,
  onRange,
  years,
}: {
  range: Range
  onRange: (r: Range) => void
  years: ReturnType<typeof useOlderYears>
}) {
  const setRange = onRange
  return (
    <div className="flex gap-1.5">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          aria-pressed={range === r.id}
          onClick={() => setRange(r.id)}
          className={range === r.id ? PILL_LOUD : PILL_QUIET}
        >
          {r.id}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={range === 'all'}
        disabled={years.reading}
        title={
          years.failed
            ? 'Yahoo Finance did not answer. Press to read again.'
            : 'Five years'
        }
        onClick={() => void years.ask().then((ok) => ok && setRange('all'))}
        className={`${range === 'all' ? PILL_LOUD : PILL_QUIET} inline-flex items-center gap-1.5 ${years.failed ? 'text-state-warn ring-state-warn/40' : ''}`}
      >
        {years.reading ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            reading…
          </>
        ) : years.failed ? (
          <>
            <TriangleAlert className="motion-pulse size-3" />
            all · not read
          </>
        ) : (
          'all'
        )}
      </button>
    </div>
  )
}
