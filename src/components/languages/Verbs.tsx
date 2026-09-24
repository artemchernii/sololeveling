import { useState } from 'react'
import { Search, X } from 'lucide-react'

import { TrackPanel } from '@/components/track/TrackPanel'
import { verbsFor } from '@/lib/languages/verbs'
import type { Verb } from '@/lib/languages/verbs/types'

/* Verbs (25 Sep): "a list of verbs and conjugation + translation of those
   words." The verbs you use most, each with what it means; press one and its
   tables open above the list. Search matches the verb or its meaning, so
   "to know" finds saber and conhecer both.

   Reference content — nothing here reads or writes his rows. */

const SHOWN = 24

export function Verbs({
  lang,
  area,
  delay = 0,
}: {
  lang: string | undefined
  area: string
  delay?: number
}) {
  const verbs = verbsFor(lang)
  const [query, setQuery] = useState('')
  const [onlyIrregular, setOnlyIrregular] = useState(false)
  const [open, setOpen] = useState<string | null>(verbs.at(0)?.verb ?? null)
  const [all, setAll] = useState(false)

  if (verbs.length === 0) return null

  const q = query.trim().toLowerCase()
  const matching = verbs.filter(
    (v) =>
      (!onlyIrregular || v.irregular) &&
      (q === '' ||
        v.verb.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q)),
  )
  const shown = all || q !== '' ? matching : matching.slice(0, SHOWN)
  const selected = verbs.find((v) => v.verb === open) ?? null
  const english = lang === 'en'

  return (
    <TrackPanel
      area={area}
      title="verbs"
      delay={delay}
      aside={
        <span className="flex items-center gap-2">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={english ? 'verb or palavra' : 'verb or meaning'}
              aria-label="Find a verb"
              className="w-36 rounded-full border border-lift/12 bg-sink/20 py-1 pr-3 pl-8 text-[12.5px] text-foreground outline-none placeholder:text-ink-600 focus:border-(--area)/50 sm:w-48"
            />
          </label>
          {!english ? (
            <button
              type="button"
              onClick={() => setOnlyIrregular((x) => !x)}
              aria-pressed={onlyIrregular}
              className={`motion-press hidden rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase ring-1 transition-colors ring-inset sm:inline ${
                onlyIrregular
                  ? 'bg-(--area)/18 text-(--area) ring-(--area)/45'
                  : 'text-ink-500 ring-lift/12 hover:text-ink-200'
              }`}
            >
              irregular
            </button>
          ) : null}
        </span>
      }
    >
      {selected ? (
        <Tables verb={selected} onClose={() => setOpen(null)} />
      ) : null}

      {shown.length === 0 ? (
        <p className="text-[13px] text-ink-500">No verb matches “{query}”.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((v) => {
            const on = v.verb === open
            return (
              <button
                key={v.verb}
                type="button"
                onClick={() => setOpen(on ? null : v.verb)}
                aria-pressed={on}
                className={`motion-press flex min-w-0 flex-col items-start rounded-[12px] px-3 py-2 text-left ring-1 transition-colors ring-inset ${
                  on
                    ? 'bg-(--area)/18 ring-(--area)/50'
                    : 'ring-lift/[0.07] hover:bg-lift/[0.05] hover:ring-(--area)/30'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`text-[14.5px] ${on ? 'text-(--area)' : 'text-foreground'}`}
                  >
                    {v.verb}
                  </span>
                  {v.irregular && !english ? (
                    <span
                      title="irregular"
                      className="size-1.5 rounded-full bg-(--area)"
                    />
                  ) : null}
                </span>
                <span className="w-full truncate text-[11.5px] text-ink-500">
                  {v.meaning}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {q === '' && matching.length > SHOWN ? (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="motion-press self-start font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase transition-colors hover:text-(--area)"
        >
          {all ? 'show fewer' : `show all ${matching.length}`}
        </button>
      ) : null}
    </TrackPanel>
  )
}

function Tables({ verb, onClose }: { verb: Verb; onClose: () => void }) {
  return (
    <div
      key={verb.verb}
      className="motion-arrive flex flex-col gap-3 rounded-[18px] bg-(--area)/[0.07] p-4 ring-1 ring-(--area)/25 ring-inset"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-col">
          <span className="motion-pop text-[30px] leading-tight font-light text-(--area)">
            {verb.verb}
          </span>
          <span className="text-[13px] text-ink-300">{verb.meaning}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="motion-press grid size-7 place-items-center rounded-full text-ink-500 transition-colors hover:bg-lift/10 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div
        className={`grid gap-3 ${
          /* Written out: Tailwind only builds the classes it can read. */
          verb.tenses.length >= 4
            ? 'sm:grid-cols-2 xl:grid-cols-4'
            : verb.tenses.length === 3
              ? 'sm:grid-cols-3'
              : ''
        }`}
      >
        {verb.tenses.map((t, i) => (
          <div
            key={t.name}
            style={{ animationDelay: `${i * 60}ms` }}
            className="motion-arrive flex flex-col gap-1.5 rounded-[14px] bg-background/40 p-3"
          >
            <span className="flex flex-col">
              <span className="font-mono text-[10.5px] tracking-[0.12em] text-(--area) uppercase">
                {t.name}
              </span>
              <span className="text-[11px] text-ink-500">{t.en}</span>
            </span>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {t.rows.map(([person, form]) => (
                <div key={person} className="contents">
                  <dt className="text-[12px] text-ink-500">{person}</dt>
                  <dd className="text-[14px] text-foreground">{form}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}
