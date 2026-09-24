import type { Cefr, LanguageCode } from './catalog'
import { CEFR, nextCefr } from './catalog'
import { DE } from './paths/de'
import { EN } from './paths/en'
import { PT_PT } from './paths/pt-PT'

/* A built-in learning path: the grammar each CEFR level asks for, as topics
   (25 Sep). Reference content — his progress on a topic lives in his own
   `drills` row, found by `ref` = the topic's id. */

export type PathTopic = {
  /** Permanent: his progress is stored against it. */
  id: string
  level: Cefr
  /** The name in the language itself. */
  title: string
  /** A gloss in English — what it is, in a few words. */
  en: string
  explain: string
  /** A sentence in the language, and what it means or notes. */
  examples: ReadonlyArray<{ text: string; gloss: string }>
}

const PATHS: Partial<Record<LanguageCode, ReadonlyArray<PathTopic>>> = {
  'pt-PT': PT_PT,
  en: EN,
  de: DE,
}

export function pathFor(code: string | undefined): ReadonlyArray<PathTopic> {
  return (code && PATHS[code as LanguageCode]) || []
}

/** What he has done with a topic, read from his rows. */
export type TopicProgress = {
  solid: boolean
  /** Times practised in the window aggregate.drillDays read. */
  total: number
  lastAt: number | null
}

/**
 * The one topic to suggest next. Walks his level, then the level above it
 * (A1 when no level is recorded): the first topic not yet solid and never
 * practised; failing that, the not-solid one practised longest ago. Null
 * when both levels are solid — time to record the next level.
 *
 * A pick, not a number: nothing here is counted onto the screen.
 */
export function nextTopic(
  path: ReadonlyArray<PathTopic>,
  level: Cefr | null,
  progress: (id: string) => TopicProgress | undefined,
): PathTopic | null {
  const here = level ?? 'A1'
  const levels = [here, nextCefr(here)].filter((l): l is Cefr => l !== null)
  const open = levels.flatMap((l) =>
    path.filter((t) => t.level === l && progress(t.id)?.solid !== true),
  )
  const fresh = open.find((t) => (progress(t.id)?.total ?? 0) === 0)
  if (fresh) return fresh
  let pick: PathTopic | null = null
  let oldest = Infinity
  for (const t of open) {
    const at = progress(t.id)?.lastAt ?? 0
    if (at < oldest) {
      oldest = at
      pick = t
    }
  }
  return pick
}

/** The levels a path has topics for, in ladder order. */
export function pathLevels(path: ReadonlyArray<PathTopic>): Array<Cefr> {
  return CEFR.filter((l) => path.some((t) => t.level === l))
}
