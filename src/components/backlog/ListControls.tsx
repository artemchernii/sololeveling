import { Search } from 'lucide-react'

import type { Doc } from '../../../convex/_generated/dataModel'
import { useAreas } from '@/lib/areas'

const SELECT =
  'rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[11.5px] text-ink-400'

/** The backlog page's two tabs filter the same way, so they share one row. */
export type ListFilter = {
  search: string
  /** An area, 'unfiled', or '' for any. */
  area: string
  /** 'p:<projectId>', 'g:<goalId>', or '' for any. */
  bound: string
}

export const NO_FILTER: ListFilter = { search: '', area: '', bound: '' }

export function isFiltered(filter: ListFilter): boolean {
  return (
    filter.search.trim() !== '' || filter.area !== '' || filter.bound !== ''
  )
}

/* Search, area, what it is for, and a sort — the Open and Done tabs of the
   backlog page (17 Sep). The Done tab's period sits in `extra`, between the
   search and the selects, because only it has one. */
export function ListControls<TSort extends string>({
  filter,
  onFilter,
  sort,
  sorts,
  onSort,
  projects,
  goals,
  placeholder,
  unfiled = false,
  extra,
}: {
  filter: ListFilter
  onFilter: (next: ListFilter) => void
  sort: TSort
  sorts: Array<{ value: TSort; label: string }>
  onSort: (next: TSort) => void
  projects: Array<Doc<'projects'>>
  goals: Array<Doc<'goals'>>
  placeholder: string
  /** Offer "unfiled" as an area — only where the filter runs on the client. */
  unfiled?: boolean
  extra?: React.ReactNode
}) {
  const areas = useAreas()
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-lift/[0.07] pb-3">
      <label className="flex min-w-[12rem] flex-1 items-center gap-2">
        <Search className="size-3.5 shrink-0 text-ink-600" />
        <input
          value={filter.search}
          onChange={(e) => onFilter({ ...filter, search: e.target.value })}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </label>

      {extra}

      <select
        aria-label="Area"
        value={filter.area}
        onChange={(e) => onFilter({ ...filter, area: e.target.value })}
        className={SELECT}
      >
        <option value="">any area</option>
        {unfiled ? <option value="unfiled">unfiled</option> : null}
        {areas.map((a) => (
          <option key={a.slug} value={a.slug}>
            {a.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Project or goal"
        value={filter.bound}
        onChange={(e) => onFilter({ ...filter, bound: e.target.value })}
        className={`${SELECT} max-w-[10rem] truncate`}
      >
        <option value="">any project or goal</option>
        {projects.length > 0 ? (
          <optgroup label="Projects">
            {projects.map((p) => (
              <option key={p._id} value={`p:${p._id}`}>
                {p.title}
              </option>
            ))}
          </optgroup>
        ) : null}
        {goals.length > 0 ? (
          <optgroup label="Goals">
            {goals.map((g) => (
              <option key={g._id} value={`g:${g._id}`}>
                {g.title}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      <select
        aria-label="Sort"
        value={sort}
        onChange={(e) => onSort(e.target.value as TSort)}
        className={SELECT}
      >
        {sorts.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}
