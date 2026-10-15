import { Languages } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Badge, Caps, Tile } from '@/components/review/parts'
import { areaVars } from '@/lib/areas'
import { languageByCode } from '@/lib/languages/catalog'

type LanguageWeek = FunctionReturnType<
  typeof api.aggregate.weekReview
>['languages'][number]
type Level = FunctionReturnType<typeof api.aggregate.languageLevels>[number]

/* Languages (mockup real.html): a line per language with sessions in the
   last four weeks — this week beside the four, and its level. */
export function LanguagesTile({
  languages,
  week,
  levels,
}: {
  /** Only the languages with a session in four weeks. */
  languages: ReadonlyArray<Doc<'areas'>>
  week: ReadonlyArray<LanguageWeek>
  levels: ReadonlyArray<Level>
}) {
  return (
    <Tile
      name="Languages"
      to="/languages"
      area={`var(--area-${languages[0].slug})`}
      icon={<Languages />}
      index={4}
      span="col-span-2 lg:col-span-2"
    >
      {languages.map((a) => {
        const w = week.find((l) => l.slug === a.slug)
        const level = levels.find((l) => l.slug === a.slug)?.textValue
        const photo = languageByCode(a.lang)?.photo
        return (
          <div
            key={a.slug}
            style={areaVars(a.slug)}
            data-testid={`language-${a.slug}`}
            className="flex items-center gap-2.5"
          >
            {photo ? (
              <img
                src={photo}
                alt=""
                className="size-[30px] shrink-0 rounded-[8px] border border-lift/[0.09] object-cover"
              />
            ) : null}
            <Caps className="flex-1 truncate text-ink-200">{a.label}</Caps>
            <span className="font-mono text-[10.5px] text-ink-300">
              <b className="text-[15px] font-normal text-foreground">
                {w?.week ?? 0}
              </b>{' '}
              · {w?.four ?? 0} in 4 weeks
            </span>
            {level ? (
              <Badge className="bg-lav-400/10 text-lav-400">{level}</Badge>
            ) : null}
          </div>
        )
      })}
    </Tile>
  )
}
