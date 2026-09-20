import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { ArrowUpRight } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { CommitHeatmap } from '@/components/projects/CommitHeatmap'
import { SkeletonRows } from '@/components/Skeleton'
import type { Area } from '@/lib/capture-parser'
import { whenLabel } from '@/lib/format'
import { addWeeks, startOfWeek } from '@/lib/weeks'

/* GitHub on a project (R3c) — source 4, so it always says where the number
   came from (the repo, linked) and as of when (the last successful check).
   Two counts and the latest five commits. No graph, no streak, no rate. */
export function ProjectCommits({
  projectId,
  area,
}: {
  projectId: Id<'projects'>
  area: Area | undefined
}) {
  const week = startOfWeek()
  const counts = useQuery(api.aggregate.projectCommits, {
    projectId,
    lastWeekStart: addWeeks(week, -1).getTime(),
    weekStart: week.getTime(),
    nextWeekStart: addWeeks(week, 1).getTime(),
  })
  const recent = useQuery(api.github.listRecent, { projectId })
  const setRepo = useMutation(api.github.setRepo)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    try {
      await setRepo({ projectId, repo: input })
      setInput('')
      setError(null)
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'That did not work.')
    }
  }

  if (counts === undefined) {
    return (
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <div className="label-caps">GitHub</div>
        <SkeletonRows rows={3} />
      </div>
    )
  }

  if (counts.repo === null) {
    return (
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
        <div className="label-caps">GitHub</div>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void connect()
            }}
            placeholder="owner/name, or the repo's github.com link"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
          />
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lift/20 hover:text-ink-200"
          >
            Connect
          </button>
        </div>
        {error ? <p className="text-[12.5px] text-ink-400">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="glass flex flex-col gap-4 rounded-[22px] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a
          href={`https://github.com/${counts.repo}`}
          target="_blank"
          rel="noreferrer"
          className="label-caps flex items-center gap-1 transition-colors hover:text-ink-300"
        >
          GitHub · {counts.repo}
          <ArrowUpRight className="size-3" />
        </a>
        <span className="font-mono text-[11px] text-ink-600">
          {counts.checkedAt === null
            ? 'checking…'
            : `as of ${whenLabel(counts.checkedAt)}`}
        </span>
      </div>

      {/* Two columns (20 Sep, second pass). Stacked, the grid used 686px of a
          1108px card and left 447px empty beside it, while the commit list sat
          underneath and pushed the card to 510px — the tallest thing on the
          page, and the emptiest. The list moves into the space the grid was
          not using, and the card loses a third of its height.

          The list is capped at 44rem: at 1600px it ran 1015px wide and a
          commit subject became a line you have to track back across. */}
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[max-content_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex gap-8">
            <Count n={counts.thisWeek} label="this week" />
            <Count n={counts.lastWeek} label="last week" />
          </div>

          <CommitHeatmap projectId={projectId} area={area} />
        </div>

        {recent === undefined ? null : recent.length === 0 ? (
          <p className="text-[13px] text-ink-500">
            No commits in the last two weeks.
          </p>
        ) : (
          <div className="flex min-w-0 max-w-[44rem] flex-col gap-1.5">
            <span className="label-caps">latest</span>
            <div className="flex flex-col">
              {recent.map((c) => (
                <a
                  key={c.sha}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-baseline gap-3 border-b border-lift/[0.05] py-2 last:border-b-0"
                >
                  <span className="flex-1 truncate text-[12.5px] text-ink-300 transition-colors group-hover:text-foreground">
                    {c.message}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-600">
                    {whenLabel(c.authoredAt)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void setRepo({ projectId, repo: null })}
        className="self-start text-[11.5px] text-ink-700 transition-colors hover:text-ink-400"
      >
        Disconnect
      </button>
    </div>
  )
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[28px] leading-none font-light text-foreground">
        {n}
      </span>
      <span className="label-caps pt-1.5">{label}</span>
    </div>
  )
}
