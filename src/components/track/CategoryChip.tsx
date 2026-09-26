/* A log's category, and the way to change it (25 Sep). Older sessions were
   stored with none and read OTHER (UNSORTED since 25 Sep) — counted as neither class nor practice.
   Same shape as AreaBadge: a native select laid over the chip, so a phone
   gets its own picker. OTHER wears the warning colour: it is a row asking
   to be filed. */

const CAPS = 'font-mono text-[10px] tracking-[0.14em] uppercase'

export function CategoryChip({
  category,
  options,
  labels = {},
  onChange,
}: {
  category: string | undefined
  options: Array<string>
  labels?: Record<string, string>
  onChange: (next: string | null) => void
}) {
  const all =
    category && !options.includes(category) ? [category, ...options] : options
  const label = category ? (labels[category] ?? category) : 'unsorted'
  return (
    <span
      className={`motion-press relative inline-flex w-[92px] shrink-0 items-center rounded-[4px] px-1.5 py-0.5 hover:brightness-125 ${
        category
          ? 'bg-(--area)/12 text-area ring-1 ring-(--area)/25 ring-inset'
          : 'bg-state-warn/12 text-state-warn ring-1 ring-state-warn/30 ring-inset'
      }`}
    >
      <span className={`${CAPS} pointer-events-none truncate`}>{label}</span>
      <select
        aria-label={`Category — currently ${label}`}
        value={category ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : e.target.value)
        }
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">unsorted</option>
        {all.map((c) => (
          <option key={c} value={c}>
            {labels[c] ?? c}
          </option>
        ))}
      </select>
    </span>
  )
}
