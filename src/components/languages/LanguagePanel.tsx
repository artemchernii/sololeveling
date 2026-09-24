import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { BookOpen, GraduationCap, House, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { api } from '../../../convex/_generated/api'
import { AreaBadge } from '@/components/AreaBadge'
import { Level } from '@/components/languages/Level'
import { NextUp, Path } from '@/components/languages/Path'
import { Topics } from '@/components/languages/Topics'
import { CategoryChip } from '@/components/track/CategoryChip'
import { DayStrips } from '@/components/track/DayStrip'
import { DidButton } from '@/components/track/DidButton'
import { TrackPanel } from '@/components/track/TrackPanel'
import { areaVars } from '@/lib/areas'
import { dayStartsBack, RECENT_DAYS, STRIP_WEEKS } from '@/lib/day-strip'
import { aheadLabel, whenLabel } from '@/lib/format'
import { monthRange } from '@/lib/month'
import { buildTimeline } from '@/lib/timeline'

/* One language's panel (R6b-b; a tracking page since 25 Sep). Every number
   here is a log count, the latest state row, or a goal's stored target —
   never a sum or a share this component works out for itself (CLAUDE.md,
   "reality over gamification").

   His words, 25 Sep: "consistency is important and I want easily log that I
   attended classes, did some homework, learning at home". So the page opens
   on three buttons, one tap each, and the month's count of each under them. */

/* How far forward NEXT looks, and how many bookings it shows before pointing
   at Calendar for the rest. */
const NEXT_WINDOW_DAYS = 30
const NEXT_SHOWN = 5

/* The three kinds of session, as their stored category words. `practice` is
   what the capture verb has always written for studying alone — shown as
   "at home", the way he says it. */
type Kind = { category: string; label: string; sub?: string; icon: ReactNode }
const KINDS: Array<Kind> = [
  {
    category: 'class',
    label: 'Class',
    sub: '50 min',
    icon: <GraduationCap className="size-4" />,
  },
  {
    category: 'homework',
    label: 'Homework',
    icon: <BookOpen className="size-4" />,
  },
  {
    category: 'practice',
    label: 'At home',
    icon: <House className="size-4" />,
  },
]
const LABELS: Record<string, string> = { practice: 'at home' }
const CATEGORIES = KINDS.map((k) => k.category)

export function LanguagePanel({
  slug,
  label,
  lang,
}: {
  slug: string
  label: string
  lang: string | undefined
}) {
  /* 25 Sep order: log today; where you are and what to do next; the whole
     path; then the record of how often. */
  return (
    <div className="flex flex-col gap-[18px]">
      <LogToday slug={slug} />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <Level slug={slug} delay={80} />
        <NextUp slug={slug} lang={lang} delay={140} />
      </div>
      <Path slug={slug} lang={lang} delay={200} />
      <Sessions slug={slug} label={label} />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <Topics slug={slug} delay={260} />
        <Next slug={slug} />
      </div>
      <Recent slug={slug} label={label} />
    </div>
  )
}

/* The three buttons, and this month's count of each. */
function LogToday({ slug }: { slug: string }) {
  const [today] = useState(() => dayStartsBack(1).at(-1) as number)
  const range = monthRange(Date.now())
  return (
    <TrackPanel area={slug} title="log today">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {KINDS.map((k) => (
          <KindButton
            key={k.category}
            slug={slug}
            kind={k}
            today={today}
            monthStart={range.monthStart}
            monthEnd={range.nextStart}
          />
        ))}
      </div>
    </TrackPanel>
  )
}

function KindButton({
  slug,
  kind,
  today,
  monthStart,
  monthEnd,
}: {
  slug: string
  kind: Kind
  today: number
  monthStart: number
  monthEnd: number
}) {
  const create = useMutation(api.logs.create)
  const todayCount = useQuery(api.aggregate.kindCount, {
    kind: 'session',
    area: slug,
    category: kind.category,
    start: today,
    end: today + 86_400_000,
  })
  const month = useQuery(api.aggregate.kindCount, {
    kind: 'session',
    area: slug,
    category: kind.category,
    start: monthStart,
    end: monthEnd,
  })
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <DidButton
        size="lg"
        today={todayCount}
        label={kind.label}
        sub={kind.sub}
        icon={kind.icon}
        onDid={() =>
          create({
            kind: 'session',
            area: slug,
            occurredAt: Date.now(),
            category: kind.category,
            /* A class is 50 minutes, as `pt` has always said — shown on the
               button, editable in Recent. The other two carry no minutes
               rather than a guess. */
            ...(kind.category === 'class'
              ? { value: 50, unit: 'min', text: 'class' }
              : {}),
          })
        }
      />
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 px-1">
        <span
          key={month}
          className="motion-pop text-[22px] leading-none font-light text-foreground"
        >
          {month ?? '—'}
        </span>
        <span className="label-caps whitespace-nowrap">this month</span>
      </span>
    </div>
  )
}

/* NEXT reads the calendar, never logs: a log is evidence something happened,
   and nothing in logs can describe next Tuesday. Booked events only. */
function Next({ slug }: { slug: string }) {
  /* Fixed at mount: a query argument built from Date.now() directly never
     stops changing, and the query never settles. */
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
    <TrackPanel area={slug} title="next" delay={200}>
      {upcoming === undefined ? null : upcoming.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing booked.{' '}
          <Link
            to="/calendar"
            className="text-(--area) underline decoration-(--area)/40 underline-offset-2 transition-colors hover:brightness-125"
          >
            Book a class on the calendar
          </Link>{' '}
          and it shows here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {upcoming.slice(0, NEXT_SHOWN).map((item, i) => (
            <div
              key={item.id}
              style={{ animationDelay: `${i * 40}ms` }}
              className="motion-arrive flex min-w-0 items-baseline gap-3"
            >
              <span
                className={`shrink-0 font-mono text-[11px] ${i === 0 ? 'text-(--area)' : 'text-ink-500'}`}
              >
                {aheadLabel(item.startsAt)}
              </span>
              <span className="min-w-0 truncate text-[13.5px] text-ink-200">
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
    </TrackPanel>
  )
}

/* Twelve weeks of days, one row per kind of session and one for topics
   practised — the same source and voice as Body's Consistency. */
function Sessions({ slug, label }: { slug: string; label: string }) {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.aggregate.categoryDays, {
    area: slug,
    kinds: ['session', 'exercise'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })

  return (
    <TrackPanel
      area={slug}
      title="consistency"
      delay={240}
      aside={
        result !== undefined && !result.complete ? (
          <span className="font-mono text-[11px] text-ink-500">
            older days not all stored
          </span>
        ) : null
      }
    >
      {result === undefined ? null : result.rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing logged under {label} yet. Press a button above — the strip
          starts the day you do.
        </p>
      ) : (
        <DayStrips
          dayStarts={dayStarts}
          rows={result.rows.map((row) => ({
            key: `${row.kind}-${row.category ?? 'other'}`,
            label:
              row.category === null
                ? 'other'
                : (LABELS[row.category] ?? row.category),
            days: row.days,
            aside: `${row.activeRecent} of the last ${RECENT_DAYS} days`,
            noun: row.kind === 'exercise' ? 'topic' : 'session',
          }))}
        />
      )}
    </TrackPanel>
  )
}

/* Everything under this language lately. The category chip refiles an
   OTHER row (older sessions stored none); the area chip moves a session
   that `pt` filed under the wrong language. */
function Recent({ slug, label }: { slug: string; label: string }) {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.logs.listForArea, {
    area: slug,
    since: dayStarts[0],
  })
  const removeLog = useMutation(api.logs.remove)
  const setArea = useMutation(api.logs.setArea)
  const setCategory = useMutation(api.logs.setCategory)

  if (result === undefined) return null
  const rows = result.rows.filter((row) => row.kind !== 'task_done')

  return (
    <TrackPanel
      area={slug}
      title="recent"
      delay={280}
      aside={
        !result.complete ? (
          <span className="font-mono text-[11px] text-ink-500">
            older logs not all stored
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing under {label} in the last {STRIP_WEEKS} weeks.
        </p>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row._id}
              style={areaVars(slug)}
              className="motion-arrive group flex min-h-9 items-center gap-3 border-b border-lift/[0.05] py-1.5 last:border-b-0"
            >
              {row.kind === 'exercise' ? (
                <span className="label-caps w-[92px] shrink-0 truncate">
                  topic
                </span>
              ) : (
                <CategoryChip
                  category={row.meta?.category}
                  options={CATEGORIES}
                  labels={LABELS}
                  onChange={(next) =>
                    void setCategory({ logId: row._id, category: next })
                  }
                />
              )}
              <AreaBadge
                area={row.area}
                onChange={(next) =>
                  void setArea({ logId: row._id, area: next })
                }
              />
              <span className="flex-1 truncate text-[12.5px] text-ink-400">
                {row.text ?? ''}
              </span>
              {row.value !== undefined ? (
                <span className="shrink-0 font-mono text-[11px] text-ink-500">
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
    </TrackPanel>
  )
}
