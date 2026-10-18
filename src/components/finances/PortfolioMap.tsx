import { useEffect, useMemo } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD } from '@/components/finances/bits'
import { Veiled } from '@/components/finances/Veil'
import { kindOf } from '@/lib/logo'
import type { Kind } from '@/lib/logo'
import { euros } from '@/lib/money'
import { LOOK, tagsOf } from '@/lib/tags'
import type { Lens, RegionTag, SectorTag } from '@/lib/tags'
import type { Sector } from '@/lib/sector'

/* Where the money is (18 Oct, mockup tags-map.html, his "go emoji"):
   the bar under worth turns by kind, sector or region; a press on a part
   keeps only its rows. Each part is the sum of its valued positions'
   euros, as the bar by kind always was. Tags are labels read once and
   stored (convex/sector.ts), never fetched at render. */

export type Part = { lens: Lens; key: string } | null

type Row = {
  instrumentId: Id<'instruments'>
  symbol: string
  name: string
  type: string
  valueEur: number | null
}

export type Tags = ReadonlyMap<string, { sector: SectorTag; region: RegionTag }>

const KINDS: ReadonlyArray<{ kind: Kind; label: string; tone: string }> = [
  { kind: 'stock', label: 'stocks', tone: 'var(--color-lav-400)' },
  { kind: 'etf', label: 'ETFs', tone: 'var(--area-knowledge)' },
  { kind: 'gold', label: 'gold', tone: 'var(--money-cash)' },
  { kind: 'crypto', label: 'crypto', tone: 'var(--state-warn)' },
]

/** Every row's two tags; what is missing is asked for once, on open. */
export function useTags(rows: ReadonlyArray<Row>): Tags {
  const ids = useMemo(
    () => [...new Set(rows.map((r) => r.instrumentId))].sort(),
    [rows],
  )
  const stored = useQuery(api.sector.tags, { ids })
  const askAll = useMutation(api.sector.askAll)
  const key = ids.join()
  useEffect(() => {
    if (ids.length > 0) void askAll({ ids }).catch(() => undefined)
  }, [key])
  return useMemo(() => {
    const by = new Map<string, { sector?: Sector; country?: string }>(
      (stored ?? []).map((s) => [s.instrumentId, s]),
    )
    return new Map(
      rows.map((r) => [
        r.instrumentId,
        tagsOf({ kind: kindOf(r), name: r.name, ...by.get(r.instrumentId) }),
      ]),
    )
  }, [rows, stored])
}

/** Which part of the lens a row is in. */
export function partOf(
  lens: Lens,
  r: { instrumentId: string; symbol: string; type: string; name: string },
  tags: Tags,
): string {
  if (lens === 'kind') return kindOf(r)
  return tags.get(r.instrumentId)?.[lens] ?? 'missing'
}

export function MoneyMap({
  rows,
  tags,
  lens,
  onLens,
  part,
  onPart,
}: {
  rows: ReadonlyArray<Row>
  tags: Tags
  lens: Lens
  onLens: (next: Lens) => void
  part: Part
  onPart: (next: Part) => void
}) {
  const sum = new Map<string, number>()
  for (const r of rows)
    if (r.valueEur !== null) {
      const k = partOf(lens, r, tags)
      sum.set(k, (sum.get(k) ?? 0) + r.valueEur)
    }
  const total = [...sum.values()].reduce((t, v) => t + v, 0)
  if (total <= 0) return null
  const parts = [...sum.entries()]
    .filter(([, v]) => v > 0)
    .sort(
      ([a, x], [b, y]) =>
        Number(a === 'missing') - Number(b === 'missing') || y - x,
    )
    .map(([key, v]) => {
      const kind = KINDS.find((k) => k.kind === key)
      const look = LOOK[key as SectorTag | RegionTag]
      return {
        key,
        v,
        label: lens === 'kind' ? (kind?.label ?? key) : key,
        tone: lens === 'kind' ? (kind?.tone ?? 'var(--color-ink-500)') : look.tone,
        emoji: lens === 'kind' ? null : look.emoji,
      }
    })
  const on = (key: string) => part?.lens === lens && part.key === key
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-caps">where the money is</span>
        <div className="inline-flex gap-0.5 rounded-full bg-lift/[0.05] p-[3px] ring-1 ring-lift/10 ring-inset">
          {(['kind', 'sector', 'region'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lens === l}
              onClick={() => {
                onLens(l)
                onPart(null)
              }}
              className={`motion-press rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors ${
                lens === l
                  ? 'bg-lav-400/20 text-foreground'
                  : 'text-ink-500 hover:text-foreground'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
        {parts.map((p) => (
          <span
            key={p.key}
            style={{ flex: p.v, background: p.tone }}
            className={`rounded-full transition-[flex,opacity] duration-700 ${
              part === null || part.lens !== lens || on(p.key)
                ? ''
                : 'opacity-25'
            }`}
          />
        ))}
      </div>
      <div className="-mx-2 flex flex-wrap gap-x-1 gap-y-1">
        {parts.map((p) => (
          <button
            key={p.key}
            type="button"
            data-testid="map-part"
            aria-pressed={on(p.key)}
            onClick={() => onPart(on(p.key) ? null : { lens, key: p.key })}
            className={`label-caps motion-press flex items-center gap-1.5 rounded-[8px] px-2 py-1 transition-colors hover:bg-lift/[0.07] ${
              on(p.key) ? 'bg-lift/[0.07] text-foreground' : ''
            } ${p.key === 'missing' ? 'text-state-warn' : ''}`}
          >
            {p.emoji === null ? (
              <i
                className="inline-block size-2 rounded-[2px]"
                style={{ background: p.tone }}
              />
            ) : (
              <span className="text-[12px] tracking-normal">{p.emoji}</span>
            )}
            {p.label} <Veiled>{euros(Math.round(p.v))}</Veiled> ·{' '}
            {Math.round((p.v / total) * 100)}%
          </button>
        ))}
      </div>
    </div>
  )
}

/** A row's two tags, each in its own colour. */
export function TagChips({
  tags,
}: {
  tags: { sector: SectorTag; region: RegionTag } | undefined
}) {
  if (tags === undefined) return null
  return (
    <span className="flex flex-wrap items-center gap-1">
      {[tags.sector, tags.region].map((t, i) => (
        <span
          key={i}
          data-testid="tag"
          style={{ ['--t' as string]: LOOK[t].tone }}
          className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--t)_14%,transparent)] py-[2px] pr-2 pl-1.5 font-mono text-[9.5px] tracking-[0.12em] text-[color-mix(in_oklch,var(--t)_85%,white)] uppercase ring-1 ring-[color-mix(in_oklch,var(--t)_30%,transparent)] ring-inset"
        >
          <span
            className={`text-[11px] tracking-normal ${t === 'missing' ? 'motion-pulse' : ''}`}
          >
            {LOOK[t].emoji}
          </span>
          {t}
        </span>
      ))}
    </span>
  )
}

/** The pressed part, beside the list's title; a press clears it. */
export function PartPill({
  part,
  onClear,
}: {
  part: Part
  onClear: () => void
}) {
  if (part === null) return null
  return (
    <button type="button" onClick={onClear} className={PILL_LOUD}>
      {part.key} ✕
    </button>
  )
}
