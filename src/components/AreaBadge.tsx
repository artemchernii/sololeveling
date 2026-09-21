import { AREAS, areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'

export { AREAS }

/* The badge is the editor (settled with Artem, 8 Sep). A wrong area is fixed
   where you notice it, rather than demanded up front in a dropdown at the
   moment you have least patience for one.

   Coloured by area. It was neutral on purpose, so that nine colours would not
   compete with the lavender that means live and focus — and §3d, written the
   day after, settled it the other way: an area is a kind, colour says what a
   thing is, and the app had been too monochrome about kinds. The area palette
   leaves a gap round the accent's hue so the two cannot be confused. Unfiled
   stays grey, because it is not a kind. */

const CAPS = 'font-mono text-[10px] tracking-[0.14em] uppercase'

export function AreaBadge({
  area,
  onChange,
}: {
  area: Area | undefined
  onChange?: (next: Area) => void
}) {
  const label = area ?? 'unfiled'

  const tone = area
    ? 'bg-(--area)/14 text-(--area) ring-1 ring-(--area)/25 ring-inset'
    : 'bg-lift/5 text-ink-500'

  if (!onChange) {
    return (
      <span
        style={area ? areaVars(area) : undefined}
        className={`${CAPS} ${tone} rounded-[4px] px-1.5 py-0.5`}
      >
        {label}
      </span>
    )
  }

  /* A native select: it inherits keyboard behaviour and the platform's own
     picker on a phone, which is the device this gets used on. */
  return (
    <span
      style={area ? areaVars(area) : undefined}
      className={`${tone} motion-press relative inline-flex items-center rounded-[4px] px-1.5 py-0.5 hover:brightness-125`}
    >
      <span className={`${CAPS} pointer-events-none`}>{label}</span>
      <select
        aria-label={`Area — currently ${label}`}
        value={area ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {area === undefined ? <option value="">unfiled</option> : null}
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </span>
  )
}
