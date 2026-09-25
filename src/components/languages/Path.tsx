import { useDayStarts } from '@/components/track/useDayStarts'
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, ChevronDown, Shuffle, Sparkles } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { DidButton } from '@/components/track/DidButton'
import { TrackPanel } from '@/components/track/TrackPanel'
import { agoLabel } from '@/lib/format'
import { nextCefr, parseCefr } from '@/lib/languages/catalog'
import type { Cefr } from '@/lib/languages/catalog'
import { nextTopic, pathFor, pathLevels } from '@/lib/languages/path'
import type { PathTopic, TopicProgress } from '@/lib/languages/path'

/* The built-in path (25 Sep): "I want suggestions, some data on Portuguese.
   I don't want to write a list myself — I need a helper."

   NEXT UP picks one topic for today (nextTopic). THE PATH shows every topic
   by level, each opening to what it is and sentences that use it. PRACTISED
   writes an exercise log; SOLID is his own word that he has it. Both land in
   his `drills` row for the topic, made the first time he touches it. */

type Progress = {
  of: (id: string) => TopicProgress | undefined
  today: (id: string) => number
  ready: boolean
}

function useProgress(slug: string): Progress {
  const drills = useQuery(api.drills.list, { area: slug })
  const dayStarts = useDayStarts()
  const days = useQuery(api.aggregate.drillDays, {
    area: slug,
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
  })
  const byRef = new Map<string, Doc<'drills'>>()
  for (const d of drills ?? []) if (d.ref) byRef.set(d.ref, d)
  const byDrill = new Map<
    Id<'drills'>,
    { days: Array<number>; total: number; lastAt: number }
  >(days?.rows.map((r) => [r.drillId, r]) ?? [])

  return {
    ready: drills !== undefined && days !== undefined,
    of: (id) => {
      const drill = byRef.get(id)
      if (!drill) return undefined
      const row = byDrill.get(drill._id)
      return {
        solid: drill.mark === 'solid',
        total: row?.total ?? 0,
        lastAt: row?.lastAt ?? null,
      }
    },
    today: (id) => {
      const drill = byRef.get(id)
      return drill ? (byDrill.get(drill._id)?.days.at(-1) ?? 0) : 0
    },
  }
}

function useLevel(slug: string): Cefr | null {
  const levels = useQuery(api.aggregate.languageLevels, { slugs: [slug] })
  return parseCefr(levels?.[0]?.textValue)
}

/* ------------------------------------------------------------ NEXT UP */

export function NextUp({
  slug,
  lang,
  delay = 0,
}: {
  slug: string
  lang: string | undefined
  delay?: number
}) {
  const path = pathFor(lang)
  const level = useLevel(slug)
  const progress = useProgress(slug)
  /* "Another one" — skipped for this visit only, never stored. */
  const [skipped, setSkipped] = useState<Array<string>>([])

  if (path.length === 0 || !progress.ready) return null

  const pick =
    nextTopic(path, level, (id) =>
      skipped.includes(id)
        ? { solid: true, total: 0, lastAt: null }
        : progress.of(id),
    ) ?? nextTopic(path, level, progress.of)

  return (
    <TrackPanel
      area={slug}
      delay={delay}
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3.5" />
          next up
        </span>
      }
      aside={
        pick ? (
          <button
            type="button"
            onClick={() => setSkipped((s) => [...s, pick.id])}
            className="motion-press inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase transition-colors hover:text-(--area)"
          >
            <Shuffle className="size-3" />
            another
          </button>
        ) : null
      }
    >
      {pick === null ? (
        <p className="text-[14px] text-ink-200">
          Everything at {level ?? 'A1'} and the level above is solid. Time to
          record your next level.
        </p>
      ) : (
        <div key={pick.id} className="motion-arrive flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-baseline gap-2">
              <span className="text-[24px] leading-tight font-light text-foreground">
                {pick.title}
              </span>
              <span className="rounded-[4px] bg-(--area)/15 px-1.5 py-0.5 font-mono text-[10px] text-(--area)">
                {pick.level}
              </span>
            </span>
            <span className="text-[13px] text-ink-400">{pick.en}</span>
          </div>
          <TopicBody topic={pick} />
          <TopicActions slug={slug} topic={pick} progress={progress} />
        </div>
      )}
    </TrackPanel>
  )
}

/* ------------------------------------------------------------ THE PATH */

export function Path({
  slug,
  lang,
  delay = 0,
}: {
  slug: string
  lang: string | undefined
  delay?: number
}) {
  const path = pathFor(lang)
  const level = useLevel(slug)
  const progress = useProgress(slug)
  const levels = pathLevels(path)
  const start: Cefr | undefined =
    level && levels.includes(level)
      ? level
      : level && nextCefr(level) && levels.includes(nextCefr(level) as Cefr)
        ? (nextCefr(level) as Cefr)
        : levels[0]
  const [shown, setShown] = useState<Cefr | undefined>(undefined)
  const [open, setOpen] = useState<string | null>(null)

  if (path.length === 0) return null
  const tab = shown ?? start

  return (
    <TrackPanel area={slug} title="the path" delay={delay}>
      <div className="flex flex-wrap gap-1.5">
        {levels.map((l) => {
          const topics = path.filter((t) => t.level === l)
          return (
            <button
              key={l}
              type="button"
              onClick={() => setShown(l)}
              aria-pressed={l === tab}
              className={`motion-press flex flex-col items-center gap-1 rounded-[12px] px-3 py-1.5 ring-1 transition-colors ${
                l === tab
                  ? 'bg-(--area)/18 text-foreground ring-(--area)/50'
                  : 'text-ink-400 ring-lift/10 hover:text-foreground hover:ring-(--area)/30'
              }`}
            >
              <span className="font-mono text-[12px]">
                {l}
                {l === level ? ' ·you' : ''}
              </span>
              {/* A dot per topic, lit when solid — a picture of the level,
                  not a number of it. */}
              <span className="flex gap-[2px]" aria-hidden>
                {topics.map((t) => (
                  <span
                    key={t.id}
                    className={`size-[4px] rounded-full ${
                      progress.of(t.id)?.solid
                        ? 'bg-state-good'
                        : (progress.of(t.id)?.total ?? 0) > 0
                          ? 'bg-(--area)'
                          : 'bg-lift/15'
                    }`}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <ul key={tab} className="flex flex-col">
        {path
          .filter((t) => t.level === tab)
          .map((topic, i) => (
            <TopicRow
              key={topic.id}
              slug={slug}
              topic={topic}
              progress={progress}
              open={open === topic.id}
              onToggle={() =>
                setOpen((o) => (o === topic.id ? null : topic.id))
              }
              delay={i * 35}
            />
          ))}
      </ul>
    </TrackPanel>
  )
}

function TopicRow({
  slug,
  topic,
  progress,
  open,
  onToggle,
  delay,
}: {
  slug: string
  topic: PathTopic
  progress: Progress
  open: boolean
  onToggle: () => void
  delay: number
}) {
  const p = progress.of(topic.id)
  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className="motion-arrive border-b border-lift/[0.06] last:border-b-0"
    >
      <div className="flex min-h-12 items-center gap-3 py-1.5">
        <span
          aria-label={p?.solid ? 'solid' : p?.total ? 'practised' : 'not yet'}
          className={`grid size-5 shrink-0 place-items-center rounded-full ${
            p?.solid
              ? 'bg-state-good/20 text-state-good ring-1 ring-state-good/50'
              : p?.total
                ? 'bg-(--area)/25 ring-1 ring-(--area)/50'
                : 'ring-1 ring-lift/20'
          }`}
        >
          {p?.solid ? <Check className="size-3" /> : null}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="flex min-w-0 flex-col">
            <span
              className={`line-clamp-2 text-[14px] leading-snug transition-colors group-hover:text-foreground sm:truncate ${
                p?.solid ? 'text-ink-400' : 'text-ink-100'
              }`}
            >
              {topic.title}
            </span>
            <span className="line-clamp-1 text-[11.5px] text-ink-500">
              {topic.en}
            </span>
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-ink-600 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-600 md:inline">
          {p && p.total > 0 && p.lastAt !== null
            ? `${p.total}× · ${agoLabel(p.lastAt)}`
            : ''}
        </span>
        <TopicActions slug={slug} topic={topic} progress={progress} compact />
      </div>
      {open ? (
        <div className="motion-arrive pb-3 pl-8">
          <TopicBody topic={topic} />
        </div>
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------ shared */

function TopicBody({ topic }: { topic: PathTopic }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13.5px] leading-relaxed text-ink-300">
        {topic.explain}
      </p>
      <ul className="flex flex-col gap-1.5 border-l-2 border-(--area)/40 pl-3">
        {topic.examples.map((ex) => (
          <li key={ex.text} className="flex flex-col">
            <span className="text-[14px] text-foreground">{ex.text}</span>
            <span className="text-[12px] text-ink-500 italic">{ex.gloss}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TopicActions({
  slug,
  topic,
  progress,
  compact = false,
}: {
  slug: string
  topic: PathTopic
  progress: Progress
  compact?: boolean
}) {
  const practise = useMutation(api.drills.practiseTopic)
  const mark = useMutation(api.drills.markTopic)
  const solid = progress.of(topic.id)?.solid ?? false
  const args = { area: slug, ref: topic.id, title: topic.title }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <DidButton
        today={progress.today(topic.id)}
        label="practised"
        onDid={() => practise(args)}
      />
      <button
        type="button"
        onClick={() => void mark({ ...args, mark: solid ? null : 'solid' })}
        aria-pressed={solid}
        title={solid ? 'Solid — press to undo' : 'Mark as solid: you have it'}
        className={`motion-press inline-flex h-7 items-center justify-center gap-1 rounded-full font-mono text-[10.5px] tracking-[0.12em] uppercase ring-1 transition-colors ring-inset ${
          compact ? 'w-7 sm:w-auto sm:px-3' : 'px-3'
        } ${
          solid
            ? 'bg-state-good/20 text-state-good ring-state-good/50'
            : 'text-ink-500 ring-lift/15 hover:bg-state-good/10 hover:text-state-good hover:ring-state-good/40'
        }`}
      >
        <Check className={`size-3 ${solid ? 'motion-draw' : ''}`} />
        <span className={compact ? 'hidden sm:inline' : ''}>solid</span>
      </button>
    </span>
  )
}
