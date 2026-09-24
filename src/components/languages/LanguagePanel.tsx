import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  BookOpen,
  CalendarPlus,
  CircleHelp,
  GraduationCap,
  House,
  Sparkles,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Level } from '@/components/languages/Level'
import { NextUp, Path } from '@/components/languages/Path'
import { Topics } from '@/components/languages/Topics'
import { Verbs } from '@/components/languages/Verbs'
import { CategoryChip } from '@/components/track/CategoryChip'
import { DayStrips } from '@/components/track/DayStrip'
import { DidButton } from '@/components/track/DidButton'
import { TrackPanel } from '@/components/track/TrackPanel'
import { areaVars } from '@/lib/areas'
import { groupByDay } from '@/lib/day-groups'
import { dayStartsBack, RECENT_DAYS, STRIP_WEEKS } from '@/lib/day-strip'
import { clock } from '@/lib/format'
import {
  CEFR_MEANING,
  languageByCode,
  parseCefr,
} from '@/lib/languages/catalog'
import { monthRange } from '@/lib/month'
import { buildTimeline } from '@/lib/timeline'

/* One language's panel (R6b-b; rebuilt 25 Sep). Every number here is a log
   count, the latest state row, or a goal's stored target — never a sum or a
   share this component works out for itself (CLAUDE.md, "reality over
   gamification").

   Order, his (25 Sep): the language and how consistent you have been, in one
   card; log today; where you are and what to do next; the path; the verbs;
   then what is booked beside what was done. */

const NEXT_WINDOW_DAYS = 30
const NEXT_SHOWN = 4

/* The three kinds of session, as their stored category words. `practice` is
   what the capture verb has always written for studying alone; on screen it
   is "at home", everywhere, because that is what he calls it. */
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
const ICON: Record<string, ReactNode> = {
  class: <GraduationCap className="size-3.5" />,
  homework: <BookOpen className="size-3.5" />,
  practice: <House className="size-3.5" />,
  topic: <Sparkles className="size-3.5" />,
}

export function LanguagePanel({
  slug,
  label,
  lang,
}: {
  slug: string
  label: string
  lang: string | undefined
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <Header slug={slug} label={label} lang={lang} />
      <LogToday slug={slug} />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <Level slug={slug} delay={80} />
        <NextUp slug={slug} lang={lang} delay={140} />
      </div>
      <Path slug={slug} lang={lang} delay={200} />
      <Verbs lang={lang} area={slug} delay={240} />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <Next slug={slug} />
        <Recent slug={slug} />
      </div>
      <Topics slug={slug} delay={260} />
    </div>
  )
}

/* The language and how often, in one card (25 Sep): "I liked that big flag
   and Portuguese title. I wanted to combine it with consistency. Make it
   cool — I'm a big hater of boring slop."

   🇵🇹 Português, big, over a huge faded flag and a glow of the language's
   colour, with a sweep of light on arrival. Beside the name, the level. Then
   each kind of session as the number of days it happened in the last 30 —
   `activeRecent` from aggregate.categoryDays, the figure the strip row
   already carried — and the twelve weeks of days under them. */
function Header({
  slug,
  label,
  lang,
}: {
  slug: string
  label: string
  lang: string | undefined
}) {
  const language = languageByCode(lang)
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.aggregate.categoryDays, {
    area: slug,
    kinds: ['session', 'exercise'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })
  const levels = useQuery(api.aggregate.languageLevels, { slugs: [slug] })
  const level = parseCefr(levels?.[0]?.textValue)
  const unsorted = result?.rows.some((r) => r.category === null) ?? false
  const nameOf = (category: string | null) =>
    category === null ? 'unsorted' : (LABELS[category] ?? category)

  return (
    <section
      style={areaVars(slug)}
      className="glass motion-arrive relative flex flex-col gap-6 overflow-hidden rounded-[26px] p-5 sm:p-7"
    >
      {/* The flag again, huge and faint, off the right edge. */}
      {language ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-14 -right-10 rotate-[-12deg] text-[260px] leading-none opacity-[0.13] blur-[1px] select-none"
        >
          {language.flag}
        </span>
      ) : null}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-80 rounded-full bg-(--area)/25 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-28 size-72 rounded-full bg-lav-400/10 blur-3xl"
      />
      <span
        aria-hidden
        className="motion-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2"
      />

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3">
        {language ? (
          <span className="motion-pop grid size-[76px] place-items-center rounded-[22px] bg-(--area)/15 text-[54px] leading-none shadow-[0_0_40px_-8px_var(--area)] ring-1 ring-(--area)/35">
            {language.flag}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate text-[40px] leading-none font-light tracking-tight text-foreground sm:text-[48px]">
            {language?.native ?? label}
          </span>
          {level ? (
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-(--area) px-2.5 py-0.5 font-mono text-[11px] font-medium text-background">
                {level}
              </span>
              <span className="text-[13px] text-(--area)">
                {CEFR_MEANING[level].name}
              </span>
            </span>
          ) : null}
        </span>
      </div>

      {result === undefined ? null : result.rows.length === 0 ? (
        <p className="relative text-[13.5px] text-ink-300">
          Nothing logged yet. Press Class, Homework or At home below — the strip
          lights up the day you do.
        </p>
      ) : (
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap gap-2.5">
            {result.rows.map((row, i) => (
              <span
                key={`${row.kind}-${row.category ?? 'unsorted'}`}
                style={{ animationDelay: `${120 + i * 70}ms` }}
                className={`motion-land flex items-center gap-3 rounded-[16px] py-2 pr-4 pl-2 ring-1 ring-inset ${
                  row.category === null
                    ? 'bg-state-warn/10 ring-state-warn/30'
                    : 'bg-background/35 ring-(--area)/25'
                }`}
              >
                <span
                  className={`grid size-8 place-items-center rounded-full ${
                    row.category === null
                      ? 'bg-state-warn/15 text-state-warn'
                      : 'bg-(--area)/18 text-(--area)'
                  }`}
                >
                  {row.category === null ? (
                    <CircleHelp className="size-4" />
                  ) : row.kind === 'exercise' ? (
                    <Sparkles className="size-4" />
                  ) : (
                    (ICON[row.category] ?? <Sparkles className="size-4" />)
                  )}
                </span>
                <span className="flex flex-col">
                  <span className="text-[24px] leading-none font-light text-foreground">
                    {row.activeRecent}
                    <span className="ml-1 text-[12px] text-ink-500">
                      / {RECENT_DAYS} days
                    </span>
                  </span>
                  <span className="label-caps">{nameOf(row.category)}</span>
                </span>
              </span>
            ))}
          </div>

          <DayStrips
            dayStarts={dayStarts}
            rows={result.rows.map((row) => ({
              key: `${row.kind}-${row.category ?? 'unsorted'}`,
              label: nameOf(row.category),
              days: row.days,
              aside: `${row.activeRecent} of ${RECENT_DAYS}`,
              noun: row.kind === 'exercise' ? 'topic' : 'session',
            }))}
          />
          {unsorted ? (
            /* OTHER was a session logged before sessions carried a kind.
               Said plainly, with where to fix it. */
            <p className="flex items-center gap-1.5 text-[12px] text-state-warn">
              <CircleHelp className="size-3.5 shrink-0" />
              Unsorted = sessions logged before they had a type. Mark each as
              class, homework or at home in Done below.
            </p>
          ) : null}
          {!result.complete ? (
            <span className="font-mono text-[11px] text-ink-500">
              older days not all stored
            </span>
          ) : null}
        </div>
      )}
    </section>
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
            /* A class is 50 minutes, as `pt` has always said. The other two
               carry no minutes rather than a guess. */
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

/* BOOKED reads the calendar, never logs: a log is evidence something
   happened, and nothing in logs can describe next Tuesday. Each booking as
   a date tile, the way a calendar shows it. */
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
    <TrackPanel area={slug} title="booked" delay={280}>
      {upcoming === undefined ? null : upcoming.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13.5px] text-ink-400">
            No class on the calendar in the next {NEXT_WINDOW_DAYS} days.
          </p>
          <Link
            to="/calendar"
            className="motion-press inline-flex items-center gap-2 rounded-full bg-(--area)/15 px-4 py-2 text-[13px] text-(--area) ring-1 ring-(--area)/40 transition-colors ring-inset hover:bg-(--area)/25"
          >
            <CalendarPlus className="size-4" />
            Book a class
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {upcoming.slice(0, NEXT_SHOWN).map((item, i) => {
            const at = new Date(item.startsAt)
            return (
              <div
                key={item.id}
                style={{ animationDelay: `${i * 50}ms` }}
                className={`motion-arrive flex items-center gap-3 rounded-[14px] p-2 ring-1 ring-inset ${
                  i === 0
                    ? 'bg-(--area)/12 ring-(--area)/35'
                    : 'ring-lift/[0.06]'
                }`}
              >
                <span
                  className={`flex w-12 shrink-0 flex-col items-center rounded-[10px] py-1 ${
                    i === 0
                      ? 'bg-(--area) text-background'
                      : 'bg-lift/[0.06] text-ink-200'
                  }`}
                >
                  <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase opacity-80">
                    {at.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className="text-[20px] leading-none font-light">
                    {at.getDate()}
                  </span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] text-foreground">
                    {item.title}
                  </span>
                  <span className="font-mono text-[11px] text-ink-500">
                    {clock(at)}
                    {item.durationMin ? ` · ${item.durationMin} min` : ''}
                  </span>
                </span>
              </div>
            )
          })}
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

/* What was done, by day. The icon and chip say what kind of session it was
   (and let an unsorted one be marked); the flag moves a session logged
   under the wrong language. */
function Recent({ slug }: { slug: string }) {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const result = useQuery(api.logs.listForArea, {
    area: slug,
    since: dayStarts[0],
  })
  const areas = useQuery(api.areas.list, {})
  const removeLog = useMutation(api.logs.remove)
  const setArea = useMutation(api.logs.setArea)
  const setCategory = useMutation(api.logs.setCategory)
  const [all, setAll] = useState(false)

  if (result === undefined) return null
  const rows = result.rows.filter((row) => row.kind !== 'task_done')
  const shown = all ? rows : rows.slice(0, 10)
  const languages = (areas ?? []).filter((a) => a.track === 'language')

  return (
    <TrackPanel area={slug} title="done" delay={320}>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-400">
          Nothing in the last {STRIP_WEEKS} weeks yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groupByDay(shown).map((day) => (
            <div key={day.key} className="flex flex-col gap-1">
              <span className="label-caps">{day.label}</span>
              {day.rows.map((row) => (
                <DoneRow
                  key={row._id}
                  row={row}
                  languages={languages}
                  onCategory={(next) =>
                    void setCategory({ logId: row._id, category: next })
                  }
                  onArea={(next) =>
                    void setArea({ logId: row._id, area: next })
                  }
                  onRemove={() => void removeLog({ logId: row._id })}
                />
              ))}
            </div>
          ))}
          {rows.length > shown.length || all ? (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className="motion-press self-start font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase transition-colors hover:text-(--area)"
            >
              {all ? 'show fewer' : 'show all'}
            </button>
          ) : null}
        </div>
      )}
    </TrackPanel>
  )
}

function DoneRow({
  row,
  languages,
  onCategory,
  onArea,
  onRemove,
}: {
  row: Doc<'logs'>
  languages: Array<Doc<'areas'>>
  onCategory: (next: string | null) => void
  onArea: (next: string) => void
  onRemove: () => void
}) {
  const category =
    row.kind === 'exercise' ? 'topic' : (row.meta?.category ?? null)
  const here = languages.find((a) => a.slug === row.area)
  return (
    <div className="motion-arrive group flex min-h-10 items-center gap-2.5 rounded-[12px] px-1.5 py-1 transition-colors hover:bg-lift/[0.04]">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full ${
          category === null
            ? 'bg-state-warn/15 text-state-warn'
            : 'bg-(--area)/15 text-(--area)'
        }`}
      >
        {category === null ? (
          <CircleHelp className="size-3.5" />
        ) : (
          (ICON[category] ?? <Sparkles className="size-3.5" />)
        )}
      </span>
      {row.kind === 'exercise' ? (
        <span className="w-[92px] shrink-0 font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">
          topic
        </span>
      ) : (
        <CategoryChip
          category={row.meta?.category}
          options={CATEGORIES}
          labels={LABELS}
          onChange={onCategory}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
        {row.text ?? ''}
      </span>
      {row.value !== undefined ? (
        <span className="shrink-0 font-mono text-[11px] text-ink-500">
          {row.value}
          {row.unit === 'min' ? 'm' : (row.unit ?? '')}
        </span>
      ) : null}
      <span className="shrink-0 font-mono text-[11px] text-ink-600">
        {clock(new Date(row.occurredAt))}
      </span>
      {languages.length > 1 ? (
        /* Move to another language — a flag over a native select. */
        <span className="relative shrink-0 text-[15px] leading-none">
          {languageByCode(here?.lang)?.flag ?? '🏳️'}
          <select
            aria-label="Move to another language"
            value={row.area}
            onChange={(e) => onArea(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {languages.map((a) => (
              <option key={a.slug} value={a.slug}>
                {languageByCode(a.lang)?.native ?? a.label}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      <button
        type="button"
        aria-label="Remove this log"
        onClick={onRemove}
        className="motion-press grid size-5 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
