import { useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { isFiltered, ListControls, NO_FILTER } from './ListControls'
import type { ListFilter } from './ListControls'
import { SkeletonRows } from '@/components/Skeleton'
import { useArrived } from '@/lib/loading'
import { startOfWeek } from '@/lib/weeks'

type Period = 'week' | 'month' | 'all'
type Sort = 'done' | 'created' | 'title'

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All' },
]

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'done', label: 'newest done' },
  { value: 'created', label: 'newest written' },
  { value: 'title', label: 'title A–Z' },
]

/* The backlog's Done tab (17 Sep): everything ticked, so a finished task
   has somewhere to be after its day ends. It is the rows, found, filtered
   and sorted — never a total, a streak or a rate. What was done is the
   record; how much is the THIS MONTH tile's job, from logs. */
export function DoneList({
  projects,
  goals,
}: {
  projects: Array<Doc<'projects'>>
  goals: Array<Doc<'goals'>>
}) {
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [period, setPeriod] = useState<Period>('month')
  const [sort, setSort] = useState<Sort>('done')
  const { search, bound } = filter
  const area = filter.area

  /* Period boundaries are local calendar facts, worked out here and passed
     in (lib/weeks.ts). Computed once per period choice, so the query's
     arguments do not change on every render. */
  const since = periodStart(period)

  const result = useQuery(api.tasks.listDone, {
    since,
    search: search.trim() || undefined,
    area: area || undefined,
    projectId: bound.startsWith('p:')
      ? (bound.slice(2) as Id<'projects'>)
      : undefined,
    goalId: bound.startsWith('g:')
      ? (bound.slice(2) as Id<'goals'>)
      : undefined,
  })

  /* A changed filter is a new query, which is undefined until it answers.
     The last answer stays up meanwhile, so a keystroke does not blank the
     list into a skeleton and back. */
  const last = useRef<Array<Doc<'tasks'>> | undefined>(undefined)
  if (result !== undefined) last.current = result
  const rows = result ?? last.current
  const arrived = useArrived(rows)

  const titles = new Map<string, string>([
    ...projects.map((p) => [p._id, p.title] as const),
    ...goals.map((g) => [g._id, g.title] as const),
  ])

  const sorted =
    rows === undefined ? undefined : sortRows(rows, sort, search.trim() !== '')

  return (
    <div className="flex flex-col gap-4">
      <ListControls
        filter={filter}
        onFilter={setFilter}
        sort={sort}
        sorts={SORTS}
        onSort={setSort}
        projects={projects}
        goals={goals}
        placeholder="Search what you did"
        extra={
          <div
            role="radiogroup"
            aria-label="Period"
            className="flex rounded-[7px] border border-lift/10 p-0.5"
          >
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded-[5px] px-2 py-0.5 text-[11.5px] transition-colors ${
                  period === p.value
                    ? 'bg-lift/[0.08] text-foreground'
                    : 'text-ink-500 hover:text-ink-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {sorted === undefined ? (
        <SkeletonRows rows={4} line="h-[61px]" />
      ) : sorted.length === 0 ? (
        <p className={`text-[13px] text-ink-500 ${arrived}`}>
          {isFiltered(filter) || period !== 'all'
            ? 'Nothing done matches that.'
            : 'Nothing ticked yet. What you finish on Today lands here.'}
        </p>
      ) : (
        <div
          className={`flex flex-col transition-opacity ${arrived} ${
            result === undefined ? 'opacity-60' : ''
          }`}
        >
          {sorted.map((task) => {
            const boundTo =
              (task.projectId && titles.get(task.projectId)) ||
              (task.goalId && titles.get(task.goalId))
            return (
              <div
                key={task._id}
                className="flex flex-col gap-1.5 border-b border-lift/[0.05] py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-[13px] text-ink-300">
                    {task.title}
                  </span>
                  {task.area ? <AreaBadge area={task.area} /> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-600">
                  {task.completedAt ? (
                    <span>done {doneLabel(task.completedAt)}</span>
                  ) : null}
                  {boundTo ? (
                    <>
                      <span className="text-ink-800">·</span>
                      <span className="text-ink-500">{boundTo}</span>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* Rounded to the start of the day it falls on, so the argument is the same
   all day long and the query stays one subscription. */
function periodStart(period: Period): number | undefined {
  if (period === 'all') return undefined
  const now = new Date()
  if (period === 'week') return startOfWeek(now).getTime()
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
}

function sortRows(
  rows: Array<Doc<'tasks'>>,
  sort: Sort,
  searching: boolean,
): Array<Doc<'tasks'>> {
  const copy = [...rows]
  if (sort === 'title') {
    return copy.sort((a, b) => a.title.localeCompare(b.title))
  }
  if (sort === 'created') {
    return copy.sort((a, b) => b._creationTime - a._creationTime)
  }
  /* Search comes back in match order; "newest done" still means newest. */
  return searching
    ? copy.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    : copy
}

/** "Tue 16 Sep", with the year only once it is not this year's. */
function doneLabel(ms: number): string {
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}
