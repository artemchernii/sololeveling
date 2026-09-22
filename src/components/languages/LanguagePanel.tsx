import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { AreaBadge } from '@/components/AreaBadge'
import { monthRange } from '@/components/dashboard/StateStrip'
import { LevelEditor } from '@/components/languages/LevelEditor'
import { DayStrip } from '@/components/track/DayStrip'
import { areaVars } from '@/lib/areas'
import {
  blockLabels,
  dayBlocks,
  dayStartsBack,
  RECENT_DAYS,
  STRIP_WEEKS,
} from '@/lib/day-strip'
import { aheadLabel, whenLabel } from '@/lib/format'
import { buildTimeline } from '@/lib/timeline'

/* One language's panel (R6b-b). Every number here is a log count, the latest
   state row, or a goal's stored target — never a sum or a share this
   component works out for itself (CLAUDE.md, "reality over gamification").

   Owns its own queries, unlike the tabs around it: the panel for a language
   that is not selected is not mounted (LanguageTabs remounts on tab change),
   so switching tabs costs exactly the queries the new tab needs. */

/* How far forward NEXT looks, and how many bookings it shows before pointing
   at Calendar for the rest — WeekGlance's own SHOWN, at a scale that fits a
   language's actual booking rhythm rather than one week. */
const NEXT_WINDOW_DAYS = 30
const NEXT_SHOWN = 5

export function LanguagePanel({
  slug,
  label,
}: {
  slug: string
  label: string
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <Vitals slug={slug} label={label} />
      <Next slug={slug} />
      <Sessions slug={slug} label={label} />
      <Recent slug={slug} label={label} />
    </div>
  )
}

/* CLASSES this month, PRACTICE this month, and the level — three quick facts
   in one row, the way ProjectVitals groups a card's numbers rather than
   giving each its own section. classes and practice are two `kindCount`
   reads narrowed by category (aggregate.ts): the same session kind, filed
   under this area, split the way `pt` and `practice` actually write it. */
function Vitals({ slug, label }: { slug: string; label: string }) {
  const range = monthRange(Date.now())
  const classes = useQuery(api.aggregate.kindCount, {
    kind: 'session',
    area: slug,
    category: 'class',
    start: range.monthStart,
    end: range.nextStart,
  })
  const practice = useQuery(api.aggregate.kindCount, {
    kind: 'session',
    area: slug,
    category: 'practice',
    start: range.monthStart,
    end: range.nextStart,
  })
  const levels = useQuery(api.aggregate.languageLevels, { slugs: [slug] })
  const goals = useQuery(api.goals.listActive, {})

  const level = levels?.[0]
  /* The target belongs to a goal filed under this language, in words — a CEFR
     level is not a scale anything divides by, so this reads `targetLabel`
     ("B2") and never `targetValue`. */
  const target = goals?.find(
    (g) => g.area === slug && g.targetLabel !== undefined,
  )?.targetLabel

  return (
    <section
      style={areaVars(slug)}
      className="flex flex-wrap items-start gap-x-10 gap-y-4"
    >
      <Figure
        n={classes === undefined ? undefined : String(classes)}
        label="classes this month"
      />
      <Figure
        n={practice === undefined ? undefined : String(practice)}
        label="practice this month"
      />
      {level === undefined ? null : (
        <div className="flex flex-col gap-1">
          <LevelEditor
            slug={slug}
            label={label}
            textValue={level.textValue}
            recordedAt={level.recordedAt}
          />
          {target !== undefined ? (
            <span className="font-mono text-[11px] text-ink-600">
              target {target}
            </span>
          ) : null}
        </div>
      )}
    </section>
  )
}

function Figure({ n, label }: { n: string | undefined; label: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[30px] leading-none font-light text-foreground">
        {n ?? '—'}
      </span>
      <span className="label-caps truncate pt-2">{label}</span>
    </div>
  )
}

/* NEXT reads the calendar, never logs: a log is evidence something happened,
   and nothing in logs can describe next Tuesday. `buildTimeline` is handed no
   tasks and no milestones — this is booked events only, expanded and sorted
   the same way WeekGlance draws a week, over a longer forward window because
   a language's booked classes are not a this-week thing. */
function Next({ slug }: { slug: string }) {
  /* Fixed at mount, not `Date.now()` read fresh on every render: a millisecond
     changes between one render and the next, so a query argument built from
     it directly never stops changing — the query resubscribes before its
     previous request can settle, and `events` stays `undefined` forever. */
  const [now] = useState(() => Date.now())
  const to = now + NEXT_WINDOW_DAYS * 86_400_000
  const events = useQuery(api.events.listInRange, { from: now, to })
  const upcoming =
    events === undefined
      ? undefined
      : buildTimeline([], events, [], { start: now, end: to }).filter(
          (item) => item.area === slug,
        )

  return (
    <section style={areaVars(slug)} className="flex flex-col gap-3">
      <h2 className="label-caps">next</h2>

      {upcoming === undefined ? null : upcoming.length === 0 ? (
        /* Shown, not hidden — the calendar is the only honest source for a
           future thing, and this says how to give it one. */
        <p className="text-[13px] text-ink-500">
          Nothing booked. Book a class on the calendar and it shows here.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {upcoming.slice(0, NEXT_SHOWN).map((item) => (
            <div key={item.id} className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-[11px] text-ink-600">
                {aheadLabel(item.startsAt)}
              </span>
              <span className="min-w-0 truncate text-[13px] text-ink-300">
                {item.title}
              </span>
            </div>
          ))}
          {upcoming.length > NEXT_SHOWN ? (
            <Link
              to="/calendar"
              className="font-mono text-[10px] text-ink-600 transition-colors hover:text-ink-300"
            >
              more on Calendar
            </Link>
          ) : null}
        </div>
      )}
    </section>
  )
}

/* Consistency.tsx's own section, narrowed to one area and one kind: how often
   a class or a practice session actually happened, twelve weeks of days, from
   `categoryDays` — the same source, the same truncation notice, the same
   voice. Not named "consistency" here because that word is Body's; this is
   simply the row of days a session lands on. */
function Sessions({ slug, label }: { slug: string; label: string }) {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.aggregate.categoryDays, {
    area: slug,
    kinds: ['session'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })
  const labels = blockLabels(dayBlocks(dayStarts))

  return (
    <section style={areaVars(slug)} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-caps">sessions</h2>
        {result !== undefined && !result.complete ? (
          /* Said out loud rather than drawn as empty squares — the same
             signal Consistency.tsx gives when its own read truncates. */
          <span className="font-mono text-[11px] text-ink-500">
            older days not all stored
          </span>
        ) : null}
      </div>

      {result === undefined ? null : result.rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing logged under {label} yet. Press{' '}
          <span className="font-mono text-ink-300">⌘L</span> to log a class or a
          practice session — the strip starts the day you do.
        </p>
      ) : (
        /* Same overflow bargain as Consistency.tsx: one scroll container for
           the labels and every row, so only this section pays for twelve
           weeks being wider than a phone. */
        <div className="overflow-x-auto">
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-[7px] pl-[104px]">
              {labels.map((blockLabel, b) => (
                <span
                  key={b}
                  className="label-caps w-[95px] shrink-0 overflow-visible whitespace-nowrap"
                >
                  {blockLabel}
                </span>
              ))}
            </div>

            {result.rows.map((row) => (
              <div
                key={`${row.kind}-${row.category ?? 'other'}`}
                className="flex items-center gap-3"
              >
                <span className="label-caps w-[92px] shrink-0 truncate">
                  {row.category ?? 'other'}
                </span>
                <DayStrip
                  dayStarts={dayStarts}
                  days={row.days}
                  noun="session"
                />
                <span className="shrink-0 font-mono text-[11px] text-ink-500">
                  {row.activeRecent} of the last {RECENT_DAYS} days
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* RecentBody.tsx's sibling, with one addition: the area chip is editable
   here. `pt` and `practice` file under `portuguese` in code regardless of
   which tab is open (R6 decision 3) — a known rough edge, not a bug — so a
   session meant for another language lands here needing exactly this move. */
function Recent({ slug, label }: { slug: string; label: string }) {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.logs.listForArea, {
    area: slug,
    since: dayStarts[0],
  })
  const removeLog = useMutation(api.logs.remove)
  const setArea = useMutation(api.logs.setArea)

  if (result === undefined) return null
  const { rows, complete } = result

  return (
    <section style={areaVars(slug)} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-caps">recent</h2>
        {!complete ? (
          <span className="font-mono text-[11px] text-ink-500">
            older logs not all stored
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing under {label} in the last {STRIP_WEEKS} weeks.
        </p>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row._id}
              className="group flex items-center gap-3 border-b border-lift/[0.05] py-1.5 last:border-b-0"
            >
              <span className="label-caps w-[92px] shrink-0 truncate">
                {row.meta?.category ?? row.kind}
              </span>
              <AreaBadge
                area={row.area}
                onChange={(next) =>
                  void setArea({ logId: row._id, area: next })
                }
              />
              <span className="flex-1 truncate text-[12.5px] text-ink-500">
                {row.text ?? ''}
              </span>
              {row.value !== undefined ? (
                <span className="shrink-0 font-mono text-[11px] text-ink-600">
                  {row.value}
                  {row.unit === 'min' ? 'm' : (row.unit ?? '')}
                </span>
              ) : null}
              <span className="shrink-0 font-mono text-[11px] text-ink-600">
                {whenLabel(row.occurredAt)}
              </span>
              <button
                type="button"
                aria-label={`Remove the ${row.meta?.category ?? row.kind} logged ${whenLabel(row.occurredAt)}`}
                onClick={() => void removeLog({ logId: row._id })}
                className="motion-press grid size-5 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
