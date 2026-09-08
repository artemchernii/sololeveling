import type { Area } from '@/lib/capture-parser'

/* The badge is the editor (settled with Artem, 8 Sep). A wrong area is fixed
   where you notice it, rather than demanded up front in a dropdown at the
   moment you have least patience for one.
 
   Neutral on purpose: PLAN.md §3 reserves the lavender accent for live and
   focus things, and nine coloured badges would be a rainbow competing with the
   one signal that is supposed to mean "this is the thing". */

export const AREAS: Array<Area> = [
  'business',
  'portuguese',
  'body',
  'money',
  'social',
  'career',
  'style',
  'knowledge',
  'life',
]

export function AreaBadge({
  area,
  onChange,
}: {
  area: Area | undefined
  onChange?: (next: Area) => void
}) {
  const label = area ?? 'unfiled'

  if (!onChange) {
    return (
      <span className="label-caps rounded-[4px] bg-white/5 px-1.5 py-0.5">
        {label}
      </span>
    )
  }

  /* A native select: it inherits keyboard behaviour and the platform's own
     picker on a phone, which is the device this gets used on. */
  return (
    <span className="relative inline-flex items-center rounded-[4px] bg-white/5 px-1.5 py-0.5 transition-colors hover:bg-white/10">
      <span className="label-caps pointer-events-none">{label}</span>
      <select
        aria-label={`Area — currently ${label}`}
        value={area ?? ''}
        onChange={(e) => onChange(e.target.value as Area)}
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
