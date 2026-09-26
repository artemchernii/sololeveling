import { useState } from 'react'
import type { ReactNode } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  BookOpen,
  CalendarPlus,
  CircleHelp,
  GraduationCap,
  History,
  House,
  Sparkles,
  Sun,
  Vault as VaultIcon,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Level } from '@/components/languages/Level'
import { NextUp, Path } from '@/components/languages/Path'
import { Topics } from '@/components/languages/Topics'
import { SessionSheets, Vault } from '@/components/languages/Vault'
import { Verbs } from '@/components/languages/Verbs'
import { CategoryChip } from '@/components/track/CategoryChip'
import { DidButton } from '@/components/track/DidButton'
import { MonthCalendar } from '@/components/track/MonthCalendar'
import { TrackPanel } from '@/components/track/TrackPanel'
import { useDayStarts } from '@/components/track/useDayStarts'
import { WeekChip } from '@/components/track/Weekly'
import { areaVars } from '@/lib/areas'
import { RECENT_DAYS } from '@/lib/day-strip'
import { clock } from '@/lib/format'
import {
  CEFR_MEANING,
  languageByCode,
  parseCefr,
} from '@/lib/languages/catalog'
import { monthRange } from '@/lib/month'
import { buildTimeline } from '@/lib/timeline'

/* One language's panel (R6b-b; rebuilt 25 Sep; laid out like Body 26 Sep).
   Every number here is a log count, the latest state row, or a goal's
   stored target — never a sum or a share this component works out for
   itself (CLAUDE.md, "reality over gamification").

   26 Sep, after Body's rebuild: "body looks better than languages. More
   compact … split what is below hero into tabs, because it's confusing."
   So the same shape as Body: a short hero (the language, its rank, this
   week against his targets), then three tabs. TODAY — log a class,
   homework or an hour at home; what to do next; what is booked. LEARN —
   the level, the path, the verbs, the topics: the knowledge the app
   brings. HISTORY — the last 30 days, a month calendar, the tapped day's
   sessions. The tab is in the URL, like Body's. */

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

const TABS = [
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'learn', label: 'Learn', Icon: GraduationCap },
  { id: 'history', label: 'History', Icon: History },
  /* The sheets from class, read once (R7a, 26 Sep). */
  { id: 'vault', label: 'Vault', Icon: VaultIcon },
] as const

export type LanguageTab = (typeof TABS)[number]['id']
export const LANGUAGE_TABS: ReadonlyArray<string> = TABS.map((t) => t.id)

const route = getRouteApi('/_app/languages')

export function LanguagePanel({
  slug,
  label,
  lang,
}: {
  slug: string
  label: string
  lang: string | undefined
}) {
  const { tab = 'today' } = route.useSearch()
  return (
    <div className="flex flex-col gap-[18px]">
      <Header slug={slug} label={label} lang={lang} />
      <nav aria-label="Language tabs" className="flex flex-wrap gap-2">
        {TABS.map(({ id, label: name, Icon }) => {
          const on = id === tab
          return (
            <Link
              key={id}
              to="/languages"
              search={id === 'today' ? {} : { tab: id }}
              replace
              aria-current={on ? 'page' : undefined}
              className={`motion-press inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[11.5px] tracking-[0.14em] uppercase ring-1 transition-colors ring-inset ${
                on
                  ? 'bg-lav-400/12 text-foreground ring-lav-400/45 shadow-[0_0_18px_-6px_var(--system-shine)]'
                  : 'text-ink-400 ring-lift/12 hover:bg-lav-400/8 hover:text-foreground hover:ring-lav-400/35'
              }`}
            >
              <Icon className={`size-4 ${on ? 'text-lav-400' : ''}`} />
              {name}
            </Link>
          )
        })}
      </nav>

      {/* Keyed so a tab arrives rather than swapping in place. */}
      <div key={tab} className="motion-arrive flex flex-col gap-[18px]">
        {tab === 'today' ? (
          <>
            <LogToday slug={slug} />
            <div className="grid gap-[18px] lg:grid-cols-2">
              <NextUp slug={slug} lang={lang} delay={80} />
              <Next slug={slug} />
            </div>
          </>
        ) : tab === 'learn' ? (
          <>
            <Level slug={slug} delay={0} />
            <Path slug={slug} lang={lang} delay={80} />
            <Verbs lang={lang} area={slug} delay={140} />
            <Topics slug={slug} delay={200} />
          </>
        ) : tab === 'history' ? (
          <LanguageHistory slug={slug} />
        ) : (
          <Vault slug={slug} />
        )}
      </div>
    </div>
  )
}

/* The language, its rank, and this week — one short window, the shape of
   Body's hero (26 Sep). Before it was a status sheet with a 12-week strip,
   which made the page start with scrolling; the long view is History's.

   "I liked that big flag and Portuguese title … Make it cool — I'm a big
   hater of boring slop" (25 Sep): the flag and the place's photo carry the
   colour; the frame is the System's lavender. */
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
  const levels = useQuery(api.aggregate.languageLevels, { slugs: [slug] })
  const level = parseCefr(levels?.[0]?.textValue)
  const name = language?.native ?? label

  return (
    <section
      style={areaVars(slug)}
      className="system-frame system-open relative flex flex-col gap-3.5 overflow-clip p-4 sm:p-5"
    >
      {/* The place itself (25 Sep, his photos): on the right on a wide
          screen, faded into the window; on a phone it would sit under the
          chips, and the hero is kept short on purpose. */}
      {language ? (
        <img
          src={language.photo}
          alt=""
          aria-hidden
          decoding="async"
          style={{
            objectPosition: language.focus,
            maskImage: 'linear-gradient(to left, black 40%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to left, black 40%, transparent 100%)',
          }}
          className="motion-fade pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[40%] object-cover opacity-70 select-none sm:block"
        />
      ) : null}
      <span
        aria-hidden
        className="motion-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2"
      />

      <div className="relative flex items-center justify-between gap-3 border-b border-lav-400/20 pb-3 sm:w-[60%]">
        <span className="system-title">[ language ]</span>
        {language ? (
          <span className="text-[18px] leading-none" aria-hidden>
            {language.flag}
          </span>
        ) : null}
      </div>

      <div className="relative flex items-end justify-between gap-4 sm:w-[60%]">
        <span className="min-w-0 truncate pb-[0.12em] text-[28px] leading-tight font-light tracking-[0.14em] text-foreground uppercase sm:text-[34px]">
          {name}
        </span>
        {level ? (
          <span className="flex shrink-0 flex-col items-end">
            <span className="label-caps text-ink-400">rank</span>
            <span className="system-pulse font-mono text-[40px] leading-none text-lav-300">
              {level}
            </span>
            <span className="label-caps text-ink-400">
              {CEFR_MEANING[level].name}
            </span>
          </span>
        ) : null}
      </div>

      <div className="relative flex flex-col gap-2 sm:w-[60%]">
        <span className="label-caps">this week</span>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {KINDS.map((k, i) => (
            <WeekChip
              key={k.category}
              area={slug}
              kind="session"
              category={k.category}
              name={k.label}
              icon={k.icon}
              questIcon={k.icon}
              questTitle={`${k.label} · ${name}`}
              suggested={k.category === 'class' ? 2 : 3}
              editSpan="col-span-3"
              delay={80 + i * 50}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

/* The three buttons, and this month's count of each. */
function LogToday({ slug }: { slug: string }) {
  const today = useDayStarts(1).at(-1) as number
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
            className="motion-press inline-flex items-center gap-2 rounded-full bg-(--area)/15 px-4 py-2 text-[13px] text-area ring-1 ring-(--area)/40 transition-colors ring-inset hover:bg-(--area)/25"
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

/* HISTORY (26 Sep): the last 30 days per kind, then Body's month calendar
   — an icon per kind on each day — and the tapped day's sessions under
   it, each one still fixable: its kind (and an unsorted one sorted), its
   language, or gone. The 12-week strip it replaces made the page start
   with scrolling. */
function LanguageHistory({ slug }: { slug: string }) {
  return (
    <section
      style={areaVars(slug)}
      className="system-frame relative flex flex-col gap-5 p-4 sm:p-5"
    >
      <LastThirty slug={slug} />
      <MonthCalendar
        area={slug}
        kinds={['session', 'exercise']}
        icon={(row, cls) =>
          row.kind === 'exercise' ? (
            <Sparkles className={cls} />
          ) : row.category === null ? (
            <CircleHelp className={`${cls} text-state-warn`} />
          ) : (
            <KindGlyph category={row.category} className={cls} />
          )
        }
        name={(row) =>
          row.kind === 'exercise'
            ? 'topic'
            : row.category === null
              ? 'unsorted'
              : (LABELS[row.category] ?? row.category)
        }
        day={(day) => <DayRows slug={slug} day={day} />}
      />
    </section>
  )
}

/* How many of the last 30 days each kind happened (aggregate.categoryDays),
   as small pills — Body's LastThirty for a language. The three kinds always,
   at 0 when nothing; then topics, and unsorted with where to fix it. */
function LastThirty({ slug }: { slug: string }) {
  const dayStarts = useDayStarts(5)
  const result = useQuery(api.aggregate.categoryDays, {
    area: slug,
    kinds: ['session', 'exercise'],
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
    recentDays: RECENT_DAYS,
  })
  if (result === undefined) return null
  const found = result.rows
  const rows = [
    ...KINDS.map((k) => ({
      key: k.category,
      name: k.label,
      icon: <KindGlyph category={k.category} className="size-3.5" />,
      recent:
        found.find((r) => r.kind === 'session' && r.category === k.category)
          ?.activeRecent ?? 0,
      warn: false,
    })),
    ...found
      .filter(
        (r) =>
          r.kind !== 'session' ||
          r.category === null ||
          !CATEGORIES.includes(r.category),
      )
      .map((r) => ({
        key: `${r.kind}-${r.category ?? 'unsorted'}`,
        name:
          r.kind === 'exercise'
            ? 'topics'
            : r.category === null
              ? 'unsorted'
              : r.category,
        icon:
          r.category === null && r.kind === 'session' ? (
            <CircleHelp className="size-3.5" />
          ) : (
            <Sparkles className="size-3.5" />
          ),
        recent: r.activeRecent,
        warn: r.kind === 'session' && r.category === null,
      })),
  ]
  return (
    <div className="flex flex-col gap-2">
      <span className="label-caps">last {RECENT_DAYS} days</span>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((row, i) => (
          <span
            key={row.key}
            aria-label={`${row.name}: ${row.recent} of the last ${RECENT_DAYS} days`}
            style={{ animationDelay: `${80 + i * 50}ms` }}
            className={`motion-land inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 ring-1 ring-inset ${
              row.warn
                ? 'text-state-warn ring-state-warn/35'
                : 'text-area ring-lift/12'
            }`}
          >
            {row.icon}
            <span className="font-mono text-[12px] text-foreground">
              {row.recent}
              <span className="text-ink-500">/{RECENT_DAYS}</span>
            </span>
            <span className="label-caps">{row.name}</span>
          </span>
        ))}
      </div>
      {rows.some((r) => r.warn) ? (
        /* A session logged before sessions carried a kind. Said plainly,
           with where to fix it. */
        <p className="flex items-center gap-1.5 text-[12px] text-state-warn">
          <CircleHelp className="size-3.5 shrink-0" />
          Unsorted = sessions logged before they had a type. Tap a day with the
          ? below and mark each one.
        </p>
      ) : null}
    </div>
  )
}

/* The day tapped in the calendar: its sessions and topics, oldest first. */
function DayRows({ slug, day }: { slug: string; day: number }) {
  const result = useQuery(api.logs.listForArea, { area: slug, since: day })
  const areas = useQuery(api.areas.list, {})
  const removeLog = useMutation(api.logs.remove)
  const setArea = useMutation(api.logs.setArea)
  const setCategory = useMutation(api.logs.setCategory)

  const rows = (result?.rows ?? []).filter(
    (row) => row.kind !== 'task_done' && row.occurredAt < day + 86_400_000,
  )
  const sessionIds = rows.filter((r) => r.kind === 'session').map((r) => r._id)
  const sheets = useQuery(api.vault.countsForLogs, { logIds: sessionIds })
  if (result === undefined) return null
  const languages = (areas ?? []).filter((a) => a.track === 'language')

  return (
    <div className="motion-arrive flex flex-col gap-1">
      {rows.length === 0 ? (
        <p className="px-1.5 text-[13px] text-ink-400">Nothing that day.</p>
      ) : (
        rows.map((row) => (
          <DoneRow
            key={row._id}
            row={row}
            languages={languages}
            onCategory={(next) =>
              void setCategory({ logId: row._id, category: next })
            }
            onArea={(next) => void setArea({ logId: row._id, area: next })}
            onRemove={() => void removeLog({ logId: row._id })}
            sheets={
              row.kind === 'session' ? (
                <SessionSheets
                  slug={slug}
                  logId={row._id}
                  count={sheets?.find((c) => c.logId === row._id)?.count ?? 0}
                />
              ) : null
            }
          />
        ))
      )}
    </div>
  )
}

/* A kind's icon at any size: the ICON map holds fixed-size elements. */
function KindGlyph({
  category,
  className,
}: {
  category: string
  className: string
}) {
  const Icon =
    category === 'class'
      ? GraduationCap
      : category === 'homework'
        ? BookOpen
        : category === 'practice'
          ? House
          : Sparkles
  return <Icon className={className} />
}

function DoneRow({
  row,
  languages,
  onCategory,
  onArea,
  onRemove,
  sheets,
}: {
  row: Doc<'logs'>
  languages: Array<Doc<'areas'>>
  onCategory: (next: string | null) => void
  onArea: (next: string) => void
  onRemove: () => void
  /** The session's paperclip — its Vault sheets (R7a). */
  sheets?: ReactNode
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
            : 'bg-(--area)/15 text-area'
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
      {sheets}
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
