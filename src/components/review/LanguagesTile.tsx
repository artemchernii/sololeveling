import { Languages } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Caps, CountUp, DayCells, Tile } from '@/components/review/parts'
import { areaVars } from '@/lib/areas'
import { languageByCode } from '@/lib/languages/catalog'

type LanguageWeek = FunctionReturnType<
  typeof api.aggregate.weekReview
>['week']['languages'][number]
type Level = FunctionReturnType<typeof api.aggregate.languageLevels>[number]

/* Languages: a card per language you track — its photo, its level, the
   week's classes, minutes and Vault sheets, and its days lit. No "of":
   classes have no target to be read against. */
export function LanguagesTile({
  languages,
  week,
  levels,
}: {
  languages: ReadonlyArray<Doc<'areas'>>
  week: ReadonlyArray<LanguageWeek>
  levels: ReadonlyArray<Level>
}) {
  const first = languages.at(0)?.slug
  return (
    <Tile
      name="Languages"
      to="/languages"
      area={first ? `var(--area-${first})` : 'var(--color-lav-400)'}
      icon={<Languages />}
      index={3}
      span={`col-span-2 lg:col-span-3 ${languages.length > 0 ? 'lg:row-span-2' : ''}`}
    >
      {languages.length === 0 ? (
        <Caps className="my-auto text-ink-500">0 LANGUAGES</Caps>
      ) : (
        languages.map((a) => {
          const w = week.find((l) => l.slug === a.slug)
          const level = levels.find((l) => l.slug === a.slug)?.textValue
          const photo = languageByCode(a.lang)?.photo
          return (
            <div
              key={a.slug}
              style={areaVars(a.slug)}
              className="flex flex-col gap-2 rounded-[10px] border border-lift/[0.09] bg-lift/[0.03] p-2.5"
            >
              <div className="flex items-center gap-2.5">
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    className="size-[30px] shrink-0 rounded-[8px] border border-lift/10 object-cover"
                  />
                ) : null}
                <Caps className="flex-1 truncate text-ink-200">{a.label}</Caps>
                {level ? (
                  <span className="rounded-full border border-current bg-lav-400/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-400 uppercase">
                    {level}
                  </span>
                ) : (
                  <span className="rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-ink-500 uppercase">
                    LEVEL MISSING
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-[18px] gap-y-1 font-mono text-[11px]">
                {(
                  [
                    ['CLASSES', w?.classes ?? 0],
                    ['MIN', w?.minutes ?? 0],
                    ['SHEETS', w?.sheets ?? 0],
                  ] as const
                ).map(([label, n]) => (
                  <span key={label}>
                    <span className="text-[22px] font-light tabular-nums">
                      <CountUp to={n} />
                    </span>{' '}
                    <span className="text-ink-500">{label}</span>
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                <DayCells
                  days={w?.days ?? [0, 0, 0, 0, 0, 0, 0]}
                  height="h-2"
                />
              </div>
            </div>
          )
        })
      )}
    </Tile>
  )
}
