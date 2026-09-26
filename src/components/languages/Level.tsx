import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowUpRight } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { TrackPanel } from '@/components/track/TrackPanel'
import { whenLabel } from '@/lib/format'
import {
  CEFR,
  CEFR_MEANING,
  nextCefr,
  parseCefr,
} from '@/lib/languages/catalog'
import type { Cefr } from '@/lib/languages/catalog'

/* The level, made to mean something (25 Sep): "when I see B1 I ask myself
   WTF is this and what is the value?"

   The CEFR ladder with him on it and his target ringed, what his rung means
   in plain words, and what the step to the next one asks. The level itself
   is still the latest `cefr_level:<slug>` state row — recorded, never worked
   out — and changing it appends a new one (state.record).

   A rung is a place, not a grade: the rungs below his are drawn as passed,
   in the language's colour, never as a score. */
export function Level({ slug, delay = 0 }: { slug: string; delay?: number }) {
  const levels = useQuery(api.aggregate.languageLevels, { slugs: [slug] })
  const goals = useQuery(api.goals.listActive, {})
  const record = useMutation(api.state.record)
  const [editing, setEditing] = useState(false)

  const row = levels?.[0]
  const level = parseCefr(row?.textValue)
  /* A CEFR target is words on a goal ("B2"), never targetValue. */
  const target = parseCefr(
    goals?.find((g) => g.area === slug && g.targetLabel !== undefined)
      ?.targetLabel,
  )
  const choosing = editing || (row !== undefined && level === null)

  function choose(rung: Cefr) {
    setEditing(false)
    if (rung === level) return
    void record({
      area: slug,
      key: `cefr_level:${slug}`,
      textValue: rung,
      recordedAt: Date.now(),
    })
  }

  const meaning = level ? CEFR_MEANING[level] : null
  const next = level ? nextCefr(level) : null

  return (
    <TrackPanel
      area={slug}
      title="your level"
      delay={delay}
      aside={
        row === undefined ? null : (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="motion-press font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase transition-colors hover:text-area"
          >
            {choosing ? 'cancel' : 'change'}
          </button>
        )
      }
    >
      <div className="flex items-center" role="list">
        {CEFR.map((rung, i) => {
          const here = rung === level
          const passed =
            level !== null && CEFR.indexOf(rung) < CEFR.indexOf(level)
          const aim = rung === target
          return (
            <div
              key={rung}
              className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}
              role="listitem"
            >
              {i > 0 ? (
                <span
                  aria-hidden
                  className={`h-[2px] flex-1 ${passed || here ? 'bg-(--area)/70' : 'bg-lift/10'}`}
                />
              ) : null}
              <button
                type="button"
                disabled={!choosing}
                onClick={() => choose(rung)}
                aria-current={here ? 'step' : undefined}
                title={`${rung} · ${CEFR_MEANING[rung].name}${aim ? ' · your target' : ''}`}
                className={`relative grid shrink-0 place-items-center rounded-full font-mono transition-all ${
                  here
                    ? 'motion-pop size-12 bg-(--area) text-[15px] font-medium text-background shadow-[0_0_24px_-4px_var(--area)]'
                    : passed
                      ? 'size-8 bg-(--area)/25 text-[11px] text-area'
                      : 'size-8 bg-lift/[0.05] text-[11px] text-ink-500'
                } ${aim && !here ? 'ring-2 ring-(--area) ring-offset-2 ring-offset-transparent' : ''} ${
                  choosing
                    ? 'cursor-pointer hover:scale-110 hover:bg-(--area)/40 hover:text-foreground'
                    : ''
                }`}
              >
                {rung}
              </button>
            </div>
          )
        })}
      </div>

      {choosing || row === undefined ? (
        <p className="motion-arrive text-[13px] text-ink-400">
          {row === undefined ? '' : 'Tap the rung you are on now.'}
        </p>
      ) : meaning && level ? (
        <div className="motion-arrive flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="flex items-baseline gap-2">
              <span className="text-[22px] font-light text-area">
                {level} · {meaning.name}
              </span>
              {row.recordedAt !== null ? (
                <span className="font-mono text-[10.5px] text-ink-600">
                  as of {whenLabel(row.recordedAt)}
                </span>
              ) : null}
            </span>
            <p className="text-[13.5px] leading-relaxed text-ink-200">
              {meaning.can}
            </p>
          </div>
          {next ? (
            <div className="flex gap-2.5 rounded-[14px] bg-(--area)/8 p-3 ring-1 ring-(--area)/20 ring-inset">
              <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-area" />
              <p className="text-[13px] leading-relaxed text-ink-300">
                <span className="font-mono text-[11px] tracking-[0.12em] text-area uppercase">
                  to reach {next}
                  {target === next ? ' · your target' : ''}
                </span>
                <br />
                {CEFR_MEANING[level].next}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </TrackPanel>
  )
}
