import { useDayStarts } from '@/components/track/useDayStarts'
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AddDrill } from '@/components/track/AddDrill'
import { DidButton } from '@/components/track/DidButton'
import { TrackPanel } from '@/components/track/TrackPanel'
import { STRIP_WEEKS } from '@/lib/day-strip'
import { agoLabel } from '@/lib/format'

/* Topics (25 Sep): "a list of most important topics / tenses, and next to
   it a button". His list, typed in — nothing is seeded.

   Two things per topic, kept apart on purpose:
   - PRACTISED is evidence: one `exercise` log, today, via drills.did. How
     many times and when last come from aggregate.drillDays.
   - LEARNING / SOLID is his own word for where he stands with it — a mark
     on the drill, not a score, and nothing counts it into one. */

const GROUP = 'topic'
const NEXT_MARK = {
  none: 'learning',
  learning: 'solid',
  solid: null,
} as const

export function Topics({ slug, delay = 0 }: { slug: string; delay?: number }) {
  const drills = useQuery(api.drills.list, { area: slug })
  const dayStarts = useDayStarts()
  const days = useQuery(api.aggregate.drillDays, {
    area: slug,
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
  })
  const retire = useMutation(api.drills.retire)
  const restore = useMutation(api.drills.restore)
  const [gone, setGone] = useState<Doc<'drills'> | null>(null)

  if (drills === undefined) return null
  /* Path topics live in THE PATH; this is only what he typed himself. */
  const topics = drills.filter((d) => d.group === GROUP && d.ref === undefined)
  const byDrill = new Map(days?.rows.map((r) => [r.drillId, r]) ?? [])

  return (
    <TrackPanel area={slug} title="your own topics" delay={delay}>
      {topics.length === 0 ? (
        <p className="text-[13px] text-ink-400">
          Anything the path does not cover — a rule from class, words you keep
          missing. Each gets a{' '}
          <span className="font-mono text-ink-200">PRACTISED</span> button.
        </p>
      ) : (
        <ul className="flex flex-col">
          {topics.map((topic, i) => {
            const row = byDrill.get(topic._id)
            return (
              <li
                key={topic._id}
                style={{ animationDelay: `${delay + 60 + i * 40}ms` }}
                className="motion-arrive group flex min-h-11 items-center gap-3 border-b border-lift/[0.06] py-1.5 last:border-b-0"
              >
                <MarkChip drill={topic} />
                <span
                  className={`min-w-0 flex-1 truncate text-[14px] ${
                    topic.mark === 'solid' ? 'text-ink-400' : 'text-ink-100'
                  }`}
                >
                  {topic.title}
                </span>
                <button
                  type="button"
                  aria-label={`Take ${topic.title} off the list`}
                  onClick={() => {
                    setGone(topic)
                    void retire({ drillId: topic._id })
                  }}
                  className="motion-press grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100"
                >
                  <X className="size-3" />
                </button>
                <span
                  title={`in the last ${STRIP_WEEKS} weeks`}
                  className="hidden shrink-0 font-mono text-[11px] text-ink-500 sm:inline"
                >
                  {row === undefined
                    ? 'none lately'
                    : `${row.total}× · ${agoLabel(row.lastAt)}`}
                </span>
                <DoTopic drill={topic} today={row?.days.at(-1) ?? 0} />
              </li>
            )
          })}
        </ul>
      )}
      {gone !== null ? (
        <p className="motion-arrive flex items-center gap-2 font-mono text-[10.5px] text-ink-500">
          {gone.title} is off the list
          <button
            type="button"
            onClick={() => {
              void restore({ drillId: gone._id })
              setGone(null)
            }}
            className="text-ink-300 underline decoration-lift/30 underline-offset-2 hover:text-foreground"
          >
            undo
          </button>
        </p>
      ) : null}
      <AddDrill group={GROUP} area={slug} placeholder="add a topic or tense" />
    </TrackPanel>
  )
}

function DoTopic({ drill, today }: { drill: Doc<'drills'>; today: number }) {
  const did = useMutation(api.drills.did)
  return (
    <DidButton
      today={today}
      label="practised"
      onDid={() => did({ drillId: drill._id })}
    />
  )
}

/* Press to move it on: — → LEARNING → SOLID → —. SOLID wears the state
   colour for a thing that went well; LEARNING the language's own. */
function MarkChip({ drill }: { drill: Doc<'drills'> }) {
  const setMark = useMutation(api.drills.setMark)
  const mark = drill.mark ?? 'none'
  return (
    <button
      type="button"
      onClick={() =>
        void setMark({ drillId: drill._id, mark: NEXT_MARK[mark] })
      }
      title="Press to change: learning → solid → none"
      className={`motion-press w-[76px] shrink-0 rounded-[4px] px-1.5 py-0.5 text-center font-mono text-[9.5px] tracking-[0.14em] uppercase ring-1 transition-colors ring-inset ${
        mark === 'solid'
          ? 'bg-state-good/15 text-state-good ring-state-good/35'
          : mark === 'learning'
            ? 'bg-(--area)/12 text-area ring-(--area)/30'
            : 'text-ink-600 ring-lift/12 hover:text-ink-300'
      }`}
    >
      <span key={mark} className="motion-pop inline-block">
        {mark === 'none' ? 'mark' : mark}
      </span>
    </button>
  )
}
