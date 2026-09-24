import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { Check } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { AddTask } from '@/components/backlog/AddTask'
import { UndoLine } from '@/components/calendar/UndoLine'
import type { Undoable } from '@/components/calendar/UndoLine'
import { DoneList } from '@/components/backlog/DoneList'
import {
  isFiltered,
  ListControls,
  NO_FILTER,
} from '@/components/backlog/ListControls'
import type { ListFilter } from '@/components/backlog/ListControls'
import { TaskRow } from '@/components/backlog/TaskRow'
import { SkeletonRows } from '@/components/Skeleton'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { localToday } from '@/lib/today'
import { useArrived, useHeld } from '@/lib/loading'

type BacklogSort = 'newest' | 'oldest' | 'title'

const SORTS: Array<{ value: BacklogSort; label: string }> = [
  { value: 'newest', label: 'newest first' },
  { value: 'oldest', label: 'oldest first' },
  { value: 'title', label: 'title A–Z' },
]

export const Route = createFileRoute('/_app/backlog')({
  component: Backlog,
})

/* PLAN.md §3: the only place unpicked tasks live, and the only place their
   number is allowed to appear. Nothing here may be surfaced on the dashboard —
   "47 open tasks" on a morning screen is the number that makes people close
   the app (§3c.3).

   Two tabs since 17 Sep: Open, what is waiting; Done, what was ticked — so a
   finished task has a place once its day on Today ends. */
function Backlog() {
  const [view, setView] = useState<'open' | 'done' | 'archived'>('open')
  const today = localToday()
  const open = useHeld(useQuery(api.tasks.listBacklog, { today }))
  const archived = useQuery(
    api.tasks.listArchived,
    view === 'archived' ? {} : 'skip',
  )
  const tasks = view === 'archived' ? archived : open
  const arrived = useArrived(tasks)
  const picked = useQuery(api.tasks.listToday, { today })
  const projects = useQuery(api.projects.listLive, {})
  const goals = useQuery(api.goals.listActive, {})
  const goalsToBind = (goals ?? []).filter((g) => g.tile === undefined)

  const pickForToday = useMutation(api.tasks.pickForToday)
  const setArea = useMutation(api.tasks.setArea)
  const completeMany = useMutation(api.tasks.completeMany)
  const setArchivedMany = useMutation(api.tasks.setArchivedMany)
  const removeMany = useMutation(api.tasks.removeMany)
  const reopen = useMutation(api.tasks.reopen)

  /* A tick is one tap, so taking it back is one tap too: reopen deletes the
     task_done log the tick wrote (tasks.reopen). */
  const [undoable, setUndoable] = useState<Undoable | null>(null)
  const clearUndo = useCallback(() => setUndoable(null), [])
  function done(finished: Array<Doc<'tasks'>>) {
    if (finished.length === 0) return
    void completeMany({ taskIds: finished.map((t) => t._id) })
    setUndoable({
      text:
        finished.length === 1
          ? `Done: ${finished[0].title}`
          : `${finished.length} done`,
      at: Date.now(),
      undo: () => Promise.all(finished.map((t) => reopen({ taskId: t._id }))),
    })
  }

  /* Filtered and sorted here, not on the server: the backlog is one
     person's list, already capped at 200 by listBacklog, and every row is
     in hand. Newest first by default (17 Sep) — what was just written is
     what you came to find. */
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [sort, setSort] = useState<BacklogSort>('newest')
  const shown = tasks === undefined ? undefined : arrange(tasks, filter, sort)

  const [refusal, setRefusal] = useState<string | null>(null)
  const full = (picked?.length ?? 0) >= 3

  /* Select mode (24 Sep): "we can't delete in bulk, done in bulk, archive
     doesn't exist". Tick several, then act on them from the bar. */
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
    setConfirmBulk(false)
  }
  function toggle(id: string) {
    setConfirmBulk(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const chosen = (shown ?? []).filter((t) => selected.has(t._id))
  const ids = chosen.map((t) => t._id)

  async function pick(taskId: Id<'tasks'>) {
    try {
      await pickForToday({ taskId, today })
      setRefusal(null)
    } catch (e) {
      /* The limit is enforced in the mutation, not here — the UI disables the
         button as a courtesy, and this is what happens when the courtesy and
         the rule disagree. */
      setRefusal(
        e instanceof ConvexError && e.data === 'TODAY_FULL'
          ? 'Today is full. Finish one or drop one.'
          : 'That did not work.',
      )
    }
  }

  const TABS = [
    { value: 'open', label: 'Backlog' },
    { value: 'done', label: 'Done' },
    { value: 'archived', label: 'Archived' },
  ] as const

  return (
    <div
      className={`glass flex flex-col gap-4 rounded-[22px] p-4 md:p-6 ${
        selecting ? 'mb-20' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div role="tablist" aria-label="Backlog" className="flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={view === tab.value}
              onClick={() => {
                setView(tab.value)
                stopSelecting()
              }}
              className={`label-caps transition-colors ${
                view === tab.value ? 'text-foreground' : 'hover:text-ink-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="label-caps whitespace-nowrap">
            {view === 'open' && open !== undefined
              ? `${open.length} waiting`
              : ''}
          </span>
          {view !== 'done' && shown !== undefined && shown.length > 0 ? (
            <button
              type="button"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              className="motion-press rounded-full px-3 py-1 text-[12px] text-ink-400 ring-1 ring-lift/10 hover:text-foreground"
            >
              {selecting ? 'Done selecting' : 'Select'}
            </button>
          ) : null}
        </div>
      </div>

      {view === 'done' ? (
        <DoneList projects={projects ?? []} goals={goalsToBind} />
      ) : (
        <>
          {view === 'open' ? (
            <AddTask
              projects={projects ?? []}
              goals={goalsToBind}
              today={today}
              full={full}
            />
          ) : null}

          {tasks !== undefined && tasks.length > 0 ? (
            <ListControls
              filter={filter}
              onFilter={setFilter}
              sort={sort}
              sorts={SORTS}
              onSort={setSort}
              projects={projects ?? []}
              goals={goalsToBind}
              placeholder={
                view === 'archived'
                  ? 'Search the archive'
                  : 'Search the backlog'
              }
              unfiled
            />
          ) : null}

          {tasks === undefined || shown === undefined ? (
            <SkeletonRows rows={4} line="h-[61px]" />
          ) : tasks.length === 0 ? (
            <p className={`text-[13px] text-ink-500 ${arrived}`}>
              {view === 'archived'
                ? 'Nothing archived. Archive a task from its row to put it here.'
                : 'Empty. Everything you have written down is either done or on today.'}
            </p>
          ) : shown.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              Nothing here matches that.
            </p>
          ) : (
            <div className={`flex flex-col gap-1 ${arrived}`}>
              {shown.map((task) => (
                <TaskRow
                  key={task._id}
                  task={task}
                  projects={projects ?? []}
                  goals={goalsToBind}
                  full={full}
                  archivedView={view === 'archived'}
                  selecting={selecting}
                  checked={selected.has(task._id)}
                  onToggle={() => toggle(task._id)}
                  onComplete={() => done([task])}
                  onPick={() => void pick(task._id)}
                  onArea={(area) => void setArea({ taskId: task._id, area })}
                  onArchive={() =>
                    void setArchivedMany({
                      taskIds: [task._id],
                      archived: view !== 'archived',
                    })
                  }
                  onDelete={() => void removeMany({ taskIds: [task._id] })}
                />
              ))}
            </div>
          )}

          {refusal ? (
            <p className="text-[13px] text-ink-400">{refusal}</p>
          ) : full && view === 'open' ? (
            <p className="text-[13px] text-ink-500">
              Today is full. Finish one or drop one.
            </p>
          ) : null}
        </>
      )}

      <UndoLine undoable={undoable} onDone={clearUndo} />

      {/* Portalled: this page is one frosted panel, and a backdrop-filter
          pins a `fixed` child to the panel — on a phone the bar was drawn
          far below the screen (24 Sep). */}
      {selecting
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-40 flex justify-center px-[18px] md:bottom-6">
              <div className="glass-modal motion-arrive pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-[22px] py-1.5 pr-1.5 pl-4 md:rounded-full">
                <span className="text-[12.5px] text-ink-300">
                  {chosen.length === 0
                    ? 'Tick tasks'
                    : `${chosen.length} selected`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      chosen.length === shown?.length
                        ? new Set()
                        : new Set((shown ?? []).map((t) => t._id)),
                    )
                  }
                  className="motion-press rounded-full px-2.5 py-1 text-[12px] text-ink-400 hover:text-foreground"
                >
                  {chosen.length === shown?.length ? 'None' : 'All'}
                </button>
                {view === 'open' ? (
                  <button
                    type="button"
                    disabled={ids.length === 0}
                    onClick={() => {
                      done(chosen)
                      stopSelecting()
                    }}
                    className="motion-press flex items-center gap-1 rounded-full bg-state-good/12 px-3 py-1 text-[12px] text-state-good ring-1 ring-state-good/35 hover:bg-state-good/20 disabled:opacity-40"
                  >
                    <Check className="size-3" />
                    Done
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={ids.length === 0}
                  onClick={() => {
                    void setArchivedMany({
                      taskIds: ids,
                      archived: view !== 'archived',
                    })
                    stopSelecting()
                  }}
                  className="motion-press rounded-full px-3 py-1 text-[12px] text-foreground ring-1 ring-lift/15 hover:bg-lift/[0.06] disabled:opacity-40"
                >
                  {view === 'archived' ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  disabled={ids.length === 0}
                  onClick={() => {
                    if (!confirmBulk) {
                      setConfirmBulk(true)
                      return
                    }
                    void removeMany({ taskIds: ids })
                    stopSelecting()
                  }}
                  className={`motion-press rounded-full px-3 py-1 text-[12px] ring-1 disabled:opacity-40 ${
                    confirmBulk
                      ? 'bg-state-danger/15 text-state-danger ring-state-danger/40'
                      : 'text-ink-300 ring-lift/15 hover:text-state-danger'
                  }`}
                >
                  {confirmBulk ? `Delete ${ids.length} for good?` : 'Delete'}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function arrange(
  tasks: Array<Doc<'tasks'>>,
  filter: ListFilter,
  sort: BacklogSort,
): Array<Doc<'tasks'>> {
  const words = filter.search.trim().toLowerCase()
  const kept = !isFiltered(filter)
    ? [...tasks]
    : tasks.filter(
        (t) =>
          (words === '' || t.title.toLowerCase().includes(words)) &&
          (filter.area === '' ||
            (filter.area === 'unfiled'
              ? t.area === undefined
              : t.area === filter.area)) &&
          (filter.bound === '' ||
            (filter.bound.startsWith('p:')
              ? t.projectId === filter.bound.slice(2)
              : t.goalId === filter.bound.slice(2))),
      )
  if (sort === 'title')
    return kept.sort((a, b) => a.title.localeCompare(b.title))
  return kept.sort((a, b) =>
    sort === 'newest'
      ? b._creationTime - a._creationTime
      : a._creationTime - b._creationTime,
  )
}
