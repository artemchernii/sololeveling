import { Fragment } from 'react'
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

/* Languages (mockup real2.html): a row per language with sessions in the
   last four weeks — its sessions THIS WEEK and in 4 WEEKS, two labelled
   columns, and its level. */
export function LanguagesTile({
  languages,
  week,
  levels,
  span,
}: {
  /** Only the languages with a session in four weeks. */
  languages: ReadonlyArray<Doc<'areas'>>
  week: ReadonlyArray<LanguageWeek>
  levels: ReadonlyArray<Level>
  span: string
}) {
  return (
    <Tile
      name="Languages"
      to="/languages"
      area={`var(--area-${languages[0].slug})`}
      icon={<Languages />}
      index={4}
      span={span}
    >
      <div className="grid grid-cols-[26px_minmax(0,1fr)_56px_56px_auto] items-center gap-x-2.5 gap-y-1.5">
        <span />
        <span />
        <Caps className="text-center">THIS WEEK</Caps>
        <Caps className="text-center">4 WEEKS</Caps>
        <span />
        {languages.map((a) => {
          const w = week.find((l) => l.slug === a.slug)
          const level = levels.find((l) => l.slug === a.slug)?.textValue
          const photo = languageByCode(a.lang)?.photo
          return (
            <Fragment key={a.slug}>
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  style={areaVars(a.slug)}
                  className="size-[26px] rounded-[7px] border border-lift/[0.09] object-cover"
                />
              ) : (
                <span />
              )}
              <span className="truncate font-mono text-[11.5px] font-medium tracking-[0.16em] text-foreground uppercase">
                {a.label}
              </span>
              <span
                data-testid={`language-${a.slug}-week`}
                className="text-center text-[18px] font-light tabular-nums"
              >
                {w?.week ?? 0}
              </span>
              <span
                data-testid={`language-${a.slug}-four`}
                className="text-center text-[18px] font-light text-ink-300 tabular-nums"
              >
                {w?.four ?? 0}
              </span>
              {level ? (
                <Badge className="bg-lav-400/10 text-lav-400">{level}</Badge>
              ) : (
                <span />
              )}
            </Fragment>
          )
        })}
      </div>
    </Tile>
  )
}
